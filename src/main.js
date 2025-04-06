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
let paintCanvas, paintContext;
let paintTexture, paintMaterial, paintPlane;
let raycaster, mouse;

// Drawing variables
let isDrawMode = false;
let isDrawing = false;
let drawColor = '#ff0000'; // Default red
let drawSize = 10; // Brush size
let drawOpacity = 0.7; // Spray paint opacity
let sprayParticles = []; // Store spray particle positions for current stroke
let lastDrawX = 0;
let lastDrawY = 0;

// Init function
function init() {
  const app = document.querySelector('#app');
  
  // Create UI
  app.innerHTML = `
    <div class="car-viewer">
      <h1>Car Viewer</h1>
      <div id="canvas-container" class="viewer-container">
        <!-- Three.js renderer will be added here -->
      </div>
      <div class="navigation-controls">
        <button id="prev-btn" class="nav-btn">←</button>
        <button id="next-btn" class="nav-btn">→</button>
      </div>
      <div class="controls">
        <button id="download-btn">Download Image</button>
        <button id="reset-view-btn">Reset View</button>
        <button id="draw-mode-btn">Spray Paint</button>
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
          <input type="range" id="brush-size" min="2" max="30" value="10">
          <span id="size-value">10px</span>
        </div>
        <div class="opacity-control">
          <span>Opacity: </span>
          <input type="range" id="brush-opacity" min="10" max="100" value="70">
          <span id="opacity-value">70%</span>
        </div>
        <button id="clear-canvas-btn">Clear Paint</button>
        <button id="exit-draw-mode-btn">Exit Paint Mode</button>
      </div>
    </div>
  `;

  // Set up Three.js scene
  setupThreeJS();
  
  // Load initial car image
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
  
  // Create raycaster for mouse interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Create an offscreen canvas for the paint layer
  paintCanvas = document.createElement('canvas');
  paintCanvas.width = 1024;
  paintCanvas.height = 1024;
  paintContext = paintCanvas.getContext('2d');
  paintContext.fillStyle = 'rgba(0, 0, 0, 0)';
  paintContext.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
  
  // Load curb background
  loadCurbBackground();
  
  // Listen for window resize
  window.addEventListener('resize', onWindowResize);
}

function loadCurbBackground() {
  // Create a loader
  const textureLoader = new THREE.TextureLoader();
  
  // Load the curb texture with CORS enabled
  textureLoader.crossOrigin = 'anonymous';
  textureLoader.load(
    'https://images.kasra.codes/curb.png',
    // onLoad callback
    function(texture) {
      curbTexture = texture;
      
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
      if (paintPlane) {
        paintPlane.position.z = 0.02; // Ensure paint layer is in front of car
      }
    },
    // onProgress callback (not needed)
    undefined,
    // onError callback
    function(err) {
      console.error('Error loading curb texture:', err);
    }
  );
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
  // Create a loader
  const textureLoader = new THREE.TextureLoader();
  
  // Clear existing planes if any
  if (carPlane) {
    scene.remove(carPlane);
  }
  if (paintPlane) {
    scene.remove(paintPlane);
  }
  
  // Reset paint layer
  clearPaintLayer();
  
  // Load the texture with CORS enabled
  textureLoader.crossOrigin = 'anonymous';
  textureLoader.load(
    url,
    // onLoad callback
    function(texture) {
      carTexture = texture;
      
      // Create material and plane for car image
      carMaterial = new THREE.MeshBasicMaterial({ 
        map: carTexture,
        transparent: true
      });
      
      // Create geometry based on texture aspect ratio
      const aspect = carTexture.image.width / carTexture.image.height;
      const width = aspect >= 1 ? 1.5 : 1.5 * aspect;
      const height = aspect >= 1 ? 1.5 / aspect : 1.5;
      
      const geometry = new THREE.PlaneGeometry(width, height);
      
      carPlane = new THREE.Mesh(geometry, carMaterial);
      // Position car slightly above the curb if curb exists
      carPlane.position.z = 0.01;
      scene.add(carPlane);
      
      // Create paint layer with same geometry
      paintTexture = new THREE.CanvasTexture(paintCanvas);
      paintTexture.needsUpdate = true;
      
      paintMaterial = new THREE.MeshBasicMaterial({
        map: paintTexture,
        transparent: true,
        depthTest: false
      });
      
      paintPlane = new THREE.Mesh(geometry, paintMaterial);
      paintPlane.position.z = 0.02; // Slightly in front of the car
      scene.add(paintPlane);
      
      // Check if curb exists, if not reload it
      if (!curbPlane || !scene.getObjectById(curbPlane.id)) {
        loadCurbBackground();
      } else {
        // Make sure curb stays behind car
        curbPlane.position.z = -0.01;
      }
      
      // Reset camera position
      resetCamera();
    },
    // onProgress callback (not needed)
    undefined,
    // onError callback
    function(err) {
      console.error('Error loading texture:', err);
    }
  );
}

