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

    // Initialize WebSocket connection
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        ws = new WebSocket(`${protocol}//${host}`);

        ws.onopen = () => {
            console.log('Connected to signaling server');
        };

        ws.onmessage = async (message) => {
            const data = JSON.parse(message.data);
            
            if (data.type === 'offer') {
                if (isBroadcaster) return;
                
                // This would be for viewer mode (not used in broadcaster)
            } else if (data.type === 'answer') {
                // Handle answer from viewer
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
            } else if (data.type === 'candidate') {
                // Add ICE candidate
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error('Error adding ICE candidate:', e);
                }
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from signaling server');
            if (isBroadcaster) {
                stopStreaming();
            }
        };
    }

    // Start streaming as broadcaster
    async function startStreaming() {
        try {
            // Get user media (both front and back camera if available)
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            let stream;
            
            if (videoDevices.length > 1) {
                // Try to get back camera
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { exact: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: true
                });
            } else {
                // Fallback to any camera
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: true
                });
            }

            localStream = stream;
            videoContainer.classList.remove('hidden');
            liveVideo.srcObject = localStream;
            liveIndicator.classList.remove('hidden');
            
            // Notify server we're the broadcaster
            isBroadcaster = true;
            ws.send(JSON.stringify({ type: 'broadcaster' }));
            
            // Update UI
            streamStatus.innerHTML = '<p>You are currently streaming live!</p>';
            streamStatus.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            streamStatus.style.borderLeft = '4px solid var(--success-color)';
            streamBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Streaming';
            
            // Setup WebRTC
            setupWebRTC();

        } catch (error) {
            console.error('Error accessing media devices:', error);
            alert('Could not access camera or microphone. Please check your permissions.');
        }
    }

    // Setup WebRTC peer connection
    function setupWebRTC() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
                // Add your TURN servers here if needed
            ]
        };

        peerConnection = new RTCPeerConnection(configuration);

        // Add local stream to connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // ICE candidate handler
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate,
                    target: 'viewer'
                }));
            }
        };

        // Create offer for viewers
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                ws.send(JSON.stringify({
                    type: 'offer',
                    offer: peerConnection.localDescription,
                    target: 'viewer'
                }));
            })
            .catch(error => {
                console.error('Error creating offer:', error);
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
        
        if (isBroadcaster) {
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

        // Check if someone is already streaming
        if (ws && ws.readyState === WebSocket.OPEN) {
            permissionModal.classList.remove('hidden');
        } else {
            alert('Not connected to server. Please refresh the page.');
        }
    });

    watchBtn.addEventListener('click', function() {
        window.location.href = '/viewer.html';
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
