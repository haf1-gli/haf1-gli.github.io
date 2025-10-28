// utils.js - Shared constants, validation, and helpers

// === COLOR PALETTE ===
export const COLORS = {
    red: '#FF0000',
    blue: '#0000FF',
    yellow: '#FFFF00',
    pink: '#FF69B4',
    magenta: '#FF00FF',
    white: '#FFFFFF',
    black: '#000000'
};

export const COLOR_NAMES = Object.keys(COLORS);

// === USERNAME VALIDATION ===
export function validateUsername(username) {
    const trimmed = username.trim();
    
    if (trimmed.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }
    
    if (trimmed.length > 12) {
        return { valid: false, error: 'Username must be 12 characters or less' };
    }
    
    // Only letters and numbers
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
        return { valid: false, error: 'Only letters and numbers allowed' };
    }
    
    return { valid: true, username: trimmed };
}

// === WIN MESSAGES ===
export const WIN_MESSAGES = [
    "Looks like {winner} is on fire!",
    "AND ONE FOR {winner}!",
    "Too bad, {loser} — step it up!",
    "Oof, dirty shot by {winner}!",
    "{winner} dominates the battlefield!",
    "{loser} got SMOKED!",
    "Boom! {winner} takes the round.",
    "{winner} laughs in turret.",
    "Critical hit! {winner} wins again.",
    "{loser} needs a bigger gun.",
    "{winner} is unstoppable!",
    "Get wrecked, {loser}!",
    "{winner} strikes again!",
    "Another one bites the dust — RIP {loser}",
    "{winner} is the tank master!",
    "{loser} should probably practice more...",
    "Absolutely brutal! {winner} wins!",
    "{winner} with the clutch shot!",
    "Game over for {loser}!",
    "{winner} makes it look easy!"
];

export function getRandomWinMessage(winner, loser) {
    const template = WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];
    return template.replace('{winner}', winner).replace('{loser}', loser);
}

// === CODE GENERATION (6-digit alphanumeric) ===
export function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

export function validateCodeFormat(code) {
    return /^[A-Z0-9]{6}$/.test(code.toUpperCase());
}

// === LOCAL STORAGE ===
export function savePlayerData(username, color) {
    localStorage.setItem('tankGamePlayer', JSON.stringify({ username, color }));
}

export function loadPlayerData() {
    const data = localStorage.getItem('tankGamePlayer');
    if (data) {
        try {
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }
    return null;
}

// === GAME MODES ===
export const GAME_MODES = {
    BO3: 'bo3',
    BO5: 'bo5',
    INFINITE: 'infinite'
};

export function getWinThreshold(mode) {
    switch (mode) {
        case GAME_MODES.BO3: return 2;
        case GAME_MODES.BO5: return 3;
        case GAME_MODES.INFINITE: return Infinity;
        default: return Infinity;
    }
}

// === ENCODING/DECODING (Base64 URL-safe for WebRTC offers/answers) ===
export function encodeToCode(jsonString) {
    try {
        // Compress JSON, convert to base64, then to 6-char code (simplified)
        // In reality, we'll use a mapping system or hash
        const compressed = btoa(jsonString).replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase();
        return compressed.padEnd(6, '0');
    } catch (e) {
        console.error('Encoding error:', e);
        return generateCode(); // Fallback
    }
}

export function decodeFromCode(code) {
    // This is a placeholder - actual implementation needs proper encoding
    // For now, we'll store the full offer/answer in the code exchange
    return code;
}

// === STUN SERVERS ===
export const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
];

// === NETWORK MESSAGE TYPES ===
export const MSG_TYPES = {
    // Player state
    PLAYER_UPDATE: 'player_update',
    
    // Shooting
    BULLET_SPAWN: 'bullet_spawn',
    
    // Damage
    DAMAGE: 'damage',
    DEATH: 'death',
    
    // Game state
    GAME_START: 'game_start',
    ROUND_START: 'round_start',
    ROUND_END: 'round_end',
    GAME_END: 'game_end',
    
    // Player info
    PLAYER_INFO: 'player_info',
    
    // Handshake
    READY: 'ready',
    
    // Sync
    SYNC_REQUEST: 'sync_request',
    SYNC_RESPONSE: 'sync_response'
};

// === PLAYER ROLES ===
export const ROLES = {
    HOST: 'host',
    CLIENT: 'client'
};

// === MATH HELPERS ===
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// === COPY TO CLIPBOARD ===
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        } catch (e) {
            document.body.removeChild(textArea);
            return false;
        }
    }
}

// === DOM HELPERS ===
export function showElement(element) {
    if (element) element.classList.add('active');
}

export function hideElement(element) {
    if (element) element.classList.remove('active');
}

export function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// === DEBOUNCE ===
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// === PROMISE TIMEOUT ===
export function promiseWithTimeout(promise, timeoutMs, timeoutError = 'Timeout') {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
        )
    ]);
}

// === EVENT EMITTER (Simple Pub/Sub) ===
export class EventEmitter {
    constructor() {
        this.events = {};
    }
    
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }
    
    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
    
    emit(event, ...args) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(...args));
    }
    
    once(event, callback) {
        const onceWrapper = (...args) => {
            callback(...args);
            this.off(event, onceWrapper);
        };
        this.on(event, onceWrapper);
    }
}

// === TEST MODE HELPERS ===
export function isTestMode() {
    return window.location.search.includes('test') || window.localStorage.getItem('testMode') === 'true';
}

export function setTestMode(enabled) {
    if (enabled) {
        window.localStorage.setItem('testMode', 'true');
    } else {
        window.localStorage.removeItem('testMode');
    }
}
