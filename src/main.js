import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Car view positions with their corresponding image URLs
const viewPositions = [
  { name: 'right', url: 'https://images.kasra.codes/right.png' },
  { name: 'back', url: 'https://images.kasra.codes/back.png' },
  { name: 'between-back-and-right', url: 'https://images.kasra.codes/between-back-and-right.png' },
  { name: 'left', url: 'https://images.kasra.codes/left.png' },
  { name: 'front', url: 'https://images.kasra.codes/front.png' },
  { name: 'between-front-and-right', url: 'https://images.kasra.codes/between-front-and-right.png' }
];

// Current position index
let currentPositionIndex = 0;

// Three.js variables
let scene, camera, renderer, controls;
let carTexture, carMaterial, carPlane;
let curbTexture, curbMaterial, curbPlane;
let raycaster, mouse;
// Preloaded textures
let preloadedTextures = {};

// UV-based painting variables
let isDrawMode = false;
let isDrawing = false;
let drawColor = '#ff0000'; // Default red
let drawSize = 6; // Brush size (smaller default)
let drawOpacity = 1.0; // Spray paint opacity (full opacity)
let paintRenderTarget, paintTexture;
let brushCanvas, brushContext;
let paintScene, paintCamera;
let lastIntersection = null;

// Function to preload all textures
function preloadTextures(callback) {
  const textureLoader = new THREE.TextureLoader();
  textureLoader.crossOrigin = 'anonymous';
  
  let loadedCount = 0;
  const totalTextures = viewPositions.length + 1; // +1 for curb background
  
  // Add loading indicator to UI
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="car-viewer">
      <h1>Tesla Defiler</h1>
      <div id="loading-indicator" style="text-align: center; padding: 20px;">
        <div>Loading textures... <span id="loading-progress">0/${totalTextures}</span></div>
        <div style="margin-top: 10px; height: 10px; width: 100%; background: #ccc;">
          <div id="progress-bar" style="height: 100%; width: 0%; background: #2196F3; transition: width 0.3s;"></div>
        </div>
      </div>
    </div>
  `;

  // Preload curb texture
  textureLoader.load(
    'https://images.kasra.codes/curb.png',
    function(texture) {
      preloadedTextures['curb'] = texture;
      loadedCount++;
      updateLoadingProgress(loadedCount, totalTextures);
      checkAllLoaded();
    },
    undefined,
    function(err) {
      console.error('Error loading curb texture:', err);
      loadedCount++;
      updateLoadingProgress(loadedCount, totalTextures);
      checkAllLoaded();
    }
  );
  
  // Preload all car textures
  viewPositions.forEach(position => {
    textureLoader.load(
      position.url,
      function(texture) {
        preloadedTextures[position.name] = texture;
        loadedCount++;
        updateLoadingProgress(loadedCount, totalTextures);
        checkAllLoaded();
      },
      undefined,
      function(err) {
        console.error(`Error loading texture for ${position.name}:`, err);
        loadedCount++;
        updateLoadingProgress(loadedCount, totalTextures);
        checkAllLoaded();
      }
    );
  });
  
  function updateLoadingProgress(current, total) {
    const progressElement = document.getElementById('loading-progress');
    const progressBar = document.getElementById('progress-bar');
    if (progressElement && progressBar) {
      progressElement.textContent = `${current}/${total}`;
      progressBar.style.width = `${(current / total) * 100}%`;
    }
  }
  
  function checkAllLoaded() {
    if (loadedCount === totalTextures) {
      callback();
    }
  }
}

// Init function
function init() {
  // Preload all textures first
  preloadTextures(initializeScene);
}

function initializeScene() {
  const app = document.querySelector('#app');
  
  // Create UI
  app.innerHTML = `
    <div class="car-viewer">
      <h1>Tesla Defiler</h1>
      <div id="canvas-container" class="viewer-container">
        <!-- Three.js renderer will be added here -->
      </div>
      <div class="navigation-controls">
        <button id="prev-btn" class="nav-btn">←</button>
        <button id="next-btn" class="nav-btn">→</button>
      </div>
      <div class="controls">
        <button id="download-btn" title="Download Image">💾</button>
        <button id="draw-mode-btn" title="Spray Paint">🎨</button>
      </div>
      <div id="draw-controls" class="draw-controls" style="display: none;">
        <div class="color-picker">
          <span>Color: </span>
          <button class="color-btn" data-color="#ff0000" style="background-color: #ff0000;"></button>
          <button class="color-btn" data-color="#00ff00" style="background-color: #00ff00;"></button>
          <button class="color-btn" data-color="#0000ff" style="background-color: #0000ff;"></button>
          <button class="color-btn" data-color="#ffff00" style="background-color: #ffff00;"></button>
          <button class="color-btn" data-color="#ff00ff" style="background-color: #ff00ff;"></button>
          <button class="color-btn" data-color="#ffffff" style="background-color: #ffffff;"></button>
          <button class="color-btn" data-color="#000000" style="background-color: #000000;"></button>
        </div>
        <div class="size-control">
          <span>Size: </span>
          <input type="range" id="brush-size" min="2" max="30" value="6">
          <span id="size-value">6px</span>
        </div>
        <div class="opacity-control">
          <span>Opacity: </span>
          <input type="range" id="brush-opacity" min="10" max="100" value="100">
          <span id="opacity-value">100%</span>
        </div>
        <button id="clear-canvas-btn">Clear Paint</button>
        <button id="exit-draw-mode-btn">Exit Paint Mode</button>
      </div>
    </div>
  `;

  // Set up Three.js scene
  setupThreeJS();
  
  // Load initial car image using preloaded texture
  loadCarImage(viewPositions[currentPositionIndex].url);
  
  // Set up event listeners
  setupEventListeners();
  
  // Start animation loop
  animate();
}

function setupThreeJS() {
  const container = document.getElementById('canvas-container');
  
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x555555); // Lighter background to match with curb
  
  // Create camera
  const aspectRatio = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
  camera.position.z = 1;
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(container.clientWidth, container.clientWidth); // Make it square
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  
  // Create orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.5;
  controls.maxDistance = 2;
  controls.maxPolarAngle = Math.PI / 2;
  controls.enableRotate = false; // Disable rotation initially
  
  // Initialize raycaster for mouse interaction and UV painting
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Create brush canvas for generating procedural brush patterns
  brushCanvas = document.createElement('canvas');
  brushCanvas.width = 256;
  brushCanvas.height = 256;
  brushContext = brushCanvas.getContext('2d');
  
  // Create an offscreen canvas for painting instead of WebGLRenderTarget
  // This is simpler and more reliable for our use case
  const paintResolution = 2048;
  const paintCanvas = document.createElement('canvas');
  paintCanvas.width = paintResolution;
  paintCanvas.height = paintResolution;
  const paintContext = paintCanvas.getContext('2d');
  
  // Clear canvas with transparent background
  paintContext.clearRect(0, 0, paintResolution, paintResolution);
  
  // Create texture from canvas
  paintTexture = new THREE.CanvasTexture(paintCanvas);
  paintTexture.needsUpdate = true;
  
  // Store references for later use
  window.paintCanvas = paintCanvas;
  window.paintContext = paintContext;
  
  // Load curb background
  loadCurbBackground();
  
  // Listen for window resize
  window.addEventListener('resize', onWindowResize);
}

function loadCurbBackground() {
  // Use preloaded curb texture
  if (preloadedTextures['curb']) {
    curbTexture = preloadedTextures['curb'];
    
    // Create material and plane for curb image
    curbMaterial = new THREE.MeshBasicMaterial({ 
      map: curbTexture
    });
    
    // Calculate the size of the background
    // We want it to cover most of the scene but with some margin
    const curbWidth = 2.5;
    const curbHeight = 2.5;
    
    // Create geometry for background
    const geometry = new THREE.PlaneGeometry(curbWidth, curbHeight);
    
    curbPlane = new THREE.Mesh(geometry, curbMaterial);
    curbPlane.position.z = -0.01; // Position behind the car
    
    // Adjust vertical position to place the car on the curb properly
    curbPlane.position.y = -0.15; // Slightly lower to position car on curb
    
    scene.add(curbPlane);
    
    // If car is already loaded, make sure it's positioned correctly
    if (carPlane) {
      carPlane.position.z = 0.01; // Ensure car is in front of curb
    }
  } else {
    console.error('Curb texture not preloaded');
    
    // Fallback to loading directly if preloaded texture not available
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    textureLoader.load(
      'https://images.kasra.codes/curb.png',
      function(texture) {
        curbTexture = texture;
        
        // Create material and plane for curb image
        curbMaterial = new THREE.MeshBasicMaterial({ 
          map: curbTexture
        });
        
        // Calculate the size of the background
        const curbWidth = 2.5;
        const curbHeight = 2.5;
        
        // Create geometry for background
        const geometry = new THREE.PlaneGeometry(curbWidth, curbHeight);
        
        curbPlane = new THREE.Mesh(geometry, curbMaterial);
        curbPlane.position.z = -0.01; // Position behind the car
        curbPlane.position.y = -0.15; // Slightly lower to position car on curb
        
        scene.add(curbPlane);
        
        if (carPlane) {
          carPlane.position.z = 0.01;
        }
      },
      undefined,
      function(err) {
        console.error('Error loading curb texture:', err);
      }
    );
  }
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = width; // Keep it square
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
}

function loadCarImage(url) {
  // Clear existing car plane if any
  if (carPlane) {
    scene.remove(carPlane);
  }
  
  // Reset paint layer
  clearPaintLayer();
  
  // Find the view position object based on URL
  const currentPosition = viewPositions.find(pos => pos.url === url);
  const positionName = currentPosition ? currentPosition.name : null;
  
  // Use preloaded texture if available
  if (positionName && preloadedTextures[positionName]) {
    carTexture = preloadedTextures[positionName];
    createCarPlane(carTexture);
  } else {
    // Fallback to loading directly if preloaded texture not available
    console.warn(`Preloaded texture not found for ${url}, loading directly`);
    
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    textureLoader.load(
      url,
      function(texture) {
        carTexture = texture;
        createCarPlane(carTexture);
      },
      undefined,
      function(err) {
        console.error('Error loading texture:', err);
      }
    );
  }
}

function createCarPlane(texture) {
  // Clear the paint render target to reset the paint
  clearPaintLayer();
  
  // Create geometry based on texture aspect ratio
  const aspect = texture.image.width / texture.image.height;
  const width = aspect >= 1 ? 1.5 : 1.5 * aspect;
  const height = aspect >= 1 ? 1.5 / aspect : 1.5;
  
  const geometry = new THREE.PlaneGeometry(width, height, 20, 20); // More segments for better UV mapping
  
  // Create a shader material that combines the car texture and paint overlay
  const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `;
  
  const fragmentShader = `
  uniform sampler2D carTexture;
  uniform sampler2D paintTexture;
  varying vec2 vUv;
  
  void main() {
    vec4 carColor = texture2D(carTexture, vUv);
    vec4 paintColor = texture2D(paintTexture, vUv);
    
    // Blend paint on top of car using paint alpha
    vec3 finalColor = mix(carColor.rgb, paintColor.rgb, paintColor.a);
    
    gl_FragColor = vec4(finalColor, carColor.a);
  }
  `;
  
  // Create material with custom shader
  carMaterial = new THREE.ShaderMaterial({
    uniforms: {
      carTexture: { value: texture },
      paintTexture: { value: paintTexture }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true
  });
  
  // Create the car plane
  carPlane = new THREE.Mesh(geometry, carMaterial);
  carPlane.position.z = 0.01; // Position slightly above the curb
  scene.add(carPlane);
  
  // Check if curb exists, if not reload it
  if (!curbPlane || !scene.getObjectById(curbPlane.id)) {
    loadCurbBackground();
  } else {
    // Make sure curb stays behind car
    curbPlane.position.z = -0.01;
  }
  
  // Reset camera position
  resetCamera();
}

function clearPaintLayer() {
  // Clear the paint canvas
  if (window.paintContext && window.paintCanvas) {
    window.paintContext.clearRect(0, 0, window.paintCanvas.width, window.paintCanvas.height);
    
    // Update the texture
    if (paintTexture) {
      paintTexture.needsUpdate = true;
    }
  }
}

function resetCamera() {
  // Reset camera position
  camera.position.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  
  // Reset controls
  controls.reset();
}

function animate() {
  requestAnimationFrame(animate);
  
  // Update controls
  controls.update();
  
  // Update paint texture when in draw mode
  if (isDrawMode && paintTexture) {
    paintTexture.needsUpdate = true;
  }
  
  // Render scene
  renderer.render(scene, camera);
}

// No longer needed - paint is applied directly to the canvas
// We'll keep the drip function inside applySprayPaint

// Apply the spray paint at the given UV coordinates
function applySprayPaint(x, y) {
  if (!carPlane || !window.paintContext) return;
  
  // Get the paint canvas context
  const paintCtx = window.paintContext;
  const canvasWidth = window.paintCanvas.width;
  const canvasHeight = window.paintCanvas.height;
  
  // Calculate canvas coordinates from UV coordinates
  const canvasX = x * canvasWidth;
  const canvasY = (1 - y) * canvasHeight; // Flip Y for canvas coordinates
  
  // Get a color with opacity
  const hexToRgb = hex => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };
  
  const rgb = hexToRgb(drawColor);
  
  // Calculate brush parameters
  const brushRadius = drawSize * 2; // Scale up brush size for higher resolution canvas
  const particles = Math.floor(drawSize * drawSize * 0.8); // More particles for denser spray
  
  // Draw multiple particles with Gaussian distribution
  for (let i = 0; i < particles; i++) {
    // Use gaussian distribution (Box-Muller transform)
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    
    let radius = brushRadius * Math.sqrt(-2.0 * Math.log(u));
    let theta = 2.0 * Math.PI * v;
    
    let xOffset = radius * Math.cos(theta);
    let yOffset = radius * Math.sin(theta);
    
    // Calculate particle parameters
    const particleX = canvasX + xOffset;
    const particleY = canvasY + yOffset;
    const particleSize = Math.random() * 3 + 1;
    const particleOpacity = Math.random() * 0.3 * drawOpacity;
    
    // Draw particle
    paintCtx.beginPath();
    paintCtx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
    paintCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${particleOpacity})`;
    paintCtx.fill();
  }
  
  // Simulate spray paint droplets and drips for larger brush sizes
  if (drawSize > 15 && Math.random() < 0.3) {
    const dripLength = Math.random() * 50 + 20;
    const dripWidth = Math.random() * 4 + 2;
    
    // Create a drip effect
    const gradient = paintCtx.createLinearGradient(canvasX, canvasY, canvasX, canvasY + dripLength);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${drawOpacity * 0.7})`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    
    paintCtx.fillStyle = gradient;
    paintCtx.beginPath();
    paintCtx.ellipse(canvasX, canvasY, dripWidth, dripLength, 0, 0, Math.PI * 2);
    paintCtx.fill();
  }
  
  // Update the texture
  paintTexture.needsUpdate = true;
  
  // Store last intersection for interpolation
  lastIntersection = { x, y };
}

