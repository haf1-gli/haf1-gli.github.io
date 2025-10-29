// game.js - Main game loop with multiplayer synchronization (COMPLETE VERSION)

import * as THREE from 'three';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { 
    COLORS,
    MSG_TYPES,
    ROLES,
    GAME_MODES,
    getWinThreshold,
    getRandomWinMessage,
    showElement,
    hideElement
} from './utils.js';

import { menuManager } from './menu.js';
import { webrtcManager } from './webrtc.js';
import { cutsceneManager, setThreeReference } from './cutscene.js';

// === GAME STATE ===
class GameState {
    constructor() {
        this.isMultiplayer = false;
        this.isTestMode = false;
        this.role = null;
        this.localPlayer = null;
        this.remotePlayer = null;
        this.player1 = { username: '', color: '', score: 0, health: 100, tank: null };
        this.player2 = { username: '', color: '', score: 0, health: 100, tank: null };
        this.gameMode = GAME_MODES.INFINITE;
        this.winThreshold = Infinity;
        this.isRoundActive = false;
        this.respawnTimers = { player1: 0, player2: 0 };
        this.isControlsLocked = false;
        this.gameStarted = false;
    }
}

const gameState = new GameState();

// === THREE.JS CORE ===
let camera, scene, renderer, clock;
let ground;
let raycaster, collisionRaycaster, bulletRaycaster;
let mainLoadingManager;
let audioListener;
let explosionSpriteSheet, explosionSoundBuffer;
let woodParticleGeometry, woodParticleMaterial;

// === SCENE OBJECTS ===
const collidables = [];
const trees = [];
const barriers = [];
const bullets = [];
const explosions = [];
const particles = [];

// FIX: Store decoration positions for sync
const decorationPositions = {
    warehouses: [],
    trees: [],
    barriers: []
};

// === TANKS ===
let player1Tank, player2Tank;
let player1TankHead, player1TankTurret, player1TankHeadPivot, player1TankTurretPivot;
let player2TankHead, player2TankTurret, player2TankHeadPivot, player2TankTurretPivot;

// === MOVEMENT STATE ===
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;

// === PLAYER PHYSICS (Local) ===
const localPlayerVelocity = new THREE.Vector3();
let localPlayerAngularVelocity = 0.0;
let localPlayerYaw = 0.0;

// === REMOTE PLAYER STATE ===
const remotePlayerState = {
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    headRotation: 0,
    turretRotation: 0,
    velocity: new THREE.Vector3(),
    lastUpdate: 0
};

// === CONSTANTS ===
const playerAcceleration = 60.0;
const playerDamping = 10.0;
const playerTurnAcceleration = 15.0;
const playerTurnDamping = 20.0;
const headTurnSpeed = 1.5;
const turretPitchSpeed = 2.0;
const maxPlayerHealth = 100;
const reloadTime = 3.0;
const bulletSpeed = 197.0;
const bulletGravityStrength = 50.0;
const explosionDuration = 0.8;
const explosionSize = 20.0;
const explosionBlastRadius = 10.0;
const explosionMaxDamage = 50.0;

// === SHOOTING STATE ===
let canShoot = true;
const shootCooldown = 0.2;
let isReloading = false;
let isReloaded = true;
let reloadProgress = 1.0;

// === CAMERA ===
let cameraYaw = 0, cameraPitch = 0.4;
let mouseX = 0, mouseY = 0;
let isMouseDown = false, previousMouseX = 0, previousMouseY = 0;
const cameraDistance = 15.0;
const cameraLookAtOffset = new THREE.Vector3(0, 2, 0);
const cameraPitchMin = 0.1, cameraPitchMax = 1.4;
const defaultFov = 75;

// === PRECISION AIM ===
let isPrecisionAiming = false;
let isPointerLocked = false;
let precisionZoomLevel = 0;
const precisionFovBase = 20;
const precisionFovMin = 15;
const precisionAimSensitivity = 0.001;

// === UI ELEMENTS ===
let healthBarFill, reloadBarFill, vignetteElement, crosshairElement;
let actionInstructionsElement, initialInstructionsElement, precisionExitInstructionsElement;
let scoreboardElement, scoreLeftElement, scoreRightElement;
let winMessageElement, gameUIElement;

// === INITIALIZATION ===
init();
animate();

function init() {
    console.log('Initializing game...');
    
    setThreeReference(THREE);
    
    // Get UI elements
    healthBarFill = document.getElementById('health-bar-fill');
    reloadBarFill = document.getElementById('reload-bar-fill');
    vignetteElement = document.getElementById('vignette');
    crosshairElement = document.getElementById('crosshair');
    actionInstructionsElement = document.getElementById('action-instructions');
    initialInstructionsElement = document.getElementById('initial-instructions');
    precisionExitInstructionsElement = document.getElementById('precision-exit-instructions');
    scoreboardElement = document.getElementById('scoreboard');
    scoreLeftElement = document.getElementById('score-left');
    scoreRightElement = document.getElementById('score-right');
    winMessageElement = document.getElementById('win-message');
    gameUIElement = document.getElementById('game-ui');
    
    // Loading Manager
    const loadingScreen = document.getElementById('loading-screen');
    mainLoadingManager = new THREE.LoadingManager();
    mainLoadingManager.onLoad = () => {
        console.log('Assets loaded');
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            showMainMenu();
        }, 1000);
    };
    
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 400);
    
    // Camera
    camera = new THREE.PerspectiveCamera(defaultFov, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 20, 20);
    
    // Audio
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    // Clock
    clock = new THREE.Clock();
    
    // Raycasters
    raycaster = new THREE.Raycaster();
    collisionRaycaster = new THREE.Raycaster();
    bulletRaycaster = new THREE.Raycaster();
    
    // Load assets
    loadAssets();
    
    // Generate map
    generateMap();
    
    // Lighting
    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x00ff00, 0.8);
    scene.add(hemisphereLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);
    
    // Input listeners
    setupInputListeners();
    
    // Menu listeners
    setupMenuListeners();
    
    // WebRTC listeners
    setupWebRTCListeners();
    
    // Cutscene listeners
    setupCutsceneListeners();
    
    // Window resize
    window.addEventListener('resize', onWindowResize);
    
    // Initialize cutscene manager
    cutsceneManager.init(camera, scene, renderer);
}

