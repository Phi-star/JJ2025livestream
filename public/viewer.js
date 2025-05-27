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

    // Initialize WebSocket connection
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        ws = new WebSocket(`${protocol}//${host}`);

        ws.onopen = () => {
            console.log('Connected to signaling server');
            ws.send(JSON.stringify({ type: 'viewer' }));
        };

        ws.onmessage = async (message) => {
            const data = JSON.parse(message.data);
            
            if (data.type === 'streamStatus') {
                if (data.isLive) {
                    streamStatus.innerHTML = '<p>Live stream is currently active!</p>';
                    streamStatus.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
                    streamStatus.style.borderLeft = '4px solid var(--success-color)';
                } else {
                    streamStatus.innerHTML = '<p>Live stream is currently offline</p>';
                    streamStatus.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
                    streamStatus.style.borderLeft = '4px solid var(--error-color)';
                }
            } else if (data.type === 'offer') {
                await handleOffer(data.offer);
            } else if (data.type === 'candidate') {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error('Error adding ICE candidate:', e);
                }
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from signaling server');
        };
    }

    // Handle WebRTC offer from broadcaster
    async function handleOffer(offer) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
                // Add your TURN servers here if needed
            ]
        };

        peerConnection = new RTCPeerConnection(configuration);

        // When we receive a track, add it to the video element
        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                liveVideo.srcObject = event.streams[0];
                videoContainer.classList.remove('hidden');
                liveIndicator.classList.remove('hidden');
            }
        };

        // ICE candidate handler
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate,
                    target: 'broadcaster'
                }));
            }
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        ws.send(JSON.stringify({
            type: 'answer',
            answer: answer,
            target: 'broadcaster'
        }));
    }

    // Event listeners
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
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
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
