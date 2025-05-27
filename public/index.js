document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const watchBtn = document.getElementById('watchBtn');
  const streamBtn = document.getElementById('streamBtn');
  const videoContainer = document.getElementById('videoContainer');
  const liveVideo = document.getElementById('liveVideo');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const exitBtn = document.getElementById('exitBtn');
  const liveIndicator = document.getElementById('liveIndicator');
  const streamStatus = document.getElementById('streamStatus');
  const permissionModal = document.getElementById('permissionModal');
  const allowBtn = document.getElementById('allowBtn');
  const denyBtn = document.getElementById('denyBtn');
  const streamActiveModal = document.getElementById('streamActiveModal');
  const closeModalBtn = document.getElementById('closeModalBtn');

  // WebSocket and WebRTC variables
  let ws;
  let peerConnection;
  let localStream;
  let isBroadcaster = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;

  // Initialize WebSocket connection
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to signaling server');
      reconnectAttempts = 0;
      if (isBroadcaster) {
        ws.send(JSON.stringify({ type: 'broadcaster' }));
      }
    };

    ws.onmessage = async (message) => {
      try {
        const data = JSON.parse(message.data);
        
        if (data.type === 'error' && data.message === 'Broadcaster already exists') {
          alert('Someone is already broadcasting. Only one broadcaster is allowed.');
          stopStreaming();
          return;
        }

        if (data.type === 'answer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.type === 'candidate') {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate:', e);
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(1000 * (reconnectAttempts + 1), 5000);
        console.log(`Attempting reconnect in ${delay}ms...`);
        setTimeout(initWebSocket, delay);
        reconnectAttempts++;
      }
    };
  }

  // Start streaming as broadcaster
  async function startStreaming() {
    try {
      // Get high quality media
      const constraints = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          facingMode: { ideal: 'environment' },
          advanced: [
            { width: 1920, height: 1080 },
            { aspectRatio: 16/9 }
          ]
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      // Try to get high quality stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
        .catch(async () => {
          // Fallback to lower quality if needed
          return await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
        });

      localStream = stream;
      videoContainer.classList.remove('hidden');
      liveVideo.srcObject = localStream;
      liveIndicator.classList.remove('hidden');
      
      // Set video quality
      if (liveVideo.videoWidth) {
        liveVideo.width = liveVideo.videoWidth;
        liveVideo.height = liveVideo.videoHeight;
      }

      // Notify server we're the broadcaster
      isBroadcaster = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'broadcaster' }));
      }
      
      // Update UI
      streamStatus.innerHTML = '<p>You are currently streaming live!</p>';
      streamStatus.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
      streamStatus.style.borderLeft = '4px solid var(--success-color)';
      streamBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Streaming';
      
      // Setup WebRTC with high quality settings
      setupWebRTC();

    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Could not access camera or microphone. Please check your permissions.');
      stopStreaming();
    }
  }

  // Setup WebRTC with quality settings
  function setupWebRTC() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      iceTransportPolicy: 'relay', // For better quality in restrictive networks
      bundlePolicy: 'max-bundle', // For better performance
      rtcpMuxPolicy: 'require' // For better performance
    };

    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks with quality settings
    localStream.getTracks().forEach(track => {
      if (track.kind === 'video') {
        const sender = peerConnection.addTrack(track, localStream);
        // Set video encoding parameters
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
          parameters.encodings = [{}];
        }
        parameters.encodings[0].maxBitrate = 2500000; // 2.5 Mbps
        parameters.encodings[0].scaleResolutionDownBy = 1.0; // Full resolution
        sender.setParameters(parameters);
      } else {
        peerConnection.addTrack(track, localStream);
      }
    });

    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        console.log('Sending ICE candidate to viewer');
        ws.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate,
          target: 'viewer'
        }));
      }
    };

    // Connection state handling
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      switch (peerConnection.connectionState) {
        case 'connected':
          console.log('Successfully connected to viewer');
          break;
        case 'disconnected':
        case 'failed':
          console.log('Disconnected from viewer');
          break;
      }
    };

    // Create high quality offer for viewers
    console.log('Creating offer for viewers');
    peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    })
    .then(offer => {
      console.log('Setting local description');
      return peerConnection.setLocalDescription(offer);
    })
    .then(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('Sending offer to viewers');
        ws.send(JSON.stringify({
          type: 'offer',
          offer: peerConnection.localDescription,
          target: 'viewer'
        }));
      }
    })
    .catch(error => {
      console.error('Error creating offer:', error);
      alert('Error setting up stream. Please try again.');
      stopStreaming();
    });
  }

  // Stop streaming
  function stopStreaming() {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    
    if (isBroadcaster && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disconnect' }));
      isBroadcaster = false;
    }
    
    videoContainer.classList.add('hidden');
    liveIndicator.classList.add('hidden');
    
    streamStatus.innerHTML = '<p>Live stream is currently offline</p>';
    streamStatus.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
    streamStatus.style.borderLeft = '4px solid var(--error-color)';
    streamBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Start Live Stream';
  }

  // Event listeners
  streamBtn.addEventListener('click', function() {
    if (isBroadcaster) {
      stopStreaming();
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      permissionModal.classList.remove('hidden');
    } else {
      alert('Not connected to server. Please refresh the page.');
    }
  });

  watchBtn.addEventListener('click', function() {
    window.location.href = '/viewer';
  });

  allowBtn.addEventListener('click', function() {
    permissionModal.classList.add('hidden');
    startStreaming();
  });

  denyBtn.addEventListener('click', function() {
    permissionModal.classList.add('hidden');
  });

  closeModalBtn.addEventListener('click', function() {
    streamActiveModal.classList.add('hidden');
  });

  fullscreenBtn.addEventListener('click', function() {
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(err => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  });

  exitBtn.addEventListener('click', function() {
    stopStreaming();
  });

  // Initialize
  initWebSocket();
});
