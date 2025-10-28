// menu.js - Main menu, username/color selection, localStorage

import { 
    COLORS, 
    COLOR_NAMES, 
    validateUsername, 
    savePlayerData, 
    loadPlayerData,
    showElement,
    hideElement,
    EventEmitter
} from './utils.js';

class MenuManager extends EventEmitter {
    constructor() {
        super();
        this.username = '';
        this.color = '';
        this.isValid = false;
        
        // DOM Elements
        this.mainMenu = document.getElementById('main-menu');
        this.usernameInput = document.getElementById('username-input');
        this.usernameError = document.getElementById('username-error');
        this.colorSelector = document.getElementById('color-selector');
        this.hostBtn = document.getElementById('host-btn');
        this.joinBtn = document.getElementById('join-btn');
        this.modeSelection = document.getElementById('mode-selection');
        
        this.init();
    }
    
    init() {
        // Populate color selector
        this.createColorOptions();
        
        // Load saved player data
        this.loadSavedData();
        
        // Setup event listeners
        this.setupListeners();
        
        // Setup test mode detection (hold T for 2s)
        this.setupTestMode();
    }
    
    createColorOptions() {
        this.colorSelector.innerHTML = '';
        COLOR_NAMES.forEach(colorName => {
            const option = document.createElement('div');
            option.className = 'color-option';
            option.style.backgroundColor = COLORS[colorName];
            option.dataset.color = colorName;
            
            // Add border for visibility on white/black
            if (colorName === 'white' || colorName === 'black') {
                option.style.border = '3px solid #555';
            }
            
            option.addEventListener('click', () => this.selectColor(colorName));
            this.colorSelector.appendChild(option);
        });
    }
    
    loadSavedData() {
        const saved = loadPlayerData();
        if (saved && saved.username && saved.color) {
            this.usernameInput.value = saved.username;
            this.username = saved.username;
            this.selectColor(saved.color);
            this.validateInput();
        }
    }
    
    setupListeners() {
        // Username input
        this.usernameInput.addEventListener('input', (e) => {
            this.validateInput();
        });
        
        this.usernameInput.addEventListener('keypress', (e) => {
            // Only allow alphanumeric
            const char = String.fromCharCode(e.which || e.keyCode);
            if (!/^[a-zA-Z0-9]$/.test(char)) {
                e.preventDefault();
            }
        });
        
        // Host button
        this.hostBtn.addEventListener('click', () => {
            if (this.isValid) {
                this.saveAndProceed();
                this.showModeSelection();
            }
        });
        
        // Join button
        this.joinBtn.addEventListener('click', () => {
            if (this.isValid) {
                this.saveAndProceed();
                this.emit('join');
            }
        });
        
        // Mode selection buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.emit('host', mode);
            });
        });
    }
    
    setupTestMode() {
        let tKeyHoldTime = 0;
        let tKeyPressed = false;
        let tKeyInterval = null;
        
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 't' && !tKeyPressed && this.mainMenu.classList.contains('active')) {
                tKeyPressed = true;
                tKeyHoldTime = 0;
                tKeyInterval = setInterval(() => {
                    tKeyHoldTime += 100;
                    if (tKeyHoldTime >= 2000) {
                        // Activate test mode
                        clearInterval(tKeyInterval);
                        this.activateTestMode();
                    }
                }, 100);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 't') {
                tKeyPressed = false;
                tKeyHoldTime = 0;
                if (tKeyInterval) {
                    clearInterval(tKeyInterval);
                    tKeyInterval = null;
                }
            }
        });
    }
    
    activateTestMode() {
        // Auto-fill if empty
        if (!this.username) {
            this.usernameInput.value = 'TestPlayer';
            this.username = 'TestPlayer';
        }
        if (!this.color) {
            this.selectColor('red');
        }
        this.validateInput();
        
        // Show test mode indicator
        const indicator = document.getElementById('test-mode-indicator');
        showElement(indicator);
        
        // Emit test mode event
        this.saveAndProceed();
        this.emit('test-mode');
    }
    
    validateInput() {
        const result = validateUsername(this.usernameInput.value);
        
        if (!result.valid) {
            this.usernameError.textContent = result.error;
            this.usernameInput.classList.add('error');
            this.isValid = false;
        } else {
            this.usernameError.textContent = '';
            this.usernameInput.classList.remove('error');
            this.username = result.username;
            this.isValid = this.color !== '';
        }
        
        this.updateButtons();
    }
    
    selectColor(colorName) {
        this.color = colorName;
        
        // Update UI
        document.querySelectorAll('.color-option').forEach(opt => {
            if (opt.dataset.color === colorName) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
        
        this.validateInput();
    }
    
    updateButtons() {
        this.hostBtn.disabled = !this.isValid;
        this.joinBtn.disabled = !this.isValid;
    }
    
    saveAndProceed() {
        savePlayerData(this.username, this.color);
    }
    
    show() {
        showElement(this.mainMenu);
    }
    
    hide() {
        hideElement(this.mainMenu);
    }
    
    showModeSelection() {
        showElement(this.modeSelection);
    }
    
    hideModeSelection() {
        hideElement(this.modeSelection);
    }
    
    getPlayerData() {
        return {
            username: this.username,
            color: this.color
        };
    }
}

// Export singleton instance
export const menuManager = new MenuManager();

// Show menu after assets load
window.addEventListener('load', () => {
    // Menu will be shown by game.js after assets load
});
