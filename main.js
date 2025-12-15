import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';

const canvasHost = document.getElementById('canvas-host');
const indicator = document.getElementById('gesture-indicator');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const startBtn = document.getElementById('start-btn');
const video = document.getElementById('input-video');

let renderer, scene, camera, controls;
let saturnSystem;
let gesture = { openness: 0.5, hasHand: false };
let chaosClock = 0;
let hands, mpCamera;
let permissionTimeout;
let hasTriggeredGestureRequest = false;
let isRequesting = false;

init();

function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#02030c', 0.005);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 30, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputEncoding = THREE.sRGBEncoding;
  canvasHost.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  const hemiLight = new THREE.HemisphereLight('#a1d8ff', '#0b0b12', 0.9);
  scene.add(hemiLight);
  const pointLight = new THREE.PointLight('#8ac5ff', 4.5, 400, 2);
  pointLight.position.set(0, 0, 0);
  scene.add(pointLight);

  saturnSystem = new SaturnSystem(scene);

  requestCameraAccess();
  armUserGestureFallback();
  window.addEventListener('resize', onResize);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  startBtn.addEventListener('click', requestCameraAccess);
  animate();
}

function requestCameraAccess() {
  if (isRequesting) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    indicator.textContent = '当前环境无法访问摄像头（需 HTTPS / localhost）';
    return;
  }

  isRequesting = true;
  hasTriggeredGestureRequest = true;
  startBtn.classList.add('hidden');
  indicator.textContent = '正在唤起浏览器的摄像头授权弹窗… 如未出现，请点击页面任意处';

  clearTimeout(permissionTimeout);
  permissionTimeout = setTimeout(() => {
    if (!gesture.hasHand && video.srcObject == null) {
      startBtn.textContent = '重新尝试授权';
      startBtn.classList.remove('hidden');
      indicator.textContent = '未检测到授权弹窗，已超时；请点击任意处或“重新尝试”，并检查浏览器权限';
    }
  }, 2800);

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
    .then((stream) => {
      video.srcObject = stream;
      video.play().catch(() => {});
      startHandTracking();
      indicator.textContent = '已获得摄像头权限，正在启动手势跟踪…';
      isRequesting = false;
    })
    .catch((err) => {
      console.error('Camera access error', err);
      indicator.textContent = '摄像头权限被拒绝或不可用';
      startBtn.textContent = '重新尝试授权';
      startBtn.classList.remove('hidden');
      isRequesting = false;
    });
}

function armUserGestureFallback() {
  const handler = () => {
    if (!hasTriggeredGestureRequest && !video.srcObject) {
      requestCameraAccess();
    }
  };

  const onceHandler = () => {
    handler();
    window.removeEventListener('pointerdown', onceHandler);
    window.removeEventListener('keydown', onceHandler);
  };

  window.addEventListener('pointerdown', onceHandler, { passive: true });
  window.addEventListener('keydown', onceHandler);
}

function startHandTracking() {
  if (!window.Hands || !window.Camera) {
    indicator.textContent = '手势检测脚本加载失败';
    startBtn.classList.remove('hidden');
    return;
  }

  if (!hands) {
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
    });
    hands.onResults((results) => {
      if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
        gesture.hasHand = false;
        indicator.textContent = '将手掌举至画面中';
        return;
      }

      const lm = results.multiHandLandmarks[0];
      gesture.hasHand = true;
      const openness = computeOpenness(lm);
      gesture.openness = THREE.MathUtils.lerp(gesture.openness, openness, 0.15);
      indicator.textContent = `手掌张开度 ${(gesture.openness * 100).toFixed(0)}%`;
    });
  }

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    selfieMode: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  if (mpCamera?.stop) {
    mpCamera.stop();
  }

  mpCamera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480,
  });
  mpCamera.start();
  indicator.textContent = '手势跟踪中';
  startBtn.classList.add('hidden');
}

