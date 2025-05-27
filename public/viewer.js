document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const liveVideo = document.getElementById('liveVideo');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const muteBtn = document.getElementById('muteBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const streamStatus = document.getElementById('streamStatus');

    // WebSocket and WebRTC variables
    let ws;
    let peerConnection;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let isMuted = false;
    let isFullscreen = false;

    // Initialize WebSocket connection
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/api/ws`;

        console.log('Connecting to WebSocket:', wsUrl);
        updateStatus('Connecting to server...', 'info');
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to signaling server');
            reconnectAttempts = 0;
            updateStatus('Connected, waiting for stream...', 'success');
            ws.send(JSON.stringify({ type: 'viewer' }));
        };

        ws.onmessage = async (message) => {
            try {
                const data = JSON.parse(message.data);
                
                if (data.type === 'streamStatus') {
                    if (data.isLive) {
                        updateStatus('Live stream available! Connecting...', 'success');
                    } else {
                        updateStatus('No active live stream', 'warning');
                        if (peerConnection) {
                            peerConnection.close();
                            peerConnection = null;
                        }
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
                updateStatus('Error processing stream data', 'error');
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatus('Connection error', 'error');
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * (reconnectAttempts + 1), 5000);
                updateStatus(`Connection lost. Reconnecting in ${delay/1000} seconds...`, 'warning');
                setTimeout(initWebSocket, delay);
                reconnectAttempts++;
            } else {
                updateStatus('Failed to connect. Please refresh the page.', 'error');
            }
        };
    }

    // Handle WebRTC offer from broadcaster
    async function handleOffer(data) {
        try {
            updateStatus('Connecting to live stream...', 'info');
            
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

            // When we receive a track
            peerConnection.ontrack = (event) => {
                console.log('Received track:', event.track.kind);
                if (event.streams && event.streams[0]) {
                    liveVideo.srcObject = event.streams[0];
                    
                    // Auto-play the video
                    liveVideo.play()
                        .then(() => {
                            updateStatus('Live stream connected!', 'success');
                            // Auto-enter fullscreen if not on mobile
                            if (!/Mobi|Android/i.test(navigator.userAgent)) {
                                enterFullscreen();
                            }
                        })
                        .catch(error => {
                            console.error('Video play error:', error);
                            updateStatus('Please allow video playback', 'error');
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
                        updateStatus('Live stream connected!', 'success');
                        break;
                    case 'disconnected':
                    case 'failed':
                        updateStatus('Disconnected from stream', 'error');
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
            updateStatus('Error connecting to stream', 'error');
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
        }
    }

    // Update status message
    function updateStatus(message, type) {
        let icon = '';
        switch(type) {
            case 'success':
                icon = '<i class="fas fa-check-circle"></i> ';
                break;
            case 'error':
                icon = '<i class="fas fa-exclamation-circle"></i> ';
                break;
            case 'warning':
                icon = '<i class="fas fa-exclamation-triangle"></i> ';
                break;
            default:
                icon = '<i class="fas fa-info-circle"></i> ';
        }
        
        streamStatus.innerHTML = icon + message;
        streamStatus.style.color = 
            type === 'success' ? '#2ecc71' :
            type === 'error' ? '#e74c3c' :
            type === 'warning' ? '#f39c12' : '#3498db';
    }

    // Fullscreen handling
    function enterFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
                .then(() => {
                    isFullscreen = true;
                    fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
                })
                .catch(err => {
                    console.log('Fullscreen error:', err);
                });
        }
    }

    function exitFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen()
                .then(() => {
                    isFullscreen = false;
                    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
                });
        }
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

    // Event listeners
    fullscreenBtn.addEventListener('click', function() {
        if (!isFullscreen) {
            enterFullscreen();
        } else {
            exitFullscreen();
        }
    });

    muteBtn.addEventListener('click', toggleMute);

    refreshBtn.addEventListener('click', function() {
        window.location.reload();
    });

    // Handle fullscreen change events
    document.addEventListener('fullscreenchange', function() {
        isFullscreen = !!document.fullscreenElement;
        fullscreenBtn.innerHTML = isFullscreen ? 
            '<i class="fas fa-compress"></i>' : 
            '<i class="fas fa-expand"></i>';
    });

    // Initialize
    initWebSocket();
});
