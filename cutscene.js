// cutscene.js - Final round cinematic system with camera control and animations

import { COLORS, showElement, hideElement, EventEmitter } from './utils.js';

class CutsceneManager extends EventEmitter {
    constructor() {
        super();
        
        this.isPlaying = false;
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.players = null; // { player1: { tank, username, color }, player2: { ... } }
        
        // DOM Elements
        this.overlay = document.getElementById('cutscene-overlay');
        this.letterboxTop = document.querySelector('.letterbox.top');
        this.letterboxBottom = document.querySelector('.letterbox.bottom');
        this.scoreDisplay = document.getElementById('cutscene-score');
        this.scoreLeft = document.getElementById('cutscene-score-left');
        this.scoreRight = document.getElementById('cutscene-score-right');
        this.scoreSeparator = document.querySelector('.score-separator');
        this.scoreboard = document.getElementById('scoreboard');
        
        // Cutscene state
        this.originalCameraPos = null;
        this.originalCameraRot = null;
        this.targetCameraPos = null;
        this.cutsceneStartTime = 0;
        this.phase = 0;
        
        // Animation timings (in seconds)
        this.TIMINGS = {
            LETTERBOX_IN: 0.8,
            CAMERA_MOVE: 2.0,
            SCORE_FADE: 1.0,
            SCORE_COUNT: 2.0,
            RESULT_SHOW: 1.5,
            EXPLOSION: 1.0,
            TANK_DRIVE: 2.0,
            LETTERBOX_OUT: 0.8,
            FADE_TO_BLACK: 1.0
        };
    }
    
    init(camera, scene, renderer) {
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;
    }
    
    // === PLAY CUTSCENE ===
    async playCutscene(player1Data, player2Data, finalScores) {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        this.players = {
            player1: player1Data,
            player2: player2Data
        };
        
        // Hide scoreboard
        hideElement(this.scoreboard);
        
        // Show overlay
        showElement(this.overlay);
        
        // Store original camera state
        this.originalCameraPos = this.camera.position.clone();
        this.originalCameraRot = this.camera.rotation.clone();
        
        // Calculate center point between tanks
        const midpoint = new THREE.Vector3();
        midpoint.addVectors(player1Data.tank.position, player2Data.tank.position);
        midpoint.multiplyScalar(0.5);
        
        // Set target camera position (elevated view)
        this.targetCameraPos = midpoint.clone();
        this.targetCameraPos.y += 30;
        this.targetCameraPos.z += 40;
        
        this.cutsceneStartTime = Date.now();
        this.phase = 0;
        
        // Start cutscene sequence
        await this.runCutsceneSequence(finalScores);
    }
    
    async runCutsceneSequence(finalScores) {
        try {
            // Phase 1: Letterbox bars slide in
            await this.phaseLetterboxIn();
            
            // Phase 2: Camera pans to center
            await this.phaseCameraPan();
            
            // Phase 3: Score reveal and count up
            await this.phaseScoreReveal(finalScores);
            
            // Phase 4: Determine winner and show result
            const winner = finalScores.player1 > finalScores.player2 ? 'player1' : 'player2';
            const loser = winner === 'player1' ? 'player2' : 'player1';
            
            await this.phaseShowResult(winner, loser, finalScores);
            
            // Phase 5: Loser explosion
            await this.phaseLoserExplosion(loser);
            
            // Phase 6: Winner drives off
            await this.phaseWinnerDriveOff(winner);
            
            // Phase 7: Letterbox close and fade to black
            await this.phaseFadeToBlack();
            
            // Phase 8: Refresh page
            this.refreshGame();
            
        } catch (error) {
            console.error('Cutscene error:', error);
            this.endCutscene();
        }
    }
    
    // === PHASE 1: LETTERBOX IN ===
    async phaseLetterboxIn() {
        return new Promise((resolve) => {
            this.letterboxTop.classList.add('show');
            this.letterboxBottom.classList.add('show');
            
            setTimeout(() => {
                resolve();
            }, this.TIMINGS.LETTERBOX_IN * 1000);
        });
    }
    