function computeOpenness(landmarks) {
  const wrist = landmarks[0];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  const thumbTip = landmarks[4];
  const palmCenter = average([wrist, landmarks[5], landmarks[9], landmarks[13], landmarks[17]]);

  const spread =
    distance(indexTip, palmCenter) +
    distance(middleTip, palmCenter) +
    distance(ringTip, palmCenter) +
    distance(pinkyTip, palmCenter) +
    distance(thumbTip, palmCenter);

  const minSpread = 0.5;
  const maxSpread = 2.2;
  return THREE.MathUtils.clamp((spread - minSpread) / (maxSpread - minSpread), 0, 1);
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function average(points) {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

class SaturnSystem {
  constructor(scene) {
    this.scene = scene;
    this.clock = new THREE.Clock();
    this.mu = 500.0;
    this.baseScale = 58;

    this.sphere = this.createCore();
    this.ring = this.createRing();
    this.glow = this.createGlow();
    this.scene.add(this.sphere, this.ring, this.glow);
  }

  createCore() {
    const count = 2400;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const phi = Math.random() * Math.PI * 2;
      const costheta = Math.random() * 2 - 1;
      const u = Math.random();
      const theta = Math.acos(costheta);
      const r = Math.cbrt(u) * 18;
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta);
      positions.set([x, y, z], i * 3);

      const hue = 0.58 + Math.random() * 0.08;
      const color = new THREE.Color().setHSL(hue, 0.55, 0.55 + Math.random() * 0.2);
      colors.set([color.r, color.g, color.b], i * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.5,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    return new THREE.Points(geo, mat);
  }

  createRing() {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.radii = new Float32Array(count);
    this.angles = new Float32Array(count);
    this.inclinations = new Float32Array(count);
    this.angularVelocities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 26 + Math.random() * 28;
      this.radii[i] = r;
      this.angles[i] = Math.random() * Math.PI * 2;
      this.inclinations[i] = THREE.MathUtils.degToRad((Math.random() - 0.5) * 14);
      this.angularVelocities[i] = Math.sqrt(this.mu / Math.pow(r, 3)) * THREE.MathUtils.randFloat(0.8, 1.2);

      const hue = 0.58 + Math.random() * 0.1;
      const color = new THREE.Color().setHSL(hue, 0.55, 0.65);
      colors.set([color.r, color.g, color.b], i * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.2,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.ringPositions = positions;
    return new THREE.Points(geo, mat);
  }

  createGlow() {
    const geo = new THREE.SphereGeometry(28, 64, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: '#d9e7ff',
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(1.8);
    return mesh;
  }

  update(scaleNormalized) {
    const dt = this.clock.getDelta();
    const coreScale = THREE.MathUtils.lerp(0.5, 1.65, scaleNormalized);
    this.sphere.scale.setScalar(coreScale);
    this.glow.scale.setScalar(2.4 * coreScale);

    const brightness = THREE.MathUtils.lerp(0.35, 1.2, scaleNormalized);
    renderer.toneMappingExposure = 0.6 + brightness * 1.3;
    this.sphere.material.opacity = 0.35 + brightness * 0.45;

    this.animateRing(dt, scaleNormalized, brightness);
    this.sphere.rotation.y += 0.02 * dt;
    this.glow.rotation.y += 0.01 * dt;
  }

  animateRing(dt, scaleNormalized, brightness) {
    const chaos = Math.max(0, scaleNormalized - 0.78);
    chaosClock += dt * 40 * (1 + chaos * 2.5);

    const scaleFactor = THREE.MathUtils.lerp(0.85, 2.4, scaleNormalized);
    const pos = this.ringPositions;
    for (let i = 0; i < this.radii.length; i++) {
      this.angles[i] += this.angularVelocities[i] * dt * (1.0 + scaleNormalized * 0.6);
      const r = this.radii[i] * scaleFactor;
      const angle = this.angles[i];
      const inc = this.inclinations[i];

      let x = r * Math.cos(angle);
      let z = r * Math.sin(angle);
      let y = Math.sin(inc) * r * 0.08;

      if (chaos > 0.0001) {
        const noiseAmp = chaos * chaos * 24;
        x += (Math.sin(chaosClock * 0.9 + i) + Math.random() - 0.5) * noiseAmp;
        y += (Math.cos(chaosClock * 1.1 + i * 1.7) + Math.random() - 0.5) * noiseAmp * 0.6;
        z += (Math.sin(chaosClock * 1.3 + i * 0.7) + Math.random() - 0.5) * noiseAmp;
      }

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }

    this.ring.geometry.attributes.position.needsUpdate = true;
    this.ring.material.opacity = 0.4 + brightness * 0.5;
    this.ring.material.size = THREE.MathUtils.lerp(1.2, 2.5, scaleNormalized);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const openness = gesture.hasHand ? gesture.openness : 0.5 + Math.sin(performance.now() * 0.0007) * 0.25;
  saturnSystem.update(openness);
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}
