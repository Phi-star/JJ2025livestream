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
        ws = new WebSocket(`${protocol}//${host}`);

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
                console.log(`Reconnecting in ${delay}ms...`);
                setTimeout(initWebSocket, delay);
                reconnectAttempts++;
            } else {
                alert('Connection lost. Please refresh the page.');
            }
        };
    }

    // Start streaming as broadcaster
    async function startStreaming() {
        try {
            // Get available cameras
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            let constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            };

            // Try to get back camera if available
            if (videoDevices.length > 1) {
                constraints.video.facingMode = { exact: 'environment' };
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints)
                .catch(async () => {
                    // Fallback to any camera if back camera fails
                    delete constraints.video.facingMode;
                    return await navigator.mediaDevices.getUserMedia(constraints);
                });

            localStream = stream;
            videoContainer.classList.remove('hidden');
            liveVideo.srcObject = localStream;
            liveIndicator.classList.remove('hidden');
            
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
            
            // Setup WebRTC
            setupWebRTC();

        } catch (error) {
            console.error('Error accessing media devices:', error);
            alert('Could not access camera or microphone. Please check your permissions.');
            stopStreaming();
        }
    }

    // Setup WebRTC peer connection
    function setupWebRTC() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        peerConnection = new RTCPeerConnection(configuration);

        // Add local stream to connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // ICE candidate handler
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && ws.readyState === WebSocket.OPEN) {
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
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'offer',
                        offer: peerConnection.localDescription,
                        target: 'viewer'
                    }));
                }
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
