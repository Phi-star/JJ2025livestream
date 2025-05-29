class LiveStreamViewer {
    constructor() {
        this.initElements();
        this.initVideoElement();
        this.initEventListeners();
        this.connectToStream();
    }
    
    initElements() {
        this.videoElement = document.getElementById('liveVideo');
        this.statusText = document.getElementById('statusText');
        this.viewerCount = document.getElementById('viewerCount');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.errorOverlay = document.getElementById('errorOverlay');
        this.errorTitle = document.getElementById('errorTitle');
        this.errorDetails = document.getElementById('errorDetails');
        
        this.peerConnection = null;
        this.websocket = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.isMuted = true;
        this.viewers = 0;
        this.debugInterval = null;
    }
    
    initVideoElement() {
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('webkit-playsinline', '');
    }
    
    initEventListeners() {
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('refreshBtn').addEventListener('click', () => window.location.reload());
        document.getElementById('retryBtn').addEventListener('click', () => this.connectToStream());
        
        this.videoElement.addEventListener('playing', () => {
            this.hideLoading();
            this.updateStatus('Live', 'success');
        });
        
        this.videoElement.addEventListener('waiting', () => {
            this.showLoading('Buffering...');
        });
        
        document.addEventListener('click', () => {
            if (this.videoElement.paused && this.videoElement.srcObject) {
                this.videoElement.play().catch(e => {
                    this.showError('Playback Blocked', 'Click the unmute button or interact with the page to allow playback');
                });
            }
        });
    }
    
    async connectToStream() {
        this.hideError();
        this.showLoading('Connecting to live stream...');
        this.retryCount++;
        
        // Clean up previous connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        if (this.debugInterval) {
            clearInterval(this.debugInterval);
            this.debugInterval = null;
        }
        
        try {
            await this.initWebSocket();
        } catch (error) {
            console.error('Initial connection failed:', error);
            if (this.retryCount <= this.maxRetries) {
                this.showLoading(`Reconnecting... (Attempt ${this.retryCount}/${this.maxRetries})`);
                setTimeout(() => this.connectToStream(), 3000);
            } else {
                this.showError('Connection Failed', 'Cannot connect to the live stream server after multiple attempts');
            }
        }
    }
    
    async initWebSocket() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/api/ws`;
            console.log('Connecting to WebSocket:', wsUrl);
            
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('WebSocket connected successfully');
                this.updateStatus('Connecting...', 'info');
                this.websocket.send(JSON.stringify({ type: 'viewer' }));
                resolve();
            };
            
            this.websocket.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('WebSocket message received:', data.type);
                    
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
                reject(new Error('Failed to connect to signaling server'));
            };
            
            this.websocket.onclose = () => {
                console.log('WebSocket disconnected');
                if (!this.errorOverlay.style.display === 'flex') {
                    this.showLoading('Reconnecting...');
                    setTimeout(() => this.connectToStream(), 3000);
                }
            };
        });
    }
    
    async handleOffer(offerData) {
        try {
            this.showLoading('Establishing stream connection...');
            
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    // Add your TURN server configuration here if available
                    // {
                    //     urls: 'turn:your.turn.server:3478',
                    //     username: 'your_username',
                    //     credential: 'your_password'
                    // }
                ],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require'
            });
            
            // Enhanced track handling
            this.peerConnection.ontrack = (event) => {
                console.log('Track event received:', event.track.kind, 'track');
                if (!this.videoElement.srcObject) {
                    this.videoElement.srcObject = new MediaStream();
                }
                
                // Add all tracks from all streams
                event.streams.forEach(stream => {
                    stream.getTracks().forEach(track => {
                        if (!this.videoElement.srcObject.getTracks().some(t => t.id === track.id)) {
                            console.log(`Adding ${track.kind} track to video element`);
                            this.videoElement.srcObject.addTrack(track);
                        }
                    });
                });
                
                this.videoElement.play()
                    .then(() => {
                        console.log('Video playback started successfully');
                        this.hideLoading();
                        this.updateStatus('Live', 'success');
                    })
                    .catch(error => {
                        console.error('Playback failed:', error);
                        this.showError('Playback Blocked', 'Click to allow video playback');
                    });
            };
            
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.websocket.readyState === WebSocket.OPEN) {
                    console.log('Sending ICE candidate:', event.candidate);
                    this.websocket.send(JSON.stringify({
                        type: 'candidate',
                        candidate: event.candidate
                    }));
                }
            };
            
            // Enhanced connection monitoring
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
                if (this.peerConnection.iceConnectionState === 'failed') {
                    this.showError('Connection Failed', 'Network connection failed');
                }
            };
            
            this.peerConnection.onconnectionstatechange = () => {
                console.log('PeerConnection state:', this.peerConnection.connectionState);
                switch (this.peerConnection.connectionState) {
                    case 'connected':
                        this.updateStatus('Live', 'success');
                        this.hideLoading();
                        break;
                    case 'disconnected':
                    case 'failed':
                        this.showError('Disconnected', 'The stream connection was lost');
                        break;
                }
            };
            
            await this.peerConnection.setRemoteDescription(offerData.offer);
            console.log('Remote description set successfully');
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            console.log('Local description set successfully');
            
            this.websocket.send(JSON.stringify({
                type: 'answer',
                answer: answer
            }));
            
            // Start debug monitoring
            this.debugInterval = setInterval(() => this.debugConnection(), 5000);
            
        } catch (error) {
            console.error('Error handling offer:', error);
            this.showError('Stream Error', 'Failed to connect to the live stream');
        }
    }
    
    async handleIceCandidate(candidateData) {
        try {
            if (this.peerConnection && candidateData.candidate) {
                console.log('Adding ICE candidate:', candidateData.candidate);
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData.candidate));
            }
        } catch (error) {
            console.warn('Failed to add ICE candidate:', error);
        }
    }
    
    async debugConnection() {
        if (!this.peerConnection) return;
        
        try {
            const stats = await this.peerConnection.getStats();
            stats.forEach(report => {
                if (report.type === 'inbound-rtp') {
                    console.log('Inbound RTP stats:', {
                        bytesReceived: report.bytesReceived,
                        packetsReceived: report.packetsReceived,
                        framesDecoded: report.framesDecoded
                    });
                }
                if (report.type === 'candidate-pair' && report.selected) {
                    console.log('Selected candidate pair:', {
                        state: report.state,
                        priority: report.priority,
                        nominated: report.nominated
                    });
                }
            });
            
            if (this.videoElement.srcObject) {
                const stream = this.videoElement.srcObject;
                console.log('Current stream tracks:', {
                    video: stream.getVideoTracks().length,
                    audio: stream.getAudioTracks().length
                });
            }
        } catch (error) {
            console.warn('Debugging failed:', error);
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
        
        if (this.debugInterval) {
            clearInterval(this.debugInterval);
            this.debugInterval = null;
        }
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