    // === PHASE 2: CAMERA PAN ===
    async phaseCameraPan() {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const duration = this.TIMINGS.CAMERA_MOVE * 1000;
            const startPos = this.camera.position.clone();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Smooth easing
                const eased = this.easeInOutCubic(progress);
                
                this.camera.position.lerpVectors(startPos, this.targetCameraPos, eased);
                this.camera.lookAt(
                    (this.players.player1.tank.position.x + this.players.player2.tank.position.x) / 2,
                    this.players.player1.tank.position.y,
                    (this.players.player1.tank.position.z + this.players.player2.tank.position.z) / 2
                );
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            
            animate();
        });
    }
    
    // === PHASE 3: SCORE REVEAL ===
    async phaseScoreReveal(scores) {
        return new Promise((resolve) => {
            // Fade in score display
            this.scoreDisplay.classList.add('show');
            this.scoreLeft.textContent = '0';
            this.scoreRight.textContent = '0';
            this.scoreLeft.style.color = COLORS[this.players.player1.color];
            this.scoreRight.style.color = COLORS[this.players.player2.color];
            
            setTimeout(() => {
                // Start counting up
                this.animateScoreCount(scores).then(resolve);
            }, this.TIMINGS.SCORE_FADE * 1000);
        });
    }
    
    async animateScoreCount(scores) {
        return new Promise((resolve) => {
            const duration = this.TIMINGS.SCORE_COUNT * 1000;
            const startTime = Date.now();
            const tickInterval = 500; // Count every 500ms
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                const currentLeft = Math.floor(scores.player1 * progress);
                const currentRight = Math.floor(scores.player2 * progress);
                
                this.scoreLeft.textContent = currentLeft;
                this.scoreRight.textContent = currentRight;
                
                if (progress < 1) {
                    setTimeout(animate, tickInterval);
                } else {
                    this.scoreLeft.textContent = scores.player1;
                    this.scoreRight.textContent = scores.player2;
                    resolve();
                }
            };
            
            animate();
        });
    }
    
    // === PHASE 4: SHOW RESULT ===
    async phaseShowResult(winner, loser, scores) {
        return new Promise((resolve) => {
            // Change separator to > or <
            if (winner === 'player1') {
                this.scoreSeparator.textContent = '>';
            } else {
                this.scoreSeparator.textContent = '<';
            }
            
            // Winner score grows and pulses
            const winnerScore = winner === 'player1' ? this.scoreLeft : this.scoreRight;
            const loserScore = loser === 'player1' ? this.scoreLeft : this.scoreRight;
            
            winnerScore.style.transform = 'scale(1.5)';
            winnerScore.style.transition = 'transform 0.5s ease';
            
            // Loser score fades
            loserScore.style.color = '#666';
            loserScore.style.transform = 'scale(0.8)';
            loserScore.style.transition = 'all 0.5s ease';
            
            setTimeout(() => {
                resolve();
            }, this.TIMINGS.RESULT_SHOW * 1000);
        });
    }
    
    // === PHASE 5: LOSER EXPLOSION ===
    async phaseLoserExplosion(loser) {
        return new Promise((resolve) => {
            const loserTank = this.players[loser].tank;
            
            // Flash effect
            let flashCount = 0;
            const flashInterval = setInterval(() => {
                loserTank.visible = !loserTank.visible;
                flashCount++;
                
                if (flashCount >= 6) {
                    clearInterval(flashInterval);
                    loserTank.visible = true;
                    
                    // Trigger explosion (emit event for game.js to handle)
                    this.emit('trigger-explosion', loserTank.position.clone());
                    
                    // Fade out tank
                    setTimeout(() => {
                        loserTank.visible = false;
                        resolve();
                    }, 500);
                }
            }, 100);
        });
    }
    
    // === PHASE 6: WINNER DRIVE OFF ===
    async phaseWinnerDriveOff(winner) {
        return new Promise((resolve) => {
            const winnerTank = this.players[winner].tank;
            
            // Rotate 180 degrees
            const startRotation = winnerTank.rotation.y;
            const targetRotation = startRotation + Math.PI;
            const duration = this.TIMINGS.TANK_DRIVE * 1000;
            const startTime = Date.now();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = this.easeInOutQuad(progress);
                
                // Rotate
                if (progress < 0.3) {
                    const rotProgress = progress / 0.3;
                    winnerTank.rotation.y = startRotation + (Math.PI * rotProgress);
                }
                
                // Drive forward
                if (progress > 0.3) {
                    const driveProgress = (progress - 0.3) / 0.7;
                    const forward = new THREE.Vector3(0, 0, -1);
                    forward.applyQuaternion(winnerTank.quaternion);
                    winnerTank.position.add(forward.multiplyScalar(0.5));
                }
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            
            animate();
        });
    }
    
    // === PHASE 7: FADE TO BLACK ===
    async phaseFadeToBlack() {
        return new Promise((resolve) => {
            // Close letterbox fully
            this.letterboxTop.style.height = '50%';
            this.letterboxBottom.style.height = '50%';
            
            setTimeout(() => {
                // Fade score display
                this.scoreDisplay.style.opacity = '0';
                
                setTimeout(() => {
                    resolve();
                }, this.TIMINGS.FADE_TO_BLACK * 1000);
            }, this.TIMINGS.LETTERBOX_OUT * 1000);
        });
    }
    
    // === PHASE 8: REFRESH ===
    refreshGame() {
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }
    
    // === EASING FUNCTIONS ===
    easeInOutCubic(t) {
        return t < 0.5 
            ? 4 * t * t * t 
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    easeInOutQuad(t) {
        return t < 0.5 
            ? 2 * t * t 
            : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    
    // === END CUTSCENE ===
    endCutscene() {
        this.isPlaying = false;
        hideElement(this.overlay);
        
        // Reset letterbox
        this.letterboxTop.classList.remove('show');
        this.letterboxBottom.classList.remove('show');
        this.letterboxTop.style.height = '10%';
        this.letterboxBottom.style.height = '10%';
        
        // Reset score display
        this.scoreDisplay.classList.remove('show');
        this.scoreDisplay.style.opacity = '1';
        this.scoreSeparator.textContent = ':';
        
        // Show scoreboard
        showElement(this.scoreboard);
        
        // Restore camera (if not refreshing)
        if (this.originalCameraPos && this.camera) {
            this.camera.position.copy(this.originalCameraPos);
            this.camera.rotation.copy(this.originalCameraRot);
        }
    }
    
    // === UPDATE (called from game loop during cutscene) ===
    update(delta) {
        if (!this.isPlaying) return;
        
        // Additional per-frame updates if needed
        // (most animations are promise-based, but can add smooth interpolations here)
    }
    
    // === SKIP CUTSCENE (optional emergency exit) ===
    skip() {
        if (!this.isPlaying) return;
        
        this.endCutscene();
        this.emit('skipped');
        
        // Still refresh after skip
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }
}

// Export singleton instance
export const cutsceneManager = new CutsceneManager();

// Add THREE.js reference (will be set by game.js)
export function setThreeReference(THREE) {
    window.THREE = THREE;
}
