class LiveStreamViewer {
    constructor() {
        // DOM Elements
        this.videoElement = document.getElementById('liveVideo');
        this.statusText = document.getElementById('statusText');
        this.viewerCount = document.getElementById('viewerCount');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.errorOverlay = document.getElementById('errorOverlay');
        this.errorTitle = document.getElementById('errorTitle');
        this.errorDetails = document.getElementById('errorDetails');
        
        // WebRTC Variables
        this.peerConnection = null;
        this.websocket = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.isMuted = true;
        this.viewers = 0;
        
        // Initialize
        this.initVideoElement();
        this.initEventListeners();
        this.connectToStream();
    }
    
    initVideoElement() {
        // Ensure video element is properly configured
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('webkit-playsinline', '');
    }
    
    initEventListeners() {
        // Control buttons
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('refreshBtn').addEventListener('click', () => window.location.reload());
        document.getElementById('retryBtn').addEventListener('click', () => this.connectToStream());
        
        // Video element events
        this.videoElement.addEventListener('playing', () => {
            this.hideLoading();
            this.updateStatus('Live', 'success');
        });
        
        this.videoElement.addEventListener('waiting', () => {
            this.showLoading('Buffering...');
        });
        
        // Click to play if blocked by browser
        document.addEventListener('click', () => {
            if (this.videoElement.paused && this.videoElement.srcObject) {
                this.videoElement.play().catch(e => {
                    this.showError('Playback Blocked', 'Click the unmute button or interact with the page to allow playback');
                });
            }
        });
    }
    
    connectToStream() {
        this.hideError();
        this.showLoading('Connecting to live stream...');
        this.retryCount++;
        
        // Close existing connections
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        // Initialize WebSocket connection
        this.initWebSocket();
    }
    
    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;
        
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
            console.log('WebSocket connected');
            this.updateStatus('Connecting...', 'info');
            this.websocket.send(JSON.stringify({ type: 'viewer' }));
        };
        
        this.websocket.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message:', data.type);
                
                if (data.type === 'offer') {
                    await this.handleOffer(data);
                } 
                else if (data.type === 'candidate') {
                    await this.handleIceCandidate(data);
                }
                else if (data.type === 'viewerCount') {
                    this.updateViewerCount(data.count);
                }
            } catch (error) {
                console.error('Error handling message:', error);
                this.showError('Stream Error', 'Failed to process stream data');
            }
        };
        
        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            if (this.retryCount <= this.maxRetries) {
                this.showLoading('Reconnecting...');
                setTimeout(() => this.connectToStream(), 3000);
            } else {
                this.showError('Connection Failed', 'Cannot connect to the live stream server');
            }
        };
        
        this.websocket.onclose = () => {
            console.log('WebSocket disconnected');
            if (!this.errorOverlay.style.display === 'flex') {
                this.showLoading('Reconnecting...');
                setTimeout(() => this.connectToStream(), 3000);
            }
        };
    }
    
    async handleOffer(offerData) {
        try {
            this.showLoading('Connecting to stream...');
            
            // Create RTCPeerConnection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require'
            });
            
            // Handle incoming tracks
            this.peerConnection.ontrack = (event) => {
                console.log('Received media stream:', event.streams);
                if (event.streams && event.streams.length > 0) {
                    this.videoElement.srcObject = event.streams[0];
                    this.videoElement.play()
                        .then(() => {
                            this.hideLoading();
                            this.updateStatus('Live', 'success');
                        })
                        .catch(error => {
                            console.error('Playback error:', error);
                            this.showError('Playback Blocked', 'Click to allow video playback');
                        });
                }
            };
            
            // ICE Candidate handling
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(JSON.stringify({
                        type: 'candidate',
                        candidate: event.candidate,
                        target: 'broadcaster'
                    }));
                }
            };
            
            // Connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', this.peerConnection.connectionState);
                switch (this.peerConnection.connectionState) {
                    case 'connected':
                        this.updateStatus('Live', 'success');
                        break;
                    case 'disconnected':
                    case 'failed':
                        this.showError('Disconnected', 'The stream connection was lost');
                        break;
                }
            };
            
            // Set remote description
            await this.peerConnection.setRemoteDescription(offerData.offer);
            
            // Create and send answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.websocket.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                target: 'broadcaster'
            }));
            
        } catch (error) {
            console.error('Error handling offer:', error);
            this.showError('Stream Error', 'Failed to connect to the live stream');
        }
    }
    
    async handleIceCandidate(candidateData) {
        try {
            if (this.peerConnection && candidateData.candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData.candidate));
            }
        } catch (error) {
            console.warn('Failed to add ICE candidate:', error);
        }
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
                .catch(err => console.log('Fullscreen error:', err));
        } else {
            document.exitFullscreen();
        }
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.videoElement.muted = this.isMuted;
        document.getElementById('muteBtn').innerHTML = this.isMuted ? 
            '<i class="fas fa-volume-mute"></i>' : 
            '<i class="fas fa-volume-up"></i>';
        
        // If unmuting, try to play again in case it was blocked
        if (!this.isMuted && this.videoElement.paused) {
            this.videoElement.play().catch(e => console.log('Play error:', e));
        }
    }
    
    updateViewerCount(count) {
        this.viewers = count;
        this.viewerCount.textContent = count;
    }
    
    updateStatus(text, type) {
        this.statusText.textContent = text;
        
        // Update status color based on type
        const colors = {
            info: '#3498db',
            success: '#2ecc71',
            warning: '#f39c12',
            error: '#e74c3c'
        };
        document.querySelector('.status-indicator').style.backgroundColor = 
            `rgba(0, 0, 0, ${type === 'success' ? '0.5' : '0.7'})`;
    }
    
    showLoading(text) {
        this.loadingText.textContent = text;
        this.loadingOverlay.style.display = 'flex';
        this.errorOverlay.style.display = 'none';
    }
    
    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }
    
    showError(title, details) {
        this.errorTitle.textContent = title;
        this.errorDetails.textContent = details;
        this.errorOverlay.style.display = 'flex';
        this.loadingOverlay.style.display = 'none';
        this.updateStatus('Disconnected', 'error');
    }
    
    hideError() {
        this.errorOverlay.style.display = 'none';
        this.retryCount = 0;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LiveStreamViewer();
});
