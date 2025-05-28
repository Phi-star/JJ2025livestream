document.addEventListener('DOMContentLoaded', function() {
    // 1. First ensure video element exists
    const liveVideo = document.getElementById('liveVideo');
    if (!liveVideo) {
        console.error('ERROR: Missing video element with id="liveVideo"');
        alert('Missing video element - please add <video id="liveVideo"> to your HTML');
        return;
    }

    // Set muted initially to bypass autoplay restrictions
    liveVideo.muted = true;
    liveVideo.setAttribute('playsinline', '');
    liveVideo.setAttribute('controls', '');

    const streamStatus = document.getElementById('streamStatus');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const muteBtn = document.getElementById('muteBtn');

    // WebRTC Variables
    let peerConnection;
    let ws;
    let isMuted = true; // Start muted to ensure autoplay works

    // Initialize WebSocket Connection
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;

        console.log('Connecting to WebSocket:', wsUrl);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to signaling server');
            updateStatus('Connected - Waiting for stream...', 'info');
            ws.send(JSON.stringify({ type: 'viewer' }));
        };

        ws.onmessage = async (message) => {
            try {
                const data = JSON.parse(message.data);
                console.log('WebSocket message:', data.type);
                
                if (data.type === 'offer') {
                    console.log('Received offer, setting up WebRTC');
                    await handleOffer(data);
                } 
                else if (data.type === 'candidate') {
                    console.log('Received ICE candidate:', data.candidate);
                    if (peerConnection && data.candidate) {
                        try {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                                .catch(e => console.warn('ICE candidate add failed:', e));
                        } catch (e) {
                            console.warn('Failed to add ICE candidate:', e);
                        }
                    }
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
            console.log('WebSocket disconnected - reconnecting...');
            setTimeout(initWebSocket, 3000);
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

            // Create new PeerConnection with debugging
            peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ],
                iceTransportPolicy: 'all'
            });

            // Debugging ICE candidates
            peerConnection.onicecandidate = (event) => {
                console.log('ICE candidate:', event.candidate);
                if (event.candidate && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'candidate',
                        candidate: event.candidate,
                        target: 'broadcaster'
                    }));
                }
            };

            // When we receive the stream - MOST IMPORTANT PART!
            peerConnection.ontrack = (event) => {
                console.log('TRACK EVENT RECEIVED:', event);
                console.log('Streams:', event.streams);
                console.log('Track:', event.track);
                
                if (event.streams && event.streams.length > 0) {
                    console.log('Attaching stream to video element');
                    liveVideo.srcObject = event.streams[0];
                    
                    liveVideo.play()
                        .then(() => {
                            console.log('Video playback started');
                            updateStatus('Live!', 'success');
                        })
                        .catch(error => {
                            console.error('Playback failed:', error);
                            updateStatus('Click to play', 'warning');
                        });
                }
            };

            // Debugging connection state
            peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', peerConnection.connectionState);
                switch (peerConnection.connectionState) {
                    case 'connected':
                        updateStatus('Live!', 'success');
                        break;
                    case 'disconnected':
                    case 'failed':
                        updateStatus('Stream disconnected', 'error');
                        break;
                }
            };

            // Set remote description
            console.log('Setting remote description');
            await peerConnection.setRemoteDescription(offerData.offer);
            
            // Create answer
            console.log('Creating answer');
            const answer = await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            // Set local description
            console.log('Setting local description');
            await peerConnection.setLocalDescription(answer);
            
            // Send answer to broadcaster
            console.log('Sending answer');
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
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    // Click anywhere to play if blocked by browser
    document.addEventListener('click', () => {
        if (liveVideo.srcObject && liveVideo.paused) {
            liveVideo.play()
                .then(() => updateStatus('Live!', 'success'))
                .catch(e => console.log('Play error:', e));
        }
    });

    // Initialize
    console.log('Initializing WebSocket connection...');
    initWebSocket();
});
