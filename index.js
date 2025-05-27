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

    // State variables
    let isStreaming = false;
    let streamerId = null;
    let peerConnection;
    let localStream;
    let currentStreamerSocket;

    // Simulated WebSocket connection (in a real app, you'd connect to your server)
    function setupWebSocket() {
        // This is a simulation - in a real app, you'd connect to your WebSocket server
        console.log("Connecting to WebSocket server...");
        
        // Simulate connection
        setTimeout(() => {
            console.log("WebSocket connection established");
        }, 1000);
    }

    // Check if stream is already active
    function checkStreamStatus() {
        // In a real app, you'd check with your server
        // For this demo, we'll assume no one is streaming initially
        return false;
    }

    // Start watching the live stream
    watchBtn.addEventListener('click', function() {
        if (!isStreaming) {
            streamStatus.innerHTML = '<p>No one is currently streaming. Check back later or start the stream yourself!</p>';
            streamStatus.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
            streamStatus.style.borderLeft = '4px solid var(--error-color)';
            return;
        }

        videoContainer.classList.remove('hidden');
        liveIndicator.classList.remove('hidden');
        
        // In a real app, you'd connect to the streamer's video feed via WebRTC
        // For this demo, we'll simulate it with a placeholder
        liveVideo.srcObject = null;
        liveVideo.src = 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4';
        liveVideo.play();
    });

    // Request to start live streaming
    streamBtn.addEventListener('click', function() {
        if (isStreaming && streamerId !== 'local') {
            streamActiveModal.classList.remove('hidden');
            return;
        }

        if (isStreaming && streamerId === 'local') {
            // You're already streaming
            return;
        }

        // Request camera and microphone access
        permissionModal.classList.remove('hidden');
    });

    // Handle permission to access media devices
    allowBtn.addEventListener('click', function() {
        permissionModal.classList.add('hidden');
        startStreaming();
    });

    denyBtn.addEventListener('click', function() {
        permissionModal.classList.add('hidden');
        alert('You need to allow camera and microphone access to start streaming.');
    });

    // Close the stream active modal
    closeModalBtn.addEventListener('click', function() {
        streamActiveModal.classList.add('hidden');
    });

    // Start the streaming process
    async function startStreaming() {
        try {
            // Get user media
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // In a real app, you'd send this stream to viewers via WebRTC
            // For this demo, we'll just display it locally
            videoContainer.classList.remove('hidden');
            liveVideo.srcObject = localStream;
            liveIndicator.classList.remove('hidden');
            
            // Update UI
            isStreaming = true;
            streamerId = 'local';
            streamStatus.innerHTML = '<p>You are currently streaming live!</p>';
            streamStatus.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            streamStatus.style.borderLeft = '4px solid var(--success-color)';
            
            // Change stream button text
            streamBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Streaming';
            
            // In a real app, you'd notify the server you're streaming
            console.log("Streaming started - notifying server");
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            alert('Could not access camera or microphone. Please check your permissions.');
        }
    }

    // Stop streaming
    function stopStreaming() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        videoContainer.classList.add('hidden');
        liveIndicator.classList.add('hidden');
        
        isStreaming = false;
        streamerId = null;
        streamStatus.innerHTML = '<p>Live stream is currently offline</p>';
        streamStatus.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
        streamStatus.style.borderLeft = '4px solid var(--error-color)';
        
        // Reset stream button
        streamBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Start Live Stream';
        
        // In a real app, you'd notify the server you've stopped streaming
        console.log("Streaming stopped - notifying server");
    }

    // Toggle fullscreen
    fullscreenBtn.addEventListener('click', function() {
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    });

    // Exit video view
    exitBtn.addEventListener('click', function() {
        if (streamerId === 'local') {
            stopStreaming();
        } else {
            videoContainer.classList.add('hidden');
            liveIndicator.classList.add('hidden');
            if (liveVideo.srcObject) {
                liveVideo.srcObject.getTracks().forEach(track => track.stop());
                liveVideo.srcObject = null;
            }
        }
    });

    // Initialize
    setupWebSocket();
    isStreaming = checkStreamStatus();

    // In a real app, you'd have WebSocket listeners for:
    // - New streamer connected
    // - Streamer disconnected
    // - ICE candidates
    // - SDP offers/answers
});
