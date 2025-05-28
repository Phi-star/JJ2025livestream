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
    let retryCount = 0;
    const maxRetries = 3;

    // Initialize WebSocket Connection
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;

        console.log('Connecting to WebSocket:', wsUrl);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to signaling server');
            updateStatus('Connected to server', 'info');
            ws.send(JSON.stringify({ type: 'viewer' }));
        };

        ws.onmessage = async (message) => {
            try {
                const data = JSON.parse(message.data);
                console.log('Received message:', data.type);
                
                if (data.type === 'offer') {
                    console.log('Received offer, setting up WebRTC');
                    await handleOffer(data);
                } 
                else if (data.type === 'candidate') {
                    console.log('Received ICE candidate');
                    if (peerConnection && data.candidate) {
                        try {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                        } catch (e) {
                            console.warn('Failed to add ICE candidate:', e);
                        }
                    }
                }
                else if (data.type === 'streamStatus') {
                    updateStatus(data.isLive ? 'Live stream available' : 'No active stream', 
                                data.isLive ? 'success' : 'warning');
                }
            } catch (error) {
                console.error('Error handling message:', error);
                updateStatus('Error processing stream', 'error');
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatus('Connection error', 'error');
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            if (retryCount < maxRetries) {
                retryCount++;
                const delay = Math.min(retryCount * 2000, 5000);
                updateStatus(`Reconnecting in ${delay/1000}s...`, 'warning');
                setTimeout(initWebSocket, delay);
            } else {
                updateStatus('Failed to connect. Please refresh.', 'error');
            }
        };
    }

    // Handle the WebRTC Offer from broadcaster
    async function handleOffer(offerData) {
        try {
            updateStatus('Connecting to live stream...', 'info');
            
            // Close existing connection if any
            if (peerConnection) {
                peerConnection.close();
            }

            // Create new PeerConnection
            peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle'
            });

            // When we receive the stream
            peerConnection.ontrack = (event) => {
                console.log('Received media stream:', event.streams);
                if (event.streams && event.streams[0]) {
                    liveVideo.srcObject = event.streams[0];
                    
                    // Try to play the video
                    const playPromise = liveVideo.play();
                    
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            console.log('Video playback started');
                            updateStatus('Live stream connected!', 'success');
                            
                            // Auto fullscreen on desktop
                            if (!/Mobi|Android/i.test(navigator.userAgent)) {
                                document.documentElement.requestFullscreen()
                                    .catch(e => console.log('Fullscreen error:', e));
                            }
                        }).catch(error => {
                            console.error('Playback failed:', error);
                            updateStatus('Click to allow video playback', 'warning');
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
                        updateStatus('Watching live!', 'success');
                        break;
                    case 'disconnected':
                    case 'failed':
                        updateStatus('Stream disconnected', 'error');
                        break;
                }
            };

            // Set remote description
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
            
            // Create answer
            const answer = await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            // Set local description
            await peerConnection.setLocalDescription(answer);
            
            // Send answer to broadcaster
            ws.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                target: 'broadcaster'
            }));

        } catch (error) {
            console.error('Error handling offer:', error);
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

    // Click anywhere to play if blocked by browser
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
