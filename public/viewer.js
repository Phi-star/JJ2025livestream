document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const videoContainer = document.getElementById('videoContainer');
  const liveVideo = document.getElementById('liveVideo');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const exitBtn = document.getElementById('exitBtn');
  const liveIndicator = document.getElementById('liveIndicator');
  const streamStatus = document.getElementById('streamStatus');

  // WebSocket and WebRTC variables
  let ws;
  let peerConnection;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000;

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
      ws.send(JSON.stringify({ type: 'viewer' }));
    };

    ws.onmessage = async (message) => {
      try {
        const data = JSON.parse(message.data);
        
        if (data.type === 'streamStatus') {
          if (data.isLive) {
            streamStatus.innerHTML = '<p>Live stream found! Connecting...</p>';
            streamStatus.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            streamStatus.style.borderLeft = '4px solid var(--success-color)';
          } else {
            streamStatus.innerHTML = '<p>Live stream is currently offline</p>';
            streamStatus.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
            streamStatus.style.borderLeft = '4px solid var(--error-color)';
            if (peerConnection) {
              peerConnection.close();
              peerConnection = null;
            }
            videoContainer.classList.add('hidden');
          }
        } else if (data.type === 'offer') {
          await handleOffer(data);
        } else if (data.type === 'candidate') {
          if (peerConnection) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.error('Error adding ICE candidate:', e);
            }
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      streamStatus.innerHTML = '<p>Connection error. Trying to reconnect...</p>';
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(reconnectDelay * (reconnectAttempts + 1), 5000);
        setTimeout(initWebSocket, delay);
        reconnectAttempts++;
      } else {
        streamStatus.innerHTML = '<p>Failed to connect to server. Please refresh.</p>';
      }
    };
  }

  // Handle WebRTC offer from broadcaster
  async function handleOffer(data) {
    console.log('Received offer, setting up WebRTC');
    try {
      if (peerConnection) {
        peerConnection.close();
      }

      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      };

      peerConnection = new RTCPeerConnection(configuration);

      // Configure for high quality video
      peerConnection.addTransceiver('video', {
        direction: 'recvonly',
        streams: [1] // High priority
      });

      peerConnection.addTransceiver('audio', {
        direction: 'recvonly'
      });

      // When we receive a track
      peerConnection.ontrack = (event) => {
        console.log('Received track:', event.track.kind);
        if (event.streams && event.streams[0]) {
          liveVideo.srcObject = event.streams[0];
          
          // Auto-show in fullscreen when stream starts
          videoContainer.classList.remove('hidden');
          liveIndicator.classList.remove('hidden');
          
          // Request fullscreen
          if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen().catch(e => {
              console.log('Fullscreen error:', e);
            });
          }
          
          // Auto-play with high quality
          liveVideo.play()
            .then(() => {
              console.log('Video playback started');
              // Set video quality preferences
              if (liveVideo.videoWidth) {
                liveVideo.width = liveVideo.videoWidth;
                liveVideo.height = liveVideo.videoHeight;
              }
              
              // Prioritize high quality
              if (typeof liveVideo.setAttribute === 'function') {
                liveVideo.setAttribute('playsinline', 'false');
                liveVideo.setAttribute('preload', 'auto');
              }
            })
            .catch(error => {
              console.error('Video play error:', error);
              alert('Please allow video autoplay to view the stream');
            });
        }
      };

      // ICE candidate handler
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'candidate',
            candidate: event.candidate,
            target: 'broadcaster'
          }));
        }
      };

      // Connection state handling
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        switch (peerConnection.connectionState) {
          case 'connected':
            streamStatus.innerHTML = '<p>Successfully connected!</p>';
            break;
          case 'disconnected':
          case 'failed':
            streamStatus.innerHTML = '<p>Disconnected from stream</p>';
            break;
        }
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'answer',
          answer: answer,
          target: 'broadcaster'
        }));
      }
    } catch (error) {
      console.error('Error handling offer:', error);
      streamStatus.innerHTML = '<p>Error connecting to stream. Please refresh.</p>';
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
    }
  }

  // Event listeners
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(e => {
        console.log('Fullscreen error:', e);
      });
    } else {
      document.exitFullscreen();
    }
  });

  exitBtn.addEventListener('click', () => {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    videoContainer.classList.add('hidden');
    liveIndicator.classList.add('hidden');
    if (liveVideo.srcObject) {
      liveVideo.srcObject.getTracks().forEach(track => track.stop());
      liveVideo.srcObject = null;
    }
  });

  // Initialize
  initWebSocket();
});
