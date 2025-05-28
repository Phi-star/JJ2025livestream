document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const liveVideo = document.getElementById('liveVideo');
    const streamStatus = document.getElementById('streamStatus');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const muteBtn = document.getElementById('muteBtn');

    // WebRTC Variables
    let peerConnection;
    let ws;
    let isMuted = false;

    // Initialize WebSocket Connection
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to signaling server');
            updateStatus('Connected - Waiting for stream...', 'info');
            ws.send(JSON.stringify({ type: 'viewer' }));
        };

        ws.onmessage = async (message) => {
            try {
                const data = JSON.parse(message.data);
                
                if (data.type === 'offer') {
                    console.log('Received offer from broadcaster');
                    await handleOffer(data);
                } 
                else if (data.type === 'candidate') {
                    console.log('Received ICE candidate');
                    if (peerConnection && data.candidate) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                    }
                }
                else if (data.type === 'streamStatus') {
                    updateStatus(data.isLive ? 'Live stream available!' : 'No active stream', 
                                data.isLive ? 'success' : 'warning');
                }
            } catch (error) {
                console.error('Error handling message:', error);
                updateStatus('Error processing stream data', 'error');
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatus('Connection error', 'error');
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            updateStatus('Disconnected - Retrying...', 'warning');
            setTimeout(initWebSocket, 3000);
        };
    }

    // Handle the WebRTC Offer
    async function handleOffer(offerData) {
        try {
            updateStatus('Connecting to stream...', 'info');
            
            // Create PeerConnection with proper configuration
            peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require'
            });

            // When stream arrives
            peerConnection.ontrack = (event) => {
                console.log('Received stream tracks:', event.streams);
                if (event.streams && event.streams[0]) {
                    // Set the video source
                    liveVideo.srcObject = event.streams[0];
                    
                    // Attempt to play the video
                    const playPromise = liveVideo.play();
                    
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            updateStatus('Watching live!', 'success');
                            // Auto fullscreen on desktop
                            if (!/Mobi|Android/i.test(navigator.userAgent)) {
                                document.documentElement.requestFullscreen()
                                    .catch(e => console.log('Fullscreen error:', e));
                            }
                        }).catch(error => {
                            console.error('Playback failed:', error);
                            updateStatus('Click to allow video playback', 'error');
                        });
                    }
                }
            };

            // ICE Candidate handling
            peerConnection.onicecandidate = (event) => {
                if (event.candidate && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'candidate',
                        candidate: event.candidate,
                        target: 'broadcaster'
                    }));
                }
            };

            // Connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', peerConnection.connectionState);
                switch (peerConnection.connectionState) {
                    case 'connected':
                        updateStatus('Live stream connected!', 'success');
                        break;
                    case 'disconnected':
                    case 'failed':
                        updateStatus('Stream disconnected', 'error');
                        break;
                }
            };

            // Set remote description
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
            
            // Create and set local description
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            // Send answer to broadcaster
            ws.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                target: 'broadcaster'
            }));

        } catch (error) {
            console.error('Offer handling error:', error);
            updateStatus('Failed to connect to stream', 'error');
            if (peerConnection) peerConnection.close();
        }
    }

    // Update status message
    function updateStatus(message, type) {
        const colors = {
            info: '#3498db',
            success: '#2ecc71',
            warning: '#f39c12',
            error: '#e74c3c'
        };
        streamStatus.textContent = message;
        streamStatus.style.color = colors[type] || '#3498db';
    }

    // Toggle mute
    function toggleMute() {
        if (liveVideo.srcObject) {
            isMuted = !isMuted;
            liveVideo.muted = isMuted;
            muteBtn.innerHTML = isMuted ? 
                '<i class="fas fa-volume-mute"></i>' : 
                '<i class="fas fa-volume-up"></i>';
        }
    }

    // Event Listeners
    muteBtn.addEventListener('click', toggleMute);
    
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
                .catch(e => console.log('Fullscreen error:', e));
        } else {
            document.exitFullscreen();
        }
    });

    // Click to play if blocked by browser
    document.addEventListener('click', () => {
        if (liveVideo.srcObject && liveVideo.paused) {
            liveVideo.play()
                .then(() => updateStatus('Watching live!', 'success'))
                .catch(e => console.log('Play error:', e));
        }
    });

    // Initialize
    initWebSocket();
});
