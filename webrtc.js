// webrtc.js - WebRTC P2P connection, offer/answer exchange, data channels

import {
    STUN_SERVERS,
    MSG_TYPES,
    ROLES,
    generateCode,
    validateCodeFormat,
    copyToClipboard,
    showElement,
    hideElement,
    EventEmitter,
    promiseWithTimeout
} from './utils.js';

class WebRTCManager extends EventEmitter {
    constructor() {
        super();
        
        this.peerConnection = null;
        this.dataChannel = null;
        this.role = null; // 'host' or 'client'
        this.isConnected = false;
        this.pendingOffer = null;
        this.pendingAnswer = null;
        
        // Connection state
        this.connectionTimeout = null;
        
        // DOM Elements
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.lobbyTitle = document.getElementById('lobby-title');
        this.lobbyStatus = document.getElementById('lobby-status');
        this.offerCodeSection = document.getElementById('offer-code-section');
        this.offerCodeDisplay = document.getElementById('offer-code');
        this.copyOfferBtn = document.getElementById('copy-offer-btn');
        this.answerInputSection = document.getElementById('answer-input-section');
        this.answerInput = document.getElementById('answer-input');
        this.submitAnswerBtn = document.getElementById('submit-answer-btn');
        this.joinCodeSection = document.getElementById('join-code-section');
        this.offerInput = document.getElementById('offer-input');
        this.submitOfferBtn = document.getElementById('submit-offer-btn');
        this.answerCodeSection = document.getElementById('answer-code-section');
        this.answerCodeDisplay = document.getElementById('answer-code');
        this.copyAnswerBtn = document.getElementById('copy-answer-btn');
        this.cancelLobbyBtn = document.getElementById('cancel-lobby-btn');
        
        this.setupListeners();
    }
    