// Interpolate between two points in UV space
function interpolateSpray(from, to) {
  if (!from || !to) return;
  
  // Calculate distance between points
  const dist = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
  
  // If distance is small, no need to interpolate
  if (dist < 0.01) return;
  
  // Calculate how many points to interpolate based on distance
  const steps = Math.ceil(dist * 100);
  
  // Interpolate points between start and end
  for (let i = 1; i < steps; i++) {
    const ratio = i / steps;
    const x = from.x + (to.x - from.x) * ratio;
    const y = from.y + (to.y - from.y) * ratio;
    
    applySprayPaint(x, y);
  }
}

// Start drawing at the given screen coordinates
function startDrawing(x, y) {
  if (!isDrawMode || !carPlane) return;
  
  isDrawing = true;
  
  // Raycast to get UV coordinates
  const canvasRect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((x - canvasRect.left) / canvasRect.width) * 2 - 1;
  mouse.y = -((y - canvasRect.top) / canvasRect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(carPlane);
  
  if (intersects.length > 0) {
    const uv = intersects[0].uv;
    lastIntersection = { x: uv.x, y: uv.y };
    applySprayPaint(uv.x, uv.y);
  }
}

// Continue drawing at the given screen coordinates
function continueDraw(x, y) {
  if (!isDrawMode || !isDrawing || !carPlane) return;
  
  // Raycast to get UV coordinates
  const canvasRect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((x - canvasRect.left) / canvasRect.width) * 2 - 1;
  mouse.y = -((y - canvasRect.top) / canvasRect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(carPlane);
  
  if (intersects.length > 0) {
    const uv = intersects[0].uv;
    const newIntersection = { x: uv.x, y: uv.y };
    
    // Interpolate between last position and current position
    if (lastIntersection) {
      interpolateSpray(lastIntersection, newIntersection);
    }
    
    // Apply at the current position
    applySprayPaint(uv.x, uv.y);
    
    // Update last intersection
    lastIntersection = newIntersection;
  }
}

function stopDrawing() {
  isDrawing = false;
  lastIntersection = null;
}

function enableDrawMode() {
  isDrawMode = true;
  
  // Show drawing controls
  document.getElementById('draw-controls').style.display = 'block';
  
  // Disable orbit controls temporarily
  controls.enabled = false;
  
  // Change cursor
  renderer.domElement.style.cursor = 'crosshair';
}

function disableDrawMode() {
  isDrawMode = false;
  isDrawing = false;
  
  // Hide drawing controls
  document.getElementById('draw-controls').style.display = 'none';
  
  // Re-enable orbit controls
  controls.enabled = true;
  
  // Reset cursor
  renderer.domElement.style.cursor = 'grab';
}

function setupEventListeners() {
  // Navigation and basic controls
  document.getElementById('prev-btn').addEventListener('click', showPreviousPosition);
  document.getElementById('next-btn').addEventListener('click', showNextPosition);
  document.getElementById('download-btn').addEventListener('click', downloadImage);
  
  // Drawing mode controls
  document.getElementById('draw-mode-btn').addEventListener('click', enableDrawMode);
  document.getElementById('exit-draw-mode-btn').addEventListener('click', disableDrawMode);
  document.getElementById('clear-canvas-btn').addEventListener('click', clearPaintLayer);
  
  // Brush size control
  const brushSizeInput = document.getElementById('brush-size');
  brushSizeInput.addEventListener('input', function() {
    drawSize = parseInt(this.value);
    document.getElementById('size-value').textContent = drawSize + 'px';
  });
  
  // Brush opacity control
  const opacityInput = document.getElementById('brush-opacity');
  opacityInput.addEventListener('input', function() {
    drawOpacity = parseInt(this.value) / 100;
    document.getElementById('opacity-value').textContent = parseInt(this.value) + '%';
  });
  
  // Color picker buttons
  const colorButtons = document.querySelectorAll('.color-btn');
  colorButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Remove active class from all color buttons
      colorButtons.forEach(btn => btn.classList.remove('active-color'));
      // Add active class to clicked button
      this.classList.add('active-color');
      // Set the draw color
      drawColor = this.getAttribute('data-color');
    });
  });
  
  // Set initial active color
  document.querySelector('[data-color="#ff0000"]').classList.add('active-color');
  
  // Mouse/touch events for drawing
  const canvas = renderer.domElement;
  
  // Mouse events
  canvas.addEventListener('mousedown', function(event) {
    if (isDrawMode) {
      startDrawing(event.clientX, event.clientY);
    }
  });
  
  canvas.addEventListener('mousemove', function(event) {
    if (isDrawMode && isDrawing) {
      continueDraw(event.clientX, event.clientY);
    }
  });
  
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);
  
  // Touch events
  canvas.addEventListener('touchstart', function(event) {
    if (isDrawMode) {
      event.preventDefault();
      const touch = event.touches[0];
      startDrawing(touch.clientX, touch.clientY);
    }
  });
  
  canvas.addEventListener('touchmove', function(event) {
    if (isDrawMode && isDrawing) {
      event.preventDefault();
      const touch = event.touches[0];
      continueDraw(touch.clientX, touch.clientY);
    }
  });
  
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchcancel', stopDrawing);
}