// === SHOW MAIN MENU ===
function showMainMenu() {
    menuManager.show();
}

// === ASSET LOADING ===
function loadAssets() {
    const textureLoader = new THREE.TextureLoader(mainLoadingManager);
    const audioLoader = new THREE.AudioLoader(mainLoadingManager);
    
    explosionSpriteSheet = textureLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/texture/explose.png'
    );
    
    audioLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/sounds/explosion-312361.mp3',
        (buffer) => { explosionSoundBuffer = buffer; }
    );
    
    woodParticleGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.1);
    woodParticleMaterial = new THREE.MeshBasicMaterial({ color: 0x5c3a21 });
}

// === MAP GENERATION ===
function generateMap() {
    const textureLoader = new THREE.TextureLoader(mainLoadingManager);
    const grassTexture = textureLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/texture/grass.jpg',
        (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(25, 25);
        }
    );
    
    const groundGeometry = new THREE.PlaneGeometry(500, 500, 100, 100);
    const positions = groundGeometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        const zOffset = 
            Math.sin(vertex.x * 0.005) * Math.cos(vertex.y * 0.005) * 8 +
            Math.sin(vertex.x * 0.02) * Math.cos(vertex.y * 0.02) * 3;
        positions.setZ(i, zOffset);
    }
    groundGeometry.computeVertexNormals();
    
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        map: grassTexture, 
        side: THREE.DoubleSide 
    });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    
    loadWarehouse(mainLoadingManager);
    loadTrees(mainLoadingManager);
    loadBarriers(mainLoadingManager);
}

// === DECORATION LOADERS ===
function loadWarehouse(manager) {
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/warehouse.glb',
        (gltf) => {
            const model = gltf.scene;
            const count = THREE.MathUtils.randInt(6, 8);
            const groundRaycaster = new THREE.Raycaster();
            
            for (let i = 0; i < count; i++) {
                const warehouse = model.clone();
                warehouse.userData.type = 'warehouse';
                warehouse.scale.set(120, 120, 120);
                
                const x = THREE.MathUtils.randFloat(-225, 225);
                const z = THREE.MathUtils.randFloat(-225, 225);
                warehouse.rotation.y = Math.random() * Math.PI * 2;
                
                const rayStart = new THREE.Vector3(x, 100, z);
                groundRaycaster.set(rayStart, new THREE.Vector3(0, -1, 0));
                const intersects = groundRaycaster.intersectObject(ground);
                let groundY = 0;
                if (intersects.length > 0) {
                    groundY = intersects[0].point.y;
                }
                
                warehouse.position.set(x, groundY + 0.8, z);
                
                scene.add(warehouse);
                collidables.push(warehouse);
                
                decorationPositions.warehouses.push({
                    x, y: groundY + 0.8, z, rotY: warehouse.rotation.y
                });
            }
        }
    );
}

function loadTrees(manager) {
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/giant_low_poly_tree.glb',
        (gltf) => {
            const model = gltf.scene;
            const count = THREE.MathUtils.randInt(15, 20);
            const groundRaycaster = new THREE.Raycaster();
            
            for (let i = 0; i < count; i++) {
                const tree = model.clone();
                tree.userData.type = 'tree';
                tree.userData.id = `tree_${i}`;
                
                const scale = THREE.MathUtils.randFloat(0.8, 1.0);
                tree.scale.set(scale, scale, scale);
                
                const x = THREE.MathUtils.randFloat(-225, 225);
                const z = THREE.MathUtils.randFloat(-225, 225);
                tree.rotation.y = Math.random() * Math.PI * 2;
                
                const rayStart = new THREE.Vector3(x, 100, z);
                groundRaycaster.set(rayStart, new THREE.Vector3(0, -1, 0));
                const intersects = groundRaycaster.intersectObject(ground);
                let groundY = 0;
                if (intersects.length > 0) {
                    groundY = intersects[0].point.y;
                }
                
                tree.position.set(x, groundY, z);
                
                scene.add(tree);
                collidables.push(tree);
                trees.push(tree);
                
                decorationPositions.trees.push({
                    id: tree.userData.id,
                    x, y: groundY, z, 
                    rotY: tree.rotation.y,
                    scale
                });
            }
        }
    );
}

function loadBarriers(manager) {
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/concrete_armored_barrier.glb',
        (gltf) => {
            const model = gltf.scene;
            const count = THREE.MathUtils.randInt(15, 25);
            const groundRaycaster = new THREE.Raycaster();
            
            for (let i = 0; i < count; i++) {
                const barrier = model.clone();
                barrier.userData.type = 'barrier';
                barrier.scale.set(2.2, 2.2, 2.2);
                
                const x = THREE.MathUtils.randFloat(-225, 225);
                const z = THREE.MathUtils.randFloat(-225, 225);
                barrier.rotation.y = Math.random() * Math.PI * 2;
                
                const rayStart = new THREE.Vector3(x, 100, z);
                groundRaycaster.set(rayStart, new THREE.Vector3(0, -1, 0));
                const intersects = groundRaycaster.intersectObject(ground);
                let groundY = 0;
                if (intersects.length > 0) {
                    groundY = intersects[0].point.y;
                }
                
                barrier.position.set(x, groundY - 0.4, z);
                
                scene.add(barrier);
                collidables.push(barrier);
                barriers.push(barrier);
                
                decorationPositions.barriers.push({
                    x, y: groundY - 0.4, z, rotY: barrier.rotation.y
                });
            }
        }
    );
}

// === MENU LISTENERS ===
function setupMenuListeners() {
    menuManager.on('host', (mode) => {
        console.log('Host game:', mode);
        gameState.gameMode = mode;
        gameState.winThreshold = getWinThreshold(mode);
        gameState.role = ROLES.HOST;
        gameState.isMultiplayer = true;
        
        const playerData = menuManager.getPlayerData();
        gameState.player1.username = playerData.username;
        gameState.player1.color = playerData.color;
        
        menuManager.hide();
        menuManager.hideModeSelection();
        webrtcManager.startHost();
    });
    
    menuManager.on('join', () => {
        console.log('Join game');
        gameState.role = ROLES.CLIENT;
        gameState.isMultiplayer = true;
        
        const playerData = menuManager.getPlayerData();
        gameState.player2.username = playerData.username;
        gameState.player2.color = playerData.color;
        
        menuManager.hide();
        webrtcManager.startJoin();
    });
    
    menuManager.on('test-mode', () => {
        console.log('Test mode activated');
        gameState.isTestMode = true;
        gameState.role = ROLES.HOST;
        gameState.isMultiplayer = false;
        gameState.gameMode = GAME_MODES.BO3;
        gameState.winThreshold = 2;
        
        const playerData = menuManager.getPlayerData();
        gameState.player1.username = playerData.username;
        gameState.player1.color = playerData.color;
        gameState.player2.username = 'DummyBot';
        gameState.player2.color = 'blue';
        
        menuManager.hide();
        startGame();
    });
}