function clearPaintLayer() {
  // Clear the paint canvas
  paintContext.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  
  // Update the texture if it exists
  if (paintTexture) {
    paintTexture.needsUpdate = true;
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
  
  // Render scene
  renderer.render(scene, camera);
}

function applySprayPaint(x, y) {
  const brushRadius = drawSize / 2;
  const particles = Math.floor(drawSize * drawSize * 0.4); // Number of particles based on brush size
  
  // Convert clientX/Y to canvas coordinates
  const canvasRect = renderer.domElement.getBoundingClientRect();
  const canvasX = ((x - canvasRect.left) / canvasRect.width) * paintCanvas.width;
  const canvasY = ((y - canvasRect.top) / canvasRect.height) * paintCanvas.height;
  
  // Get a color with opacity
  const color = drawColor;
  const hexToRgb = hex => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  };
  
  const rgb = hexToRgb(color);
  
  // Draw multiple particles with Gaussian distribution
  paintContext.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${drawOpacity * 0.05})`;
  
  for (let i = 0; i < particles; i++) {
    // Use gaussian distribution (Box-Muller transform)
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    
    let radius = brushRadius * Math.sqrt(-2.0 * Math.log(u));
    let theta = 2.0 * Math.PI * v;
    
    let xOffset = radius * Math.cos(theta);
    let yOffset = radius * Math.sin(theta);
    
    // Store the spray particle
    sprayParticles.push({
      x: canvasX + xOffset,
      y: canvasY + yOffset,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.2 * drawOpacity
    });
  }
  
  // Draw all particles
  sprayParticles.forEach(particle => {
    paintContext.beginPath();
    paintContext.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    paintContext.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${particle.opacity})`;
    paintContext.fill();
  });
  
  // Simulate spray paint droplets and drips for larger brush sizes
  if (drawSize > 15 && Math.random() < 0.3) {
    createDrip(canvasX, canvasY, rgb);
  }
  
  // Update the texture
  paintTexture.needsUpdate = true;
  
  // Store last position for line smoothing
  lastDrawX = canvasX;
  lastDrawY = canvasY;
}

function createDrip(x, y, rgb) {
  const dripLength = Math.random() * 50 + 20;
  const dripWidth = Math.random() * 4 + 2;
  
  // Create a drip effect
  const gradient = paintContext.createLinearGradient(x, y, x, y + dripLength);
  gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${drawOpacity * 0.7})`);
  gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
  
  paintContext.fillStyle = gradient;
  paintContext.beginPath();
  paintContext.ellipse(x, y, dripWidth, dripLength, 0, 0, Math.PI * 2);
  paintContext.fill();
}

function interpolateSpray(x1, y1, x2, y2) {
  // Calculate distance between points
  const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  
  // If distance is small, no need to interpolate
  if (dist < 5) return;
  
  // Calculate how many points to interpolate
  const steps = Math.floor(dist / 5);
  
  // Interpolate points between start and end
  for (let i = 1; i < steps; i++) {
    const ratio = i / steps;
    const x = x1 + (x2 - x1) * ratio;
    const y = y1 + (y2 - y1) * ratio;
    
    applySprayPaint(x, y);
  }
}

function startDrawing(x, y) {
  if (!isDrawMode) return;
  
  isDrawing = true;
  sprayParticles = []; // Reset particles for new stroke
  
  // Apply first spray at this position
  applySprayPaint(x, y);
}

function continueDraw(x, y) {
  if (!isDrawMode || !isDrawing) return;
  
  // Interpolate between last position and current for smooth lines
  const canvasRect = renderer.domElement.getBoundingClientRect();
  const canvasX = x - canvasRect.left;
  const canvasY = y - canvasRect.top;
  
  interpolateSpray(lastDrawX, lastDrawY, canvasX, canvasY);
  applySprayPaint(x, y);
}

function stopDrawing() {
  isDrawing = false;
  sprayParticles = []; // Clear particles after stroke
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
  document.getElementById('reset-view-btn').addEventListener('click', resetCamera);
  
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