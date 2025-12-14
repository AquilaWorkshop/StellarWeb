import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision_bundle.js';

const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1.2);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#030611');
scene.fog = new THREE.FogExp2('#030611', 0.003);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2500);
camera.position.set(0, 22, 130);

const ui = {
  gesture: document.getElementById('gesture-status'),
  brightness: document.getElementById('brightness-status'),
  fullscreen: document.getElementById('fullscreen'),
  video: document.getElementById('video'),
};

const clock = new THREE.Clock();
const root = new THREE.Group();
scene.add(root);

const starfield = new THREE.Group();
scene.add(starfield);

const saturn = new THREE.Group();
root.add(saturn);

const params = {
  minSpread: 0.62,
  maxSpread: 2.6,
  chaoticThreshold: 1.8,
  baseBrightness: 0.28,
  maxBrightness: 1.4,
  keplerMu: 1200,
};

let coreParticles;
let ringParticles;
let ringState = [];
let brownianForce = 0;
let targetSpread = 1.1;
let currentSpread = 1.1;
let keplerTime = 0;
let coreBasePositions;

function createStars() {
  const starGeom = new THREE.BufferGeometry();
  const starCount = 2000;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = THREE.MathUtils.randFloat(400, 1200);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const phi = THREE.MathUtils.randFloat(0, Math.PI);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    positions.set([x, y, z], i * 3);
  }
  starGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({
    color: '#6fb6ff',
    size: 1.1,
    opacity: 0.8,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeom, starMat);
  starfield.add(stars);
}

function createCore() {
  const particleCount = 4500;
  const radius = 14;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(Math.random());
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);
    positions.set([x, y, z], i * 3);
    const hue = 0.6 + Math.random() * 0.08;
    const lightness = 0.4 + Math.random() * 0.35;
    const color = new THREE.Color().setHSL(hue, 0.85, lightness);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  coreBasePositions = positions.slice();
  const material = new THREE.PointsMaterial({
    size: 1.35,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  coreParticles = new THREE.Points(geometry, material);
  saturn.add(coreParticles);
}

function createRing() {
  const particleCount = 3200;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  ringState = new Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    const radius = THREE.MathUtils.randFloat(26, 56);
    const angle = Math.random() * Math.PI * 2;
    const height = THREE.MathUtils.randFloatSpread(4);
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    const y = height;
    positions.set([x, y, z], i * 3);
    const hue = 0.58 + Math.random() * 0.06;
    const lightness = 0.55 + Math.random() * 0.3;
    const color = new THREE.Color().setHSL(hue, 0.75, lightness);
    colors.set([color.r, color.g, color.b], i * 3);
    ringState[i] = { radius, angle, height };
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.25,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ringParticles = new THREE.Points(geometry, material);
  saturn.add(ringParticles);
}

function updateRing(delta, brightness) {
  const positions = ringParticles.geometry.attributes.position.array;
  keplerTime += delta;
  const chaotic = currentSpread > params.chaoticThreshold;
  brownianForce = THREE.MathUtils.lerp(brownianForce, chaotic ? 8.5 : 0.6, 0.05);

  for (let i = 0; i < ringState.length; i += 1) {
    const state = ringState[i];
    const mu = params.keplerMu;
    const omega = Math.sqrt(mu / Math.pow(state.radius, 3));
    state.angle += omega * delta * (1.1 + 0.4 * Math.sin(keplerTime * 0.4));
    const radius = state.radius * currentSpread;
    const x = radius * Math.cos(state.angle);
    const z = radius * Math.sin(state.angle);
    const y = state.height * currentSpread * THREE.MathUtils.lerp(1, 0.35, brightness);
    const noiseAmp = brownianForce * delta * 12;
    positions[i * 3] = x + (Math.random() - 0.5) * noiseAmp;
    positions[i * 3 + 1] = y + (Math.random() - 0.5) * noiseAmp * 0.5;
    positions[i * 3 + 2] = z + (Math.random() - 0.5) * noiseAmp;
  }
  ringParticles.geometry.attributes.position.needsUpdate = true;
}

function updateCore(brightness) {
  const positions = coreParticles.geometry.attributes.position.array;
  const len = positions.length / 3;
  const noiseAmp = brownianForce * 0.6;
  for (let i = 0; i < len; i += 1) {
    const idx = i * 3;
    const baseX = coreBasePositions[idx];
    const baseY = coreBasePositions[idx + 1];
    const baseZ = coreBasePositions[idx + 2];
    positions[idx] = baseX * currentSpread * 0.75 + (Math.random() - 0.5) * noiseAmp;
    positions[idx + 1] = baseY * currentSpread * 0.75 + (Math.random() - 0.5) * noiseAmp;
    positions[idx + 2] = baseZ * currentSpread * 0.75 + (Math.random() - 0.5) * noiseAmp;
  }
  coreParticles.material.opacity = THREE.MathUtils.clamp(brightness, 0.2, 1.0);
  coreParticles.material.size = 1.1 + brightness * 1.5;
  coreParticles.geometry.attributes.position.needsUpdate = true;
}

function animate() {
  const delta = clock.getDelta();
  const lerpFactor = 0.06;
  currentSpread = THREE.MathUtils.lerp(currentSpread, targetSpread, lerpFactor);
  const brightness = THREE.MathUtils.clamp(
    params.baseBrightness + (currentSpread - params.minSpread) / (params.maxSpread - params.minSpread) * (params.maxBrightness - params.baseBrightness),
    params.baseBrightness,
    params.maxBrightness,
  );

  updateRing(delta, brightness);
  updateCore(brightness);

  saturn.rotation.y += delta * 0.06;
  starfield.rotation.y -= delta * 0.002;

  const lookAtPulse = Math.sin(clock.elapsedTime * 0.4) * 4;
  camera.position.y = 22 + lookAtPulse;
  camera.lookAt(new THREE.Vector3(0, 8, 0));

  renderer.render(scene, camera);
  ui.brightness.textContent = `${brightness.toFixed(2)}`;
  requestAnimationFrame(animate);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupFullscreen() {
  ui.fullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });
}