function showNextPosition() {
  currentPositionIndex = (currentPositionIndex + 1) % viewPositions.length;
  loadCarImage(viewPositions[currentPositionIndex].url);
}

function showPreviousPosition() {
  currentPositionIndex = (currentPositionIndex - 1 + viewPositions.length) % viewPositions.length;
  loadCarImage(viewPositions[currentPositionIndex].url);
}

function downloadImage() {
  try {
    // Render the scene to the canvas
    renderer.render(scene, camera);
    
    // Create a link to download the image
    const link = document.createElement('a');
    link.download = `car-${viewPositions[currentPositionIndex].name}.png`;
    link.href = renderer.domElement.toDataURL('image/png');
    link.click();
  } catch (error) {
    console.error('Error downloading image:', error);
    
    // Create an error message element
    const errorMsg = document.createElement('div');
    errorMsg.textContent = "Error downloading image. Check CORS settings on image server.";
    errorMsg.style.color = 'red';
    errorMsg.style.padding = '10px';
    errorMsg.style.marginTop = '10px';
    
    // Add to controls
    const controls = document.querySelector('.controls');
    
    // Remove any existing error messages
    const existingError = document.getElementById('download-error');
    if (existingError) {
      existingError.remove();
    }
    
    errorMsg.id = 'download-error';
    controls.appendChild(errorMsg);
    
    // Remove the message after 5 seconds
    setTimeout(() => {
      if (errorMsg.parentNode) {
        errorMsg.remove();
      }
    }, 5000);
  }
}

// Initialize the application
init();