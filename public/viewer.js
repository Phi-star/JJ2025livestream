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
            const data = JSON.parse(message.data);
            
            if (data.type === 'offer') {
                await handleOffer(data);
            } 
            else if (data.type === 'candidate') {
                if (peerConnection && data.candidate) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
            else if (data.type === 'streamStatus') {
                updateStatus(data.isLive ? 'Live stream available!' : 'No active stream', 
                             data.isLive ? 'success' : 'warning');
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
            
            // Create PeerConnection
            peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // When stream arrives
            peerConnection.ontrack = (event) => {
                console.log('Received stream tracks');
                if (event.streams && event.streams[0]) {
                    liveVideo.srcObject = event.streams[0];
                    liveVideo.play()
                        .then(() => {
                            updateStatus('Watching live!', 'success');
                            // Auto fullscreen on desktop
                            if (!/Mobi|Android/i.test(navigator.userAgent)) {
                                document.documentElement.requestFullscreen();
                            }
                        })
                        .catch(err => {
                            console.error('Playback error:', err);
                            updateStatus('Click to allow video playback', 'error');
                        });
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

            // Set remote description and create answer
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
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

    // UI Functions
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
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    // Initialize
    initWebSocket();
});