function mapGestureToSpread(openness) {
  targetSpread = THREE.MathUtils.lerp(params.minSpread, params.maxSpread, openness);
}

function computeHandOpenness(landmarks) {
  const palmIndices = [0, 5, 9, 13, 17];
  const palm = palmIndices.reduce((sum, idx) => {
    const lm = landmarks[idx];
    sum.x += lm.x; sum.y += lm.y; sum.z += lm.z; return sum;
  }, { x: 0, y: 0, z: 0 });
  palm.x /= palmIndices.length;
  palm.y /= palmIndices.length;
  palm.z /= palmIndices.length;

  const tipIndices = [4, 8, 12, 16, 20];
  let total = 0;
  tipIndices.forEach((idx) => {
    const lm = landmarks[idx];
    const dx = lm.x - palm.x;
    const dy = lm.y - palm.y;
    const dz = lm.z - palm.z;
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
  });
  const avg = total / tipIndices.length;
  const openness = THREE.MathUtils.clamp((avg - 0.05) / 0.18, 0, 1);
  return openness;
}

let handLandmarker;
let lastVideoTime = -1;
let hasHand = false;

async function setupHandTracking() {
  try {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm',
    );
    handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/hand_landmarker.task',
      },
      runningMode: 'VIDEO',
      numHands: 1,
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    ui.video.srcObject = stream;
    ui.video.onloadeddata = () => {
      ui.gesture.textContent = 'Raise your hand in view';
      detectLoop();
    };
  } catch (err) {
    console.error(err);
    ui.gesture.textContent = 'Enable camera to control the system';
  }
}

async function detectLoop() {
  if (!handLandmarker) return;
  const videoTime = ui.video.currentTime;
  if (videoTime === lastVideoTime) {
    requestAnimationFrame(detectLoop);
    return;
  }
  lastVideoTime = videoTime;

  const results = handLandmarker.detectForVideo(ui.video, performance.now());
  if (results.landmarks.length > 0) {
    hasHand = true;
    const openness = computeHandOpenness(results.landmarks[0]);
    mapGestureToSpread(openness);
    ui.gesture.textContent = `Open ${Math.round(openness * 100)}%`;
  } else {
    if (hasHand) {
      ui.gesture.textContent = 'Hand lost - drifting';
    } else {
      ui.gesture.textContent = 'Searching for hand...';
    }
    hasHand = false;
    targetSpread = THREE.MathUtils.lerp(targetSpread, 1.15, 0.04);
  }
  requestAnimationFrame(detectLoop);
}

function init() {
  createStars();
  createCore();
  createRing();
  animate();
  setupFullscreen();
  setupHandTracking();
  window.addEventListener('resize', onResize);
}

init();