    setupListeners() {
        // Copy buttons
        this.copyOfferBtn.addEventListener('click', () => {
            copyToClipboard(this.offerCodeDisplay.textContent);
            this.copyOfferBtn.textContent = 'Copied!';
            setTimeout(() => {
                this.copyOfferBtn.textContent = 'Copy Code';
            }, 2000);
        });
        
        this.copyAnswerBtn.addEventListener('click', () => {
            copyToClipboard(this.answerCodeDisplay.textContent);
            this.copyAnswerBtn.textContent = 'Copied!';
            setTimeout(() => {
                this.copyAnswerBtn.textContent = 'Copy Code';
            }, 2000);
        });
        
        // Submit buttons
        this.submitAnswerBtn.addEventListener('click', () => {
            this.handleAnswerSubmit();
        });
        
        this.submitOfferBtn.addEventListener('click', () => {
            this.handleOfferSubmit();
        });
        
        // Cancel button
        this.cancelLobbyBtn.addEventListener('click', () => {
            this.cancelConnection();
        });
        
        // Enter key support
        this.answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAnswerSubmit();
        });
        
        this.offerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleOfferSubmit();
        });
        
        // Auto-uppercase inputs
        this.answerInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
        
        this.offerInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
    
    // === HOST FLOW ===
    async startHost() {
        this.role = ROLES.HOST;
        this.showLobby('host');
        
        try {
            await this.createPeerConnection();
            
            // Host creates data channel
            this.dataChannel = this.peerConnection.createDataChannel('game-data', {
                ordered: true
            });
            this.setupDataChannel();
            
            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            // Wait for ICE gathering to complete
            await this.waitForICEGathering();
            
            // Encode offer to 6-digit code (simplified - store full offer in mapping)
            const offerCode = this.encodeOffer(this.peerConnection.localDescription);
            this.pendingOffer = this.peerConnection.localDescription;
            
            // Display offer code
            this.offerCodeDisplay.textContent = offerCode;
            this.offerCodeSection.style.display = 'block';
            this.answerInputSection.style.display = 'block';
            
            this.updateStatus('Waiting for opponent to enter Answer Code...');
            
            // Set connection timeout
            this.setConnectionTimeout();
            
        } catch (error) {
            console.error('Host setup error:', error);
            this.updateStatus('Failed to create connection. Please try again.');
        }
    }
    
    async handleAnswerSubmit() {
        const answerCode = this.answerInput.value.trim().toUpperCase();
        
        if (!validateCodeFormat(answerCode)) {
            this.updateStatus('Invalid code format. Must be 6 characters (A-Z, 0-9).');
            return;
        }
        
        this.updateStatus('Processing answer...');
        
        try {
            // Decode answer (in real implementation, fetch from server/storage)
            const answer = this.decodeAnswer(answerCode);
            
            if (!answer) {
                this.updateStatus('Invalid answer code. Please check and try again.');
                return;
            }
            
            await this.peerConnection.setRemoteDescription(answer);
            this.updateStatus('Connection established! Starting game...');
            
            // Connection will be confirmed via data channel open event
            
        } catch (error) {
            console.error('Answer processing error:', error);
            this.updateStatus('Failed to process answer. Please try again.');
        }
    }
    
    // === JOIN FLOW ===
    async startJoin() {
        this.role = ROLES.CLIENT;
        this.showLobby('join');
        
        this.joinCodeSection.style.display = 'block';
        this.updateStatus('Enter the host\'s Offer Code to connect.');
        
        this.setConnectionTimeout();
    }
    
    async handleOfferSubmit() {
        const offerCode = this.offerInput.value.trim().toUpperCase();
        
        if (!validateCodeFormat(offerCode)) {
            this.updateStatus('Invalid code format. Must be 6 characters (A-Z, 0-9).');
            return;
        }
        
        this.updateStatus('Connecting...');
        
        try {
            // Decode offer
            const offer = this.decodeOffer(offerCode);
            
            if (!offer) {
                this.updateStatus('Invalid offer code. Please check and try again.');
                return;
            }
            
            await this.createPeerConnection();
            await this.peerConnection.setRemoteDescription(offer);
            
            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            // Wait for ICE gathering
            await this.waitForICEGathering();
            
            // Encode answer to 6-digit code
            const answerCode = this.encodeAnswer(this.peerConnection.localDescription);
            
            // Display answer code
            this.answerCodeDisplay.textContent = answerCode;
            this.answerCodeSection.style.display = 'block';
            this.joinCodeSection.style.display = 'none';
            
            this.updateStatus('Share the Answer Code with the host and wait...');
            
        } catch (error) {
            console.error('Join error:', error);
            this.updateStatus('Failed to connect. Please try again.');
        }
    }
    
    // === PEER CONNECTION SETUP ===
    async createPeerConnection() {
        const config = {
            iceServers: STUN_SERVERS
        };
        
        this.peerConnection = new RTCPeerConnection(config);
        
        // ICE candidate handler
        this.peerConnection.onicecandidate = (event) => {
            // All candidates are gathered automatically
        };
        
        // Connection state change
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            
            if (this.peerConnection.connectionState === 'connected') {
                this.onConnectionEstablished();
            } else if (this.peerConnection.connectionState === 'failed' || 
                       this.peerConnection.connectionState === 'disconnected') {
                this.onConnectionFailed();
            }
        };
        
        // Data channel handler (for client receiving host's channel)
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
    }
    
    setupDataChannel() {
        if (!this.dataChannel) return;
        
        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.isConnected = true;
            clearTimeout(this.connectionTimeout);
            this.emit('connected', this.role);
        };
        
        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            this.isConnected = false;
            this.emit('disconnected');
        };
        
        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
            this.emit('error', error);
        };
        
        this.dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.emit('message', message);
            } catch (error) {
                console.error('Message parse error:', error);
            }
        };
    }
    
    // === ICE GATHERING ===
    waitForICEGathering() {
        return new Promise((resolve) => {
            if (this.peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (this.peerConnection.iceGatheringState === 'complete') {
                        this.peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                this.peerConnection.addEventListener('icegatheringstatechange', checkState);
            }
            
            // Timeout after 10 seconds
            setTimeout(() => resolve(), 10000);
        });
    }
    
    // === ENCODING/DECODING (Simplified) ===
    // In production, you'd use a signaling server or manual exchange
    // For this demo, we'll use localStorage as a simple exchange mechanism
    
    encodeOffer(offer) {
        const code = generateCode();
        // Store offer in localStorage with code as key
        localStorage.setItem(`offer_${code}`, JSON.stringify(offer));
        return code;
    }
    
    decodeOffer(code) {
        const stored = localStorage.getItem(`offer_${code}`);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                return null;
            }
        }
        return null;
    }
    
    encodeAnswer(answer) {
        const code = generateCode();
        // Store answer in localStorage with code as key
        localStorage.setItem(`answer_${code}`, JSON.stringify(answer));
        return code;
    }
    
    decodeAnswer(code) {
        const stored = localStorage.getItem(`answer_${code}`);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                return null;
            }
        }
        return null;
    }
    
    // === CONNECTION MANAGEMENT ===
    onConnectionEstablished() {
        this.updateStatus('Connected! Starting game...');
        setTimeout(() => {
            this.hideLobby();
        }, 1000);
    }
    
    onConnectionFailed() {
        this.updateStatus('Connection failed. Please try again.');
        this.isConnected = false;
    }
    
    setConnectionTimeout() {
        this.connectionTimeout = setTimeout(() => {
            if (!this.isConnected) {
                this.updateStatus('Connection timeout. Please try again.');
                this.emit('timeout');
            }
        }, 30000); // 30 seconds
    }
    
    cancelConnection() {
        clearTimeout(this.connectionTimeout);
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        this.isConnected = false;
        this.hideLobby();
        this.emit('cancelled');
    }
    
    // === SENDING MESSAGES ===
    send(type, data = {}) {
        if (!this.isConnected || !this.dataChannel) {
            console.warn('Cannot send: not connected');
            return false;
        }
        
        try {
            const message = { type, data, timestamp: Date.now() };
            this.dataChannel.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Send error:', error);
            return false;
        }
    }
    
    // === UI HELPERS ===
    showLobby(type) {
        showElement(this.lobbyScreen);
        
        if (type === 'host') {
            this.lobbyTitle.textContent = 'Waiting for opponent...';
        } else {
            this.lobbyTitle.textContent = 'Join Game';
        }
    }
    
    hideLobby() {
        hideElement(this.lobbyScreen);
    }
    
    updateStatus(message) {
        this.lobbyStatus.textContent = message;
    }
    
    // === CLEANUP ===
    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.isConnected = false;
    }
}

// Export singleton instance
export const webrtcManager = new WebRTCManager();