// === WEBRTC LISTENERS ===
function setupWebRTCListeners() {
    webrtcManager.on('connected', (role) => {
        console.log('WebRTC connected as', role);
        
        const playerData = menuManager.getPlayerData();
        webrtcManager.send(MSG_TYPES.PLAYER_INFO, {
            username: playerData.username,
            color: playerData.color
        });
        
        if (role === ROLES.HOST) {
            webrtcManager.send(MSG_TYPES.GAME_START, {
                mode: gameState.gameMode,
                mapData: decorationPositions
            });
        }
    });
    
    webrtcManager.on('message', (message) => {
        handleNetworkMessage(message);
    });
    
    webrtcManager.on('disconnected', () => {
        console.log('WebRTC disconnected');
    });
    
    webrtcManager.on('cancelled', () => {
        console.log('Connection cancelled');
        showMainMenu();
    });
}

// === CUTSCENE LISTENERS ===
function setupCutsceneListeners() {
    cutsceneManager.on('trigger-explosion', (position) => {
        createExplosion(position, false);
    });
}

// === NETWORK MESSAGE HANDLER ===
function handleNetworkMessage(message) {
    switch (message.type) {
        case MSG_TYPES.PLAYER_INFO:
            if (gameState.role === ROLES.HOST) {
                gameState.player2.username = message.data.username;
                gameState.player2.color = message.data.color;
            } else {
                gameState.player1.username = message.data.username;
                gameState.player1.color = message.data.color;
            }
            break;
            
        case MSG_TYPES.GAME_START:
            gameState.gameMode = message.data.mode;
            gameState.winThreshold = getWinThreshold(message.data.mode);
            if (message.data.mapData) {
                syncMapFromHost(message.data.mapData);
            }
            startGame();
            break;
            
        case MSG_TYPES.PLAYER_UPDATE:
            updateRemotePlayer(message.data);
            break;
            
        case MSG_TYPES.BULLET_SPAWN:
            spawnRemoteBullet(message.data);
            break;
            
        case MSG_TYPES.DAMAGE:
            handleRemoteDamage(message.data);
            break;
            
        case MSG_TYPES.DEATH:
            handleRemoteDeath(message.data);
            break;
            
        case MSG_TYPES.ROUND_END:
            handleRoundEnd(message.data);
            break;
            
        case MSG_TYPES.TREE_DESTROYED:
            handleRemoteTreeDestruction(message.data);
            break;
    }
}

function syncMapFromHost(mapData) {
    console.log('Syncing map from host', mapData);
    decorationPositions.warehouses = mapData.warehouses || [];
    decorationPositions.trees = mapData.trees || [];
    decorationPositions.barriers = mapData.barriers || [];
}

function handleRemoteTreeDestruction(data) {
    const treeId = data.treeId;
    for (let i = trees.length - 1; i >= 0; i--) {
        if (trees[i].userData.id === treeId) {
            scene.remove(trees[i]);
            trees.splice(i, 1);
            
            const colIdx = collidables.indexOf(trees[i]);
            if (colIdx > -1) collidables.splice(colIdx, 1);
            break;
        }
    }
}

function handleRoundEnd(data) {
    // Placeholder for round end logic
}

// === START GAME ===
function startGame() {
    console.log('Starting game...', gameState);
    
    gameState.gameStarted = true;
    
    createTanks();
    
    showElement(gameUIElement);
    showElement(scoreboardElement);
    
    updateScoreboard();
    
    gameState.isRoundActive = true;
    
    if (gameState.isMultiplayer && !gameState.isTestMode) {
        webrtcManager.send(MSG_TYPES.READY, {});
    }
}

// === CREATE TANKS ===
function createTanks() {
    player1Tank = createTankGroup(gameState.player1.color, new THREE.Vector3(-50, 30, 0));
    gameState.player1.tank = player1Tank;
    
    player2Tank = createTankGroup(gameState.player2.color, new THREE.Vector3(50, 30, 0));
    gameState.player2.tank = player2Tank;
    
    if (gameState.role === ROLES.HOST) {
        gameState.localPlayer = gameState.player1;
        gameState.remotePlayer = gameState.player2;
    } else {
        gameState.localPlayer = gameState.player2;
        gameState.remotePlayer = gameState.player1;
    }
    
    loadTankModels(player1Tank, 'player1');
    loadTankModels(player2Tank, 'player2');
}

function createTankGroup(color, position) {
    const tank = new THREE.Group();
    tank.position.copy(position);
    
    const geometry = new THREE.BoxGeometry(2.5, 0.5, 3);
    const material = new THREE.MeshStandardMaterial({ 
        color: COLORS[color], 
        transparent: true, 
        opacity: 0.5 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.25;
    tank.add(mesh);
    
    scene.add(tank);
    return tank;
}

function loadTankModels(tank, playerKey) {
    const headPivot = new THREE.Group();
    headPivot.position.set(-0.2, 0.3, 1.3);
    tank.add(headPivot);
    
    if (playerKey === 'player1') {
        player1TankHeadPivot = headPivot;
    } else {
        player2TankHeadPivot = headPivot;
    }
    
    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();
    
    mtlLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/tank/body.mtl',
        (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(
                'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/tank/body.obj',
                (object) => {
                    object.scale.set(0.1, 0.1, 0.1);
                    object.position.set(-2, -1, -1);
                    object.rotation.set(-Math.PI/2, 0, -Math.PI/2);
                    tank.add(object);
                }
            );
        }
    );
    
    mtlLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/tank/head.mtl',
        (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(
                'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/tank/head.obj',
                (object) => {
                    object.scale.set(0.1, 0.1, 0.1);
                    object.position.set(1.9, 0, -7.2);
                    object.rotation.set(-Math.PI/2, 0, -Math.PI/2);
                    headPivot.add(object);
                    
                    if (playerKey === 'player1') {
                        player1TankHead = object;
                    } else {
                        player2TankHead = object;
                    }
                    
                    loadTurret(object, playerKey);
                }
            );
        }
    );
}

function loadTurret(headObject, playerKey) {
    const turretPivot = new THREE.Group();
    turretPivot.position.set(67.1, 0, 0);
    headObject.add(turretPivot);
    
    if (playerKey === 'player1') {
        player1TankTurretPivot = turretPivot;
    } else {
        player2TankTurretPivot = turretPivot;
    }
    
    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();
    
    mtlLoader.load(
        'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/tank/turret.mtl',
        (materials) => {
            materials.preload();
            objLoader.setMaterials(materials);
            objLoader.load(
                'https://raw.githubusercontent.com/haf1-gli/haf1-gli.github.io/main/assets/models/tank/turret.obj',
                (object) => {
                    object.scale.set(1, 1, 1);
                    object.position.set(-32.6, 0, 1);
                    turretPivot.add(object);
                    
                    if (playerKey === 'player1') {
                        player1TankTurret = object;
                    } else {
                        player2TankTurret = object;
                    }
                }
            );
        }
    );
}

// === INPUT LISTENERS ===
function setupInputListeners() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('wheel', onMouseWheel);
    document.addEventListener('pointerlockchange', onPointerLockChange);
}

function onKeyDown(event) {
    if (gameState.isControlsLocked || !gameState.gameStarted) return;
    
    hideInitialInstructions();
    
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'KeyE': shoot(); break;
        case 'KeyR':
            if (!isReloading && !isReloaded) {
                isReloading = true;
                updateActionInstructions();
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'KeyR':
            isReloading = false;
            updateActionInstructions();
            break;
    }
}

function onMouseDown(event) {
    if (gameState.isControlsLocked || !gameState.gameStarted) return;
    hideInitialInstructions();
    if (event.button === 0) {
        isMouseDown = true;
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
    }
}

function onMouseUp(event) {
    if (event.button === 0) {
        isMouseDown = false;
    }
}

function onMouseMove(event) {
    if (gameState.isControlsLocked || !gameState.gameStarted) return;
    
    mouseX = event.clientX;
    mouseY = event.clientY;
    
    if (isPrecisionAiming && isPointerLocked) {
        cameraYaw -= event.movementX * precisionAimSensitivity;
        cameraPitch += event.movementY * precisionAimSensitivity;
        cameraPitch = THREE.MathUtils.clamp(cameraPitch, cameraPitchMin, cameraPitchMax);
    } else if (isMouseDown && !isPrecisionAiming) {
        hideInitialInstructions();
        const deltaX = event.clientX - previousMouseX;
        const deltaY = event.clientY - previousMouseY;
        cameraYaw -= deltaX * 0.005;
        cameraPitch += deltaY * 0.005;
        cameraPitch = THREE.MathUtils.clamp(cameraPitch, cameraPitchMin, cameraPitchMax);
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
    }
}

function onContextMenu(event) {
    if (gameState.isControlsLocked || !gameState.gameStarted) return;
    hideInitialInstructions();
    event.preventDefault();
    togglePrecisionAim();
}

function onMouseWheel(event) {
    if (gameState.isControlsLocked || !gameState.gameStarted) return;
    hideInitialInstructions();
    if (isPrecisionAiming) {
        precisionZoomLevel += event.deltaY * -0.001;
        precisionZoomLevel = THREE.MathUtils.clamp(precisionZoomLevel, 0, 1);
    }
}

function onPointerLockChange() {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    if (!isPointerLocked && isPrecisionAiming) {
        isPrecisionAiming = false;
        hideElement(vignetteElement);
        hideElement(crosshairElement);
        hideElement(precisionExitInstructionsElement);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function togglePrecisionAim() {
    isPrecisionAiming = !isPrecisionAiming;
    if (isPrecisionAiming) {
        renderer.domElement.requestPointerLock();
        showElement(vignetteElement);
        showElement(crosshairElement);
        showElement(precisionExitInstructionsElement);
    } else {
        document.exitPointerLock();
        hideElement(vignetteElement);
        hideElement(crosshairElement);
        hideElement(precisionExitInstructionsElement);
        precisionZoomLevel = 0;
    }
}

function hideInitialInstructions() {
    if (initialInstructionsElement && !initialInstructionsElement.classList.contains('hidden')) {
        initialInstructionsElement.classList.add('hidden');
        setTimeout(() => {
            if (initialInstructionsElement && initialInstructionsElement.parentNode) {
                initialInstructionsElement.parentNode.removeChild(initialInstructionsElement);
                initialInstructionsElement = null;
            }
        }, 500);
    }
}

// === SHOOTING ===
function shoot() {
    if (!canShoot || !isReloaded || gameState.isControlsLocked) return;
    if (!gameState.localPlayer || !gameState.localPlayer.tank) return;
    
    const turret = gameState.role === ROLES.HOST ? player1TankTurret : player2TankTurret;
    if (!turret) return;
    
    canShoot = false;
    setTimeout(() => { canShoot = true; }, shootCooldown * 1000);
    
    isReloaded = false;
    reloadProgress = 0.0;
    updateReloadBar();
    updateActionInstructions();
    
    const muzzlePos = new THREE.Vector3(20, -18.6, 5.3);
    const muzzleRot = new THREE.Euler(0, 91 * Math.PI / 180, 0);
    
    const muzzleWorldPos = new THREE.Vector3();
    muzzleWorldPos.copy(muzzlePos);
    turret.localToWorld(muzzleWorldPos);
    
    const muzzleDirection = new THREE.Vector3(0, 0, -1);
    const muzzleWorldQuat = new THREE.Quaternion();
    turret.getWorldQuaternion(muzzleWorldQuat);
    const muzzleOffsetQuat = new THREE.Quaternion().setFromEuler(muzzleRot);
    muzzleWorldQuat.multiply(muzzleOffsetQuat);
    muzzleDirection.applyQuaternion(muzzleWorldQuat).normalize();
    
    spawnBullet(muzzleWorldPos, muzzleDirection, true);
    
    if (gameState.isMultiplayer && !gameState.isTestMode) {
        webrtcManager.send(MSG_TYPES.BULLET_SPAWN, {
            position: muzzleWorldPos.toArray(),
            direction: muzzleDirection.toArray()
        });
    }
}

function spawnBullet(position, direction, isLocal) {
    const bulletGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    bullet.position.copy(position);
    bullet.velocity = direction.clone().multiplyScalar(bulletSpeed);
    bullet.age = 0;
    bullet.lastPosition = bullet.position.clone();
    bullet.isLocal = isLocal;
    
    scene.add(bullet);
    bullets.push(bullet);
}

function spawnRemoteBullet(data) {
    const position = new THREE.Vector3().fromArray(data.position);
    const direction = new THREE.Vector3().fromArray(data.direction);
    spawnBullet(position, direction, false);
}

function updateBullets(delta) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.lastPosition.copy(bullet.position);
        bullet.velocity.y -= bulletGravityStrength * delta;
        bullet.position.add(bullet.velocity.clone().multiplyScalar(delta));
        
        const bulletTravelVec = bullet.position.clone().sub(bullet.lastPosition);
        const bulletTravelDist = bulletTravelVec.length();
        bulletTravelVec.normalize();
        
        if (bulletTravelDist > 0) {
            bulletRaycaster.set(bullet.lastPosition, bulletTravelVec);
            bulletRaycaster.far = bulletTravelDist;
            
            const objectsToHit = [ground, ...collidables];
            const intersects = bulletRaycaster.intersectObjects(objectsToHit, true);
            
            if (intersects.length > 0) {
                createExplosion(intersects[0].point, bullet.isLocal);
                removeBullet(bullet, i);
                continue;
            }
        }
        
        bullet.age += delta;
        if (bullet.age > 5.0) {
            removeBullet(bullet, i);
        }
    }
}

function removeBullet(bullet, index) {
    scene.remove(bullet);
    bullets.splice(index, 1);
}

// === EXPLOSIONS ===
function createExplosion(position, isLocal = true) {
    if (!explosionSpriteSheet || !explosionSoundBuffer) return;
    
    const explosionMaterial = new THREE.MeshBasicMaterial({
        map: explosionSpriteSheet.clone(),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const explosionGeometry = new THREE.PlaneGeometry(1, 1);
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    explosion.scale.setScalar(0.1 * (explosionSize / 10.0));
    explosion.userData.age = 0;
    explosion.userData.currentFrame = 0;
    
    const sound = new THREE.PositionalAudio(audioListener);
    sound.setBuffer(explosionSoundBuffer);
    sound.setRefDistance(20);
    sound.setRolloffFactor(1);
    sound.setMaxDistance(200);
    sound.setVolume(1.0);
    
    const audioHelper = new THREE.Group();
    audioHelper.position.copy(position);
    scene.add(audioHelper);
    audioHelper.add(sound);
    explosion.userData.audioHelper = audioHelper;
    explosion.userData.audio = sound;
    
    scene.add(explosion);
    explosions.push(explosion);
    sound.play();
    
    if (isLocal) {
        checkExplosionDamage(position);
    }
}

function checkExplosionDamage(position) {
    if (player1Tank) {
        const distance = position.distanceTo(player1Tank.position);
        if (distance < explosionBlastRadius) {
            const damageRatio = Math.max(0, 1.0 - (distance / explosionBlastRadius));
            const damage = explosionMaxDamage * damageRatio;
            
            if (gameState.role === ROLES.HOST) {
                gameState.player1.health -= damage;
                gameState.player1.health = Math.max(0, gameState.player1.health);
                updateHealthBar();
                
                if (gameState.player1.health <= 0) {
                    handleLocalDeath();
                }
            } else {
                if (gameState.isMultiplayer && !gameState.isTestMode) {
                    webrtcManager.send(MSG_TYPES.DAMAGE, { damage, target: 'player1' });
                }
            }
        }
    }
    
    if (player2Tank) {
        const distance = position.distanceTo(player2Tank.position);
        if (distance < explosionBlastRadius) {
            const damageRatio = Math.max(0, 1.0 - (distance / explosionBlastRadius));
            const damage = explosionMaxDamage * damageRatio;
            
            if (gameState.role === ROLES.CLIENT) {
                gameState.player2.health -= damage;
                gameState.player2.health = Math.max(0, gameState.player2.health);
                updateHealthBar();
                
                if (gameState.player2.health <= 0) {
                    handleLocalDeath();
                }
            } else {
                if (gameState.isMultiplayer && !gameState.isTestMode) {
                    webrtcManager.send(MSG_TYPES.DAMAGE, { damage, target: 'player2' });
                }
            }
        }
    }
    
    for (let i = collidables.length - 1; i >= 0; i--) {
        const collidable = collidables[i];
        if (collidable.userData.type === 'tree') {
            const distance = position.distanceTo(collidable.position);
            if (distance < explosionBlastRadius + 5) {
                spawnWoodParticles(collidable.position);
                scene.remove(collidable);
                collidables.splice(i, 1);
                const treeIdx = trees.indexOf(collidable);
                if (treeIdx > -1) trees.splice(treeIdx, 1);
                
                if (gameState.isMultiplayer && !gameState.isTestMode) {
                    webrtcManager.send(MSG_TYPES.TREE_DESTROYED, {
                        treeId: collidable.userData.id
                    });
                }
            }
        }
    }
}

function updateExplosions(delta) {
    const explosionRows = 8, explosionCols = 8, explosionTotalFrames = 64;
    
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        explosion.userData.age += delta;
        const progress = explosion.userData.age / explosionDuration;
        
        if (progress >= 1) {
            if (explosion.userData.audio && explosion.userData.audio.isPlaying) {
                explosion.userData.audio.stop();
            }
            if (explosion.userData.audioHelper) {
                scene.remove(explosion.userData.audioHelper);
            }
            scene.remove(explosion);
            if (explosion.material.map) explosion.material.map.dispose();
            explosion.material.dispose();
            explosions.splice(i, 1);
        } else {
            const frame = Math.floor(progress * explosionTotalFrames);
            if (frame !== explosion.userData.currentFrame) {
                explosion.userData.currentFrame = frame;
                const row = Math.floor(frame / explosionCols);
                const col = frame % explosionCols;
                if (explosion.material.map) {
                    explosion.material.map.offset.x = col / explosionCols;
                    explosion.material.map.offset.y = 1.0 - (row + 1) / explosionRows;
                    explosion.material.map.repeat.set(1 / explosionCols, 1 / explosionRows);
                }
            }
            explosion.scale.setScalar(THREE.MathUtils.lerp(
                0.1 * (explosionSize / 10.0),
                explosionSize,
                progress
            ));
            explosion.lookAt(camera.position);
        }
    }
}

// === WOOD PARTICLES ===
function spawnWoodParticles(position) {
    if (!woodParticleGeometry || !woodParticleMaterial) return;
    
    const count = THREE.MathUtils.randInt(10, 15);
    for (let i = 0; i < count; i++) {
        const particle = new THREE.Mesh(woodParticleGeometry, woodParticleMaterial);
        particle.position.copy(position).add(
            new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 1.5,
                (Math.random() - 0.5) * 2
            )
        );
        particle.scale.set(
            THREE.MathUtils.randFloat(0.5, 1.5),
            THREE.MathUtils.randFloat(1.0, 3.0),
            THREE.MathUtils.randFloat(0.5, 1.5)
        );
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            Math.random() * 5 + 5,
            (Math.random() - 0.5) * 10
        );
        const rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
        );
        
        particle.userData = { velocity, rotationSpeed, age: 0 };
        scene.add(particle);
        particles.push(particle);
    }
}

function updateParticles(delta) {
    const particleGravity = 9.8;
    const particleLifespan = 3.0;
    
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        const data = particle.userData;
        
        data.velocity.y -= particleGravity * delta;
        particle.position.add(data.velocity.clone().multiplyScalar(delta));
        particle.rotation.x += data.rotationSpeed.x * delta;
        particle.rotation.y += data.rotationSpeed.y * delta;
        particle.rotation.z += data.rotationSpeed.z * delta;
        
        data.age += delta;
        if (data.age >= particleLifespan) {
            scene.remove(particle);
            particles.splice(i, 1);
        }
    }
}

// === DAMAGE HANDLING ===
function handleRemoteDamage(data) {
    if (data.target === 'player1' && gameState.role === ROLES.HOST) {
        gameState.player1.health -= data.damage;
        gameState.player1.health = Math.max(0, gameState.player1.health);
        updateHealthBar();
        
        if (gameState.player1.health <= 0) {
            handleLocalDeath();
        }
    } else if (data.target === 'player2' && gameState.role === ROLES.CLIENT) {
        gameState.player2.health -= data.damage;
        gameState.player2.health = Math.max(0, gameState.player2.health);
        updateHealthBar();
        
        if (gameState.player2.health <= 0) {
            handleLocalDeath();
        }
    }
}

function handleLocalDeath() {
    console.log('Local player died');
    
    if (gameState.isMultiplayer && !gameState.isTestMode) {
        webrtcManager.send(MSG_TYPES.DEATH, {});
    }
    
    gameState.remotePlayer.score++;
    updateScoreboard();
    
    const winMessage = getRandomWinMessage(
        gameState.remotePlayer.username,
        gameState.localPlayer.username
    );
    showWinMessage(winMessage, gameState.remotePlayer.color);
    
    checkWinCondition();
    
    setTimeout(() => {
        respawnLocalPlayer();
    }, 2000);
}

function handleRemoteDeath(data) {
    console.log('Remote player died');
    
    gameState.localPlayer.score++;
    updateScoreboard();
    
    const winMessage = getRandomWinMessage(
        gameState.localPlayer.username,
        gameState.remotePlayer.username
    );
    showWinMessage(winMessage, gameState.localPlayer.color);
    
    checkWinCondition();
}

function respawnLocalPlayer() {
    gameState.localPlayer.health = maxPlayerHealth;
    updateHealthBar();
    
    const tank = gameState.localPlayer.tank;
    if (tank) {
        tank.position.set(
            gameState.role === ROLES.HOST ? -50 : 50,
            30,
            0
        );
        tank.quaternion.identity();
    }
    
    isReloaded = true;
    reloadProgress = 1.0;
    updateReloadBar();
    updateActionInstructions();
}

// === WIN CONDITION ===
function checkWinCondition() {
    if (gameState.localPlayer.score >= gameState.winThreshold) {
        triggerFinalCutscene();
    } else if (gameState.remotePlayer.score >= gameState.winThreshold) {
        triggerFinalCutscene();
    }
}

function triggerFinalCutscene() {
    console.log('Triggering final cutscene');
    
    gameState.isControlsLocked = true;
    
    hideElement(gameUIElement);
    
    const finalScores = {
        player1: gameState.player1.score,
        player2: gameState.player2.score
    };
    
    cutsceneManager.playCutscene(
        {
            tank: gameState.player1.tank,
            username: gameState.player1.username,
            color: gameState.player1.color
        },
        {
            tank: gameState.player2.tank,
            username: gameState.player2.username,
            color: gameState.player2.color
        },
        finalScores
    );
}

// === UI UPDATES ===
function updateHealthBar() {
    if (healthBarFill) {
        const healthPercent = (gameState.localPlayer.health / maxPlayerHealth) * 100;
        healthBarFill.style.width = `${healthPercent}%`;
    }
}

function updateReloadBar() {
    if (reloadBarFill) {
        reloadBarFill.style.width = `${reloadProgress * 100}%`;
    }
}

function updateActionInstructions() {
    if (!actionInstructionsElement) return;
    
    if (!isReloaded && !isReloading) {
        actionInstructionsElement.textContent = 'Hold R to reload';
    } else if (isReloading) {
        actionInstructionsElement.textContent = 'Reloading...';
    } else {
        actionInstructionsElement.textContent = 'E to shoot';
    }
}

function updateScoreboard() {
    if (scoreLeftElement) {
        scoreLeftElement.textContent = `${gameState.player1.username}: ${gameState.player1.score}`;
        scoreLeftElement.style.color = COLORS[gameState.player1.color];
    }
    if (scoreRightElement) {
        scoreRightElement.textContent = `${gameState.player2.username}: ${gameState.player2.score}`;
        scoreRightElement.style.color = COLORS[gameState.player2.color];
    }
}

function showWinMessage(message, color) {
    if (!winMessageElement) return;
    
    winMessageElement.textContent = message;
    winMessageElement.style.color = COLORS[color];
    winMessageElement.classList.add('show');
    
    setTimeout(() => {
        winMessageElement.classList.remove('show');
    }, 3000);
}

// === PLAYER SYNC ===
function sendPlayerUpdate() {
    if (!gameState.isMultiplayer || gameState.isTestMode) return;
    if (!gameState.localPlayer.tank) return;
    
    const tank = gameState.localPlayer.tank;
    const headPivot = gameState.role === ROLES.HOST ? player1TankHeadPivot : player2TankHeadPivot;
    const turretPivot = gameState.role === ROLES.HOST ? player1TankTurretPivot : player2TankTurretPivot;
    
    if (headPivot && !isPrecisionAiming) {
        const targetRelativeYaw = cameraYaw - localPlayerYaw;
        headPivot.rotation.y = THREE.MathUtils.lerp(
            headPivot.rotation.y,
            targetRelativeYaw,
            delta * headTurnSpeed
        );
    } else if (headPivot && isPrecisionAiming) {
        const targetRelativeYaw = cameraYaw - localPlayerYaw;
        headPivot.rotation.y = targetRelativeYaw;
    }
    
    if (turretPivot && !isPrecisionAiming) {
        const normalizedMouseY = (mouseY - (window.innerHeight / 2)) / (window.innerHeight / 2);
        const mousePitch = -normalizedMouseY;
        const basePitch = THREE.MathUtils.mapLinear(cameraPitch, 0.1, 1.4, 0, -10 * Math.PI / 180);
        const mousePitchOffset = mousePitch * (30 * Math.PI / 180);
        let targetPitch = basePitch + mousePitchOffset;
        targetPitch = THREE.MathUtils.clamp(targetPitch, -10 * Math.PI / 180, 45 * Math.PI / 180);
        turretPivot.rotation.y = THREE.MathUtils.lerp(
            turretPivot.rotation.y,
            targetPitch,
            delta * turretPitchSpeed
        );
    } else if (turretPivot && isPrecisionAiming) {
        let targetPitch = THREE.MathUtils.mapLinear(
            cameraPitch,
            cameraPitchMin,
            cameraPitchMax,
            45 * Math.PI / 180,
            -10 * Math.PI / 180
        );
        targetPitch = THREE.MathUtils.clamp(targetPitch, -10 * Math.PI / 180, 45 * Math.PI / 180);
        turretPivot.rotation.y = targetPitch;
    }
}

// === CAMERA UPDATE ===
function updateCamera(delta) {
    if (gameState.isControlsLocked) return;
    if (!gameState.localPlayer || !gameState.localPlayer.tank) return;
    
    const tank = gameState.localPlayer.tank;
    const lookAtTarget = tank.position.clone().add(cameraLookAtOffset);
    
    let targetFov = defaultFov;
    
    if (isPrecisionAiming) {
        targetFov = THREE.MathUtils.mapLinear(precisionZoomLevel, 0, 1, precisionFovBase, precisionFovMin);
        
        const turret = gameState.role === ROLES.HOST ? player1TankTurret : player2TankTurret;
        if (turret) {
            const muzzlePos = new THREE.Vector3(20, -18.6, 5.3);
            const precisionCamPos = new THREE.Vector3();
            precisionCamPos.copy(muzzlePos);
            turret.localToWorld(precisionCamPos);
            
            camera.position.lerp(precisionCamPos, delta * 10);
            
            const muzzleDirection = new THREE.Vector3(0, 0, -1);
            const muzzleWorldQuat = new THREE.Quaternion();
            turret.getWorldQuaternion(muzzleWorldQuat);
            const muzzleOffsetQuat = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(0, 91 * Math.PI / 180, 0)
            );
            muzzleWorldQuat.multiply(muzzleOffsetQuat);
            muzzleDirection.applyQuaternion(muzzleWorldQuat).normalize();
            
            const lookTarget = precisionCamPos.clone().add(muzzleDirection);
            
            const precisionCamQuat = camera.quaternion.clone();
            camera.lookAt(lookTarget);
            const precisionCamTargetQuat = camera.quaternion.clone();
            camera.quaternion.copy(precisionCamQuat).slerp(precisionCamTargetQuat, delta * 10);
        }
    } else {
        const cameraOffset = new THREE.Vector3(
            cameraDistance * Math.sin(cameraYaw) * Math.cos(cameraPitch),
            cameraDistance * Math.sin(cameraPitch),
            cameraDistance * Math.cos(cameraYaw) * Math.cos(cameraPitch)
        );
        
        const targetCamPos = lookAtTarget.clone().add(cameraOffset);
        camera.position.lerp(targetCamPos, delta * 10);
        
        const currentQuat = camera.quaternion.clone();
        camera.lookAt(lookAtTarget);
        const targetQuat = camera.quaternion.clone();
        camera.quaternion.copy(currentQuat).slerp(targetQuat, delta * 10);
    }
    
    if (Math.abs(camera.fov - targetFov) > 0.01) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, delta * 5);
        camera.updateProjectionMatrix();
    }
}1TankHeadPivot : player2TankHeadPivot;
    const turretPivot = gameState.role === ROLES.HOST ? player1TankTurretPivot : player2TankTurretPivot;
    
    webrtcManager.send(MSG_TYPES.PLAYER_UPDATE, {
        position: tank.position.toArray(),
        rotation: tank.quaternion.toArray(),
        headRotation: headPivot ? headPivot.rotation.y : 0,
        turretRotation: turretPivot ? turretPivot.rotation.y : 0,
        velocity: localPlayerVelocity.toArray()
    });
}

function updateRemotePlayer(data) {
    if (!gameState.remotePlayer.tank) return;
    
    remotePlayerState.position.fromArray(data.position);
    remotePlayerState.rotation.fromArray(data.rotation);
    remotePlayerState.headRotation = data.headRotation;
    remotePlayerState.turretRotation = data.turretRotation;
    remotePlayerState.velocity.fromArray(data.velocity);
    remotePlayerState.lastUpdate = Date.now();
}

function interpolateRemotePlayer(delta) {
    if (!gameState.remotePlayer.tank) return;
    
    const tank = gameState.remotePlayer.tank;
    const headPivot = gameState.role === ROLES.HOST ? player2TankHeadPivot : player1TankHeadPivot;
    const turretPivot = gameState.role === ROLES.HOST ? player2TankTurretPivot : player1TankTurretPivot;
    
    tank.position.lerp(remotePlayerState.position, delta * 10);
    tank.quaternion.slerp(remotePlayerState.rotation, delta * 10);
    
    if (headPivot) {
        headPivot.rotation.y = THREE.MathUtils.lerp(
            headPivot.rotation.y,
            remotePlayerState.headRotation,
            delta * headTurnSpeed
        );
    }
    if (turretPivot) {
        turretPivot.rotation.y = THREE.MathUtils.lerp(
            turretPivot.rotation.y,
            remotePlayerState.turretRotation,
            delta * turretPitchSpeed
        );
    }
}

// === TEST MODE DUMMY AI ===
function updateDummyAI(delta) {
    if (!gameState.isTestMode) return;
    if (!gameState.remotePlayer.tank) return;
    
    const tank = gameState.remotePlayer.tank;
    
    if (ground) {
        const rayOrigin = tank.position.clone();
        rayOrigin.y += 10;
        raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
        const groundIntersects = raycaster.intersectObject(ground);
        
        if (groundIntersects.length > 0) {
            tank.position.y = groundIntersects[0].point.y + 1.0;
        }
    }
    
    tank.rotation.y += delta * 0.5;
    
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(tank.quaternion);
    tank.position.add(forward.multiplyScalar(delta * 10));
    
    if (tank.position.length() > 200) {
        tank.position.multiplyScalar(0.95);
    }
    
    if (Math.random() < 0.01) {
        const turret = player2TankTurret;
        if (turret) {
            const muzzlePos = new THREE.Vector3(20, -18.6, 5.3);
            const muzzleWorldPos = new THREE.Vector3();
            muzzleWorldPos.copy(muzzlePos);
            turret.localToWorld(muzzleWorldPos);
            
            const muzzleDirection = new THREE.Vector3(0, 0, -1);
            const muzzleWorldQuat = new THREE.Quaternion();
            turret.getWorldQuaternion(muzzleWorldQuat);
            muzzleDirection.applyQuaternion(muzzleWorldQuat).normalize();
            
            spawnBullet(muzzleWorldPos, muzzleDirection, false);
        }
    }
}

// === ANIMATE LOOP ===
let lastPlayerUpdateTime = 0;
const playerUpdateInterval = 1 / 20;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    updateBullets(delta);
    updateExplosions(delta);
    updateParticles(delta);
    
    if (isReloading) {
        reloadProgress += delta / reloadTime;
        if (reloadProgress >= 1.0) {
            reloadProgress = 1.0;
            isReloaded = true;
            isReloading = false;
            updateActionInstructions();
        }
        updateReloadBar();
    }
    
    if (gameState.localPlayer && gameState.localPlayer.tank && !gameState.isControlsLocked && gameState.gameStarted) {
        updateLocalPlayer(delta);
    }
    
    if (gameState.remotePlayer && gameState.remotePlayer.tank && gameState.gameStarted) {
        if (gameState.isTestMode) {
            updateDummyAI(delta);
        } else {
            interpolateRemotePlayer(delta);
        }
    }
    
    if (gameState.isMultiplayer && !gameState.isTestMode && gameState.gameStarted) {
        lastPlayerUpdateTime += delta;
        if (lastPlayerUpdateTime >= playerUpdateInterval) {
            sendPlayerUpdate();
            lastPlayerUpdateTime = 0;
        }
    }
    
    if (gameState.gameStarted) {
        updateCamera(delta);
    }
    
    if (cutsceneManager.isPlaying) {
        cutsceneManager.update(delta);
    }
    
    renderer.render(scene, camera);
}

// === LOCAL PLAYER UPDATE ===
function updateLocalPlayer(delta) {
    const tank = gameState.localPlayer.tank;
    if (!tank || !ground) return;
    
    const upVector = new THREE.Vector3(0, 1, 0);
    
    if (moveLeft) localPlayerAngularVelocity += playerTurnAcceleration * delta;
    if (moveRight) localPlayerAngularVelocity -= playerTurnAcceleration * delta;
    if (moveForward) localPlayerVelocity.z += playerAcceleration * delta;
    if (moveBackward) localPlayerVelocity.z -= playerAcceleration * delta;
    
    localPlayerAngularVelocity = THREE.MathUtils.damp(localPlayerAngularVelocity, 0, playerTurnDamping, delta);
    localPlayerVelocity.z = THREE.MathUtils.damp(localPlayerVelocity.z, 0, playerDamping, delta);
    
    localPlayerYaw += localPlayerAngularVelocity * delta;
    
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(upVector, localPlayerYaw);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuat);
    
    if (collidables.length > 0) {
        const collisionDistance = 8;
        if (localPlayerVelocity.z > 0) {
            collisionRaycaster.set(tank.position, forward);
            const intersects = collisionRaycaster.intersectObjects(collidables, true);
            if (intersects.length > 0 && intersects[0].distance < collisionDistance) {
                localPlayerVelocity.z = 0;
            }
        }
        if (localPlayerVelocity.z < 0) {
            const backward = forward.clone().negate();
            collisionRaycaster.set(tank.position, backward);
            const intersects = collisionRaycaster.intersectObjects(collidables, true);
            if (intersects.length > 0 && intersects[0].distance < collisionDistance) {
                localPlayerVelocity.z = 0;
            }
        }
    }
    
    tank.position.add(forward.clone().multiplyScalar(localPlayerVelocity.z * delta));
    
    const rayOrigin = tank.position.clone();
    rayOrigin.y += 10;
    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    const groundIntersects = raycaster.intersectObject(ground);
    
    if (groundIntersects.length > 0) {
        tank.position.y = groundIntersects[0].point.y + 1.0;
        const groundNormal = groundIntersects[0].face.normal.clone();
        groundNormal.applyQuaternion(ground.quaternion).normalize();
        const tiltQuat = new THREE.Quaternion().setFromUnitVectors(upVector, groundNormal);
        const finalQuat = yawQuat.clone().multiply(tiltQuat);
        tank.quaternion.copy(finalQuat);
    } else {
        tank.position.y -= 1 * delta;
    }
    
    const headPivot = gameState.role === ROLES.HOST ? player
