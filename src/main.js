import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import './style.css';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 0.85));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;


// Performance-first defaults: the experience is designed to remain fluid on
// integrated graphics and older laptops. Visual quality can be raised manually.
const performanceState = {
  mode: 'performance',
  basePixelRatio: 0.85,
  adaptivePixelRatio: 0.85,
  lowFpsSeconds: 0,
  frameAccumulator: 0,
  frameSamples: 0,
  frameCounter: 0,
  adaptiveReduced: false,
};

function applyPerformanceMode(mode = performanceState.mode) {
  performanceState.mode = mode;
  const balanced = mode === 'balanced';
  performanceState.basePixelRatio = balanced ? 1.15 : 0.85;
  performanceState.adaptivePixelRatio = performanceState.basePixelRatio;
  renderer.setPixelRatio(Math.min(devicePixelRatio, performanceState.adaptivePixelRatio));
  renderer.shadowMap.enabled = balanced;
  renderer.shadowMap.type = balanced ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (typeof sun !== 'undefined') sun.castShadow = balanced;
  if (typeof dustPoints !== 'undefined' && dustPoints) dustPoints.visible = balanced && !experience?.silence;
  if (typeof incensePoints !== 'undefined' && incensePoints) incensePoints.material.size = balanced ? .18 : .14;
  document.querySelector('#qualityBtn')?.classList.toggle('active', balanced);
  const q = document.querySelector('#qualityBtn');
  if (q) q.textContent = balanced ? 'Balanced' : 'Performance';
}

function updateAdaptivePerformance(dt) {
  performanceState.frameAccumulator += dt;
  performanceState.frameSamples++;
  if (performanceState.frameAccumulator < 2.5) return;
  const fps = performanceState.frameSamples / performanceState.frameAccumulator;
  performanceState.frameAccumulator = 0;
  performanceState.frameSamples = 0;
  if (fps < 38 && performanceState.adaptivePixelRatio > 0.62) {
    performanceState.lowFpsSeconds += 2.5;
    if (performanceState.lowFpsSeconds >= 5) {
      performanceState.adaptivePixelRatio = Math.max(0.62, performanceState.adaptivePixelRatio - 0.12);
      renderer.setPixelRatio(Math.min(devicePixelRatio, performanceState.adaptivePixelRatio));
      performanceState.adaptiveReduced = true;
      performanceState.lowFpsSeconds = 0;
      if (dustPoints) dustPoints.visible = false;
    }
  } else {
    performanceState.lowFpsSeconds = Math.max(0, performanceState.lowFpsSeconds - 2.5);
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b0e0a);
scene.fog = new THREE.FogExp2(0x3c2116, 0.0035);

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.14, 1200);
// The STL uses Z as the architectural/world vertical. Keeping the camera Z-up
// guarantees yaw is a true turn around the viewer's vertical axis with no roll.
camera.up.set(0, 0, 1);
camera.position.set(0, -108, 4.2);
scene.add(camera);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.zIndex = '12';
document.querySelector('#app').appendChild(labelRenderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
const textureLoader = new THREE.TextureLoader();

function createStoneTexture(base = '#d7a88f', vein = '#9f6f62', light = '#efd0b9') {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0,0,size,size);
  const image = ctx.getImageData(0,0,size,size);
  const d = image.data;
  for (let i=0;i<d.length;i+=4) {
    const grain = (Math.random()-0.5)*18;
    d[i] = Math.max(0,Math.min(255,d[i]+grain));
    d[i+1] = Math.max(0,Math.min(255,d[i+1]+grain*0.78));
    d[i+2] = Math.max(0,Math.min(255,d[i+2]+grain*0.62));
  }
  ctx.putImageData(image,0,0);
  ctx.globalAlpha = .15;
  ctx.strokeStyle = vein;
  ctx.lineWidth = 1.2;
  for(let n=0;n<26;n++){
    ctx.beginPath();
    let y=Math.random()*size;
    ctx.moveTo(-20,y);
    for(let x=0;x<size+40;x+=28){
      y += (Math.random()-0.5)*15;
      ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = .12;
  ctx.strokeStyle = light;
  for(let n=0;n<12;n++){
    ctx.beginPath();
    let x=Math.random()*size, y=Math.random()*size;
    ctx.moveTo(x,y);
    for(let s=0;s<5;s++){
      x += 18+Math.random()*34; y += (Math.random()-0.5)*22;
      ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;
  return tex;
}

const pinkStoneTex = createStoneTexture('#d7a38f','#8f675f','#f1cdb6');
const paleStoneTex = createStoneTexture('#e2bea0','#a97a69','#f7dbc4');
const pavingStoneTex = createStoneTexture('#cda283','#9b7869','#e8c5a7');

const walkCam = {
  yaw: 0,
  pitch: 0.02,
  currentYaw: 0,
  currentPitch: 0.02,
  eyeHeight: 1.58,
  minPitch: -1.05,
  maxPitch: 1.05,
  mouseSensitivityX: 0.0042,
  mouseSensitivityY: 0.0035,
  keyTurnSpeed: 1.75,
  minFov: 38,
  maxFov: 78,
  zoomStep: 0.045,
  rotationDamping: 13,
  horizontalDamping: 18,
  verticalDamping: 14,
  stairVerticalDamping: 9,
  renderPos: new THREE.Vector3(),
  initialized: false,
};
const walkAim = new THREE.Vector3();
const walkDir = new THREE.Vector3();
const walkDesiredPos = new THREE.Vector3();
let walkEngaged = false;
let streetDrag = false;
let lastPointerX = 0;
let lastPointerY = 0;

function updateWalkOrientation(dt = 1 / 60, force = false) {
  if (force || !walkCam.initialized) {
    walkCam.currentYaw = walkCam.yaw;
    walkCam.currentPitch = walkCam.pitch;
    return;
  }
  walkCam.currentYaw = THREE.MathUtils.damp(walkCam.currentYaw, walkCam.yaw, walkCam.rotationDamping, dt);
  walkCam.currentPitch = THREE.MathUtils.damp(walkCam.currentPitch, walkCam.pitch, walkCam.rotationDamping, dt);
}

function updateWalkCamera(dt = 1 / 60, force = false) {
  if (typeof dt === 'boolean') {
    force = dt;
    dt = 1 / 60;
  }
  updateWalkOrientation(dt, force);
  walkDesiredPos.set(player.position.x, player.position.y, player.position.z + walkCam.eyeHeight);

  if (force || !walkCam.initialized) {
    walkCam.renderPos.copy(walkDesiredPos);
    walkCam.initialized = true;
  } else {
    walkCam.renderPos.x = THREE.MathUtils.damp(walkCam.renderPos.x, walkDesiredPos.x, walkCam.horizontalDamping, dt);
    walkCam.renderPos.y = THREE.MathUtils.damp(walkCam.renderPos.y, walkDesiredPos.y, walkCam.horizontalDamping, dt);
    const verticalDamping = zoneState?.active?.id === 'main-stairs' ? walkCam.stairVerticalDamping : walkCam.verticalDamping;
    walkCam.renderPos.z = THREE.MathUtils.damp(walkCam.renderPos.z, walkDesiredPos.z, verticalDamping, dt);
  }

  camera.position.copy(walkCam.renderPos);
  const cp = Math.cos(walkCam.currentPitch);
  walkDir.set(
    Math.sin(walkCam.currentYaw) * cp,
    Math.cos(walkCam.currentYaw) * cp,
    Math.sin(walkCam.currentPitch)
  ).normalize();
  walkAim.copy(camera.position).addScaledVector(walkDir, 12);
  camera.lookAt(walkAim);
}
orbit.enabled = false;
orbit.enableDamping = true;
orbit.dampingFactor = .055;
orbit.maxDistance = 320;
orbit.minDistance = 8;
orbit.maxPolarAngle = Math.PI * .49;
orbit.target.set(0, 14, 20);

// --- Environment / time-of-day ------------------------------------------------
const sky = new Sky();
sky.scale.setScalar(900);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 7.5;
skyU.rayleigh.value = 2.2;
skyU.mieCoefficient.value = 0.008;
skyU.mieDirectionalG.value = 0.82;

const hemi = new THREE.HemisphereLight(0xffd7aa, 0x26150e, 1.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffd6a0, 5.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 450;
sun.shadow.camera.left = -135;
sun.shadow.camera.right = 135;
sun.shadow.camera.top = 155;
sun.shadow.camera.bottom = -155;
sun.shadow.bias = -0.00012;
scene.add(sun);
scene.add(sun.target);

const warmTempleLights = [];
let currentZoneProfile = { lightBoost: 1, exposureBoost: 0, fogFactor: 1, accent: 0xffa13a, accentIntensity: 0 };
let sacredFocusFactor = 1;
let ritualLightFactor = 1;
var ritualReady = false;
const zoneAccentLight = new THREE.PointLight(0xffa13a, 0, 38, 1.7);
zoneAccentLight.position.set(0, -75, 8);
scene.add(zoneAccentLight);
const journeyGuideLight = new THREE.PointLight(0xffc66d, 0, 32, 1.7);
journeyGuideLight.position.set(0,-77,6); scene.add(journeyGuideLight);
function addWarmLight(x, y, z, intensity=16, distance=22) {
  const l = new THREE.PointLight(0xff9a3d, intensity, distance, 1.75);
  l.position.set(x,y,z); scene.add(l); warmTempleLights.push(l); return l;
}
[[-24,-60,8],[24,-60,8],[-31,-12,10],[31,-12,10],[-25,34,12],[25,34,12],[-15,72,14],[15,72,14]].forEach(v=>addWarmLight(...v));

const eveningRig = [];
const nightRig = [];
const diyaSprites = [];

function addArchitecturalLight(x,y,z,color=0xffa24a,intensity=0,distance=28,decay=1.8){
  const l = new THREE.PointLight(color,intensity,distance,decay);
  l.position.set(x,y,z); scene.add(l); eveningRig.push(l); return l;
}
function addNightLight(x,y,z,color=0x7fa6ff,intensity=0,distance=42,decay=1.4){
  const l = new THREE.PointLight(color,intensity,distance,decay);
  l.position.set(x,y,z); scene.add(l); nightRig.push(l); return l;
}

// Plinth / staircase / facade warmth
[
  [-34,-88,3],[34,-88,3],[-28,-70,4],[28,-70,4],
  [-38,-46,5],[38,-46,5],[-34,-14,7],[34,-14,7],
  [-30,22,8],[30,22,8],[-24,54,10],[24,54,10],
  [-16,78,12],[16,78,12],[0,-82,4],[0,-54,6],[0,-20,8],[0,20,9],[0,52,11],[0,78,13]
].forEach(v=>addArchitecturalLight(...v));

// Cool moon / night fill, deliberately subtle and high-set
[
  [-55,-55,28],[55,-10,30],[-42,55,32],[42,82,35],[0,20,42]
].forEach(v=>addNightLight(...v));

const moonLight = new THREE.DirectionalLight(0x9db8ff,0);
moonLight.position.set(-90,-40,160);
moonLight.target.position.set(0,25,20);
scene.add(moonLight); scene.add(moonLight.target);

const interiorRig = [];
function addInteriorLight(x,y,z,color=0xffc47b,distance=24){
  const l = new THREE.PointLight(color,0,distance,1.55);
  l.position.set(x,y,z); scene.add(l); interiorRig.push(l); return l;
}
[
  [-18,-56,7],[18,-56,7],[0,-48,8],
  [-22,-24,9],[22,-24,9],[0,-14,10],
  [-20,8,10],[20,8,10],[0,18,11],
  [-17,38,12],[17,38,12],[0,48,13],
  [-12,64,13],[12,64,13],[0,72,14],
  [-8,84,13],[8,84,13],[0,88,14]
].forEach(v=>addInteriorLight(...v));

const sanctumAxisSpots=[];
function addAxisSpot(x,y,z,targetY,color=0xffdda0){
  const s=new THREE.SpotLight(color,0,32,Math.PI/5.8,.62,1.35);
  s.position.set(x,y,z); s.target.position.set(0,targetY,z-5);
  scene.add(s); scene.add(s.target); sanctumAxisSpots.push(s); return s;
}
addAxisSpot(-5,56,16,78); addAxisSpot(5,56,16,78); addAxisSpot(0,70,18,92);

let hour = 8;
function setTimeOfDay(h) {
  hour = ((+h % 24) + 24) % 24;
  const angle = (hour - 6) / 24 * Math.PI * 2;
  const altitude = Math.sin(angle);
  const azimuth = angle * .55 - .8;
  const r = 310;
  const sunPos = new THREE.Vector3(Math.cos(azimuth)*r, Math.sin(azimuth)*r, altitude*r);
  sun.position.copy(sunPos);
  sun.target.position.set(0, 20, 0);

  const daylight = THREE.MathUtils.smoothstep(altitude, -0.12, 0.45);
  const dawn = Math.max(0, 1 - Math.abs(hour - 6.3)/2.5);
  const dusk = Math.max(0, 1 - Math.abs(hour - 18.2)/2.5);
  const golden = Math.max(dawn, dusk);

  sun.intensity = Math.max(0, daylight * 5.4);
  sun.color.setHSL(0.09 - golden*.025, .62 + golden*.18, .77 - golden*.17);
  hemi.intensity = .18 + daylight * 1.05;
  hemi.color.setHSL(.08, .45, .45 + daylight*.28);
  hemi.groundColor.setHSL(.05, .38, .08 + daylight*.05);
  renderer.toneMappingExposure = .72 + daylight*.43 + golden*.1 + (currentZoneProfile.exposureBoost || 0);
  scene.fog.color.setHSL(.055, .42, .07 + daylight*.16);
  scene.fog.density = 0.0035 * (currentZoneProfile.fogFactor || 1);

  skyU.sunPosition.value.copy(sunPos.normalize());
  skyU.rayleigh.value = .28 + daylight * 2.2 + golden * .7;
  skyU.turbidity.value = 5.5 + golden * 5;
  skyU.mieCoefficient.value = .003 + golden*.012;

  const artificial = 1 - THREE.MathUtils.smoothstep(daylight, .14, .65);
  const evening = THREE.MathUtils.clamp(1 - Math.abs(hour - 18.5) / 2.7, 0, 1);
  const night = (hour >= 20 || hour <= 4.8) ? 1 : THREE.MathUtils.clamp((hour - 18.8) / 1.7, 0, 1);
  const lateNight = (hour >= 21 || hour <= 4) ? 1 : night;
  ritualLightFactor = evening > .32 ? 1.16 : 1;

  warmTempleLights.forEach(l => l.intensity = (5 + artificial * 30 + golden*7) * (currentZoneProfile.lightBoost || 1) * sacredFocusFactor * ritualLightFactor);
  eveningRig.forEach((l,i) => {
    const rhythm = 0.92 + (i % 3) * 0.06;
    l.intensity = (evening * 48 + night * 34) * rhythm * (currentZoneProfile.lightBoost || 1) * sacredFocusFactor * ritualLightFactor;
  });
  nightRig.forEach((l,i) => {
    l.intensity = night * (10 + (i % 2) * 4) * (0.82 + sacredFocusFactor * 0.18);
  });
  moonLight.intensity = night * 1.65;
  const morningInterior = THREE.MathUtils.clamp(1 - Math.abs(hour - 8.2) / 3.1, 0, 1);
  const interiorBase = morningInterior * 5.5 + evening * 16 + night * 12;
  interiorRig.forEach((l,i)=>{
    const depth = i / Math.max(1, interiorRig.length-1);
    l.intensity = interiorBase * (0.72 + depth * 0.68) * (currentZoneProfile.lightBoost || 1) * sacredFocusFactor;
    l.color.set(depth > .68 ? 0xffbd6a : (night>.3 ? 0xffae63 : 0xffd09a));
  });
  sanctumAxisSpots.forEach((s,i)=>{
    s.intensity = (morningInterior*7 + evening*21 + night*17) * (1+i*.13) * sacredFocusFactor;
  });
  zoneAccentLight.color.set(currentZoneProfile.accent || 0xffa13a);
  zoneAccentLight.intensity = (currentZoneProfile.accentIntensity || 0) * (.55 + artificial * .45 + golden * .15 + night * .22);

  // Evening and night preserve stone detail without flattening the scene.
  if (night > 0.05) {
    renderer.toneMappingExposure += night * 0.16;
    hemi.color.lerp(new THREE.Color(0x8096c8), night * 0.7);
    hemi.groundColor.lerp(new THREE.Color(0x171521), night * 0.75);
  }

  diyaSprites.forEach((s,i) => {
    const base = 0.22 + evening * 0.5 + night * 0.78;
    s.material.opacity = Math.min(1, base);
    s.scale.setScalar(0.42 + evening * 0.15 + night * 0.22);
  });

  horizonMaterials.forEach(mat => {
    if (!mat) return;
    mat.opacity = 0.08 + night * 0.12 + dusk * 0.06 + dawn * 0.04;
  });
  if (sanctumPanel?.material) {
    sanctumPanel.material.emissiveIntensity = 0.16 + evening * 0.16 + night * 0.24;
  }
  if (sanctumGlow) {
    sanctumGlow.intensity = 4.8 + evening * 5.5 + night * 7.5;
  }

  const hh = Math.floor(hour), mm = Math.floor((hour-hh)*60);
  document.querySelector('#clockLabel').textContent = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  document.querySelector('#timeSlider').value = hour;
  document.querySelectorAll('.time-chip').forEach(b => b.classList.toggle('active', Math.abs(+b.dataset.hour-hour)<.2));
  if(ritualReady) updateRitualEnvironment();
}

// The former circular ground/halo mesh was removed entirely. Even when placed
// below the precinct it could reappear from shallow camera angles and contribute
// to depth-buffer fighting. Atmosphere is now provided only by lighting/fog,
// leaving the precinct and temple base as the sole rendered ground surfaces.

const precinctGroup = new THREE.Group(); scene.add(precinctGroup);
const horizonGroup = new THREE.Group(); scene.add(horizonGroup);
const sanctumGroup = new THREE.Group(); scene.add(sanctumGroup);
const horizonMaterials = [];
const precinctColliderGeometries = [];
let precinctCollider = null;
let sanctumPanel = null;
let sanctumGlow = null;

function addPrecinctElement(geometry, material, position, { rotation = null, scale = null, castShadow = true, receiveShadow = true, addCollider = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  if (scale) mesh.scale.copy(scale);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.updateMatrix();
  precinctGroup.add(mesh);
  if (addCollider) precinctColliderGeometries.push(geometry.clone().applyMatrix4(mesh.matrix));
  return mesh;
}

function finalizePrecinctCollider() {
  if (precinctCollider || !precinctColliderGeometries.length) return;
  const merged = mergeGeometries(precinctColliderGeometries, false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.boundsTree = new MeshBVH(merged, { maxLeafTris: 24, strategy: 0 });
  precinctCollider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible: false }));
  precinctCollider.updateMatrixWorld(true);
  scene.add(precinctCollider);
}

function buildArchShape(width, height, archHeight) {
  const hw = width / 2;
  const archY = height - archHeight;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(-hw, archY);
  shape.absarc(0, archY, hw, Math.PI, 0, false);
  shape.lineTo(hw, 0);
  shape.lineTo(-hw, 0);
  return shape;
}

function createTemplePrecinct() {
  if (precinctGroup.userData.built) return;
  precinctGroup.userData.built = true;

  const precinctHalfX = 118;
  const precinctHalfY = 188;
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x8fb65e, roughness: 0.95, metalness: 0.0 });
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x617f47, roughness: 0.98, metalness: 0.0 });
  const pathTex=pavingStoneTex.clone(); pathTex.needsUpdate=true; pathTex.repeat.set(10,16);
  const wallTex=pinkStoneTex.clone(); wallTex.needsUpdate=true; wallTex.repeat.set(8,12);
  const trimTex=paleStoneTex.clone(); trimTex.needsUpdate=true; trimTex.repeat.set(8,12);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xd1a07f, map:pathTex, roughness: 0.92, metalness: 0.02 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map:wallTex, roughness: 0.9, metalness: 0.02 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe0b796, map:trimTex, roughness: 0.82, metalness: 0.03 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc4775e, roughness: 0.86, metalness: 0.02 });

  // The original temple STL is never cut, clipped, or modified. A single
  // continuous visual foundation now runs beneath the entire precinct. Its top
  // sits 0.10 model units below the STL datum (z=0), which fills the former
  // hollow around the plinth while remaining far enough below the temple base
  // to avoid coplanar z-fighting.
  const templeClearX = 90.0;
  const templeSouthY = -135.0;
  const templeNorthY = 143.0;
  const baseH = 1.8;
  const foundationTopZ = -0.10;
  const baseZ = foundationTopZ - baseH / 2;
  addPrecinctElement(
    new THREE.BoxGeometry(precinctHalfX * 2, precinctHalfY * 2, baseH),
    pathMat,
    new THREE.Vector3(0, 0, baseZ),
    { castShadow:false, receiveShadow:true, addCollider:false }
  );

  // Walking support is kept independent from the visible foundation. These
  // invisible slabs stop outside the measured temple footprint, allowing the
  // temple's own BVH to provide the floor inside the plinth while the outer
  // precinct remains level and collision-safe.
  const walkTopZ = 0.14;
  const walkH = 0.18;
  const walkZ = walkTopZ - walkH / 2;
  const templeFootX = 79.4;
  const templeFootSouthY = -121.6;
  const templeFootNorthY = 129.5;
  const sideWalkW = precinctHalfX - templeFootX;
  const southWalkLen = templeFootSouthY - (-precinctHalfY);
  const northWalkLen = precinctHalfY - templeFootNorthY;
  const pushColliderBox = (w,h,d,x,y,z) => {
    const g = new THREE.BoxGeometry(w,h,d);
    const m = new THREE.Matrix4().makeTranslation(x,y,z);
    precinctColliderGeometries.push(g.applyMatrix4(m));
  };
  pushColliderBox(sideWalkW, precinctHalfY*2, walkH, -(templeFootX + sideWalkW/2), 0, walkZ);
  pushColliderBox(sideWalkW, precinctHalfY*2, walkH,  (templeFootX + sideWalkW/2), 0, walkZ);
  pushColliderBox(templeFootX*2, southWalkLen, walkH, 0, -precinctHalfY + southWalkLen/2, walkZ);
  pushColliderBox(templeFootX*2, northWalkLen, walkH, 0, templeFootNorthY + northWalkLen/2, walkZ);

  // Decorative court/lawn/path overlays remain outside the temple footprint,
  // but the continuous foundation underneath means there is no visible moat or
  // rectangular hole around the original plinth.
  const courtHalfX = 88;
  const courtSouthY = -139;
  const courtNorthY = 147;

  // Four principal lawns moved fully outside the temple footprint. This keeps
  // the reference-image courtyard composition without letting lawn faces sit
  // under the temple's lowest platform.
  // Lawns are explicitly cut around the long side circulation paths. Earlier
  // versions placed the stone path inside a single grass box at x=+/-99,
  // leaving overlapping volumes that shimmered at shallow viewing angles.
  // These grass strips never overlap the paving geometry.
  const lawnFields = [
    [-99, -28, 30, 116], [99, -28, 30, 116],
    [-99, 106, 30, 80], [99, 106, 30, 80],
  ];
  const sidePathWidth = 18;
  const lawnPathClearance = 0.8;
  const lawnTopZ = 0.30;
  const lawnThickness = 0.08;
  const lawnCenterZ = lawnTopZ - lawnThickness / 2;
  lawnFields.forEach(([x, y, w, h]) => {
    const usableGrass = w - sidePathWidth - lawnPathClearance * 2;
    const stripW = usableGrass / 2;
    const offset = sidePathWidth / 2 + lawnPathClearance + stripW / 2;
    [-1, 1].forEach(side => {
      addPrecinctElement(
        new THREE.BoxGeometry(stripW, h, lawnThickness),
        lawnMat,
        new THREE.Vector3(x + side * offset, y, lawnCenterZ),
        { castShadow:false, receiveShadow:true, addCollider:false }
      );
    });

    // Hedges begin above the grass surface instead of sharing a coplanar bottom
    // face with it. They outline the outside of each field while leaving the
    // stone circulation corridor open through the middle.
    const hedgeH = .58, hedgeT = .52, hedgeBaseZ = lawnTopZ + 0.025;
    const hedgeZ = hedgeBaseZ + hedgeH / 2;
    const outerLeft = x - w/2, outerRight = x + w/2;
    [outerLeft, outerRight].forEach(hx => {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(hedgeT,h,hedgeH),hedgeMat);
      hedge.position.set(hx,y,hedgeZ); hedge.castShadow=true; hedge.receiveShadow=true; precinctGroup.add(hedge);
    });
    // Short end hedges are split around the central path opening.
    [-1,1].forEach(end => {
      [-1,1].forEach(side => {
        const hedge = new THREE.Mesh(new THREE.BoxGeometry(stripW,hedgeT,hedgeH),hedgeMat);
        hedge.position.set(x + side * offset, y + end*h/2, hedgeZ);
        hedge.castShadow=true; hedge.receiveShadow=true; precinctGroup.add(hedge);
      });
    });
  });

  // Processional paving network. Central strips are split at the temple
  // footprint instead of passing underneath it.
  const pathTopZ = 0.205;
  const pathH = 0.035;
  const pathZ = pathTopZ - pathH / 2;
  const southAxisCenter = (-136 + templeSouthY) / 2;
  const southAxisLen = templeSouthY - (-136);
  if (southAxisLen > 0.1) addPrecinctElement(new THREE.BoxGeometry(42, southAxisLen, pathH), pathMat,
    new THREE.Vector3(0, southAxisCenter, pathZ), { castShadow:false, receiveShadow:true, addCollider:false });
  const northAxisCenter = (templeNorthY + 136) / 2;
  const northAxisLen = 136 - templeNorthY;
  if (northAxisLen > 0.1) addPrecinctElement(new THREE.BoxGeometry(42, northAxisLen, pathH), pathMat,
    new THREE.Vector3(0, northAxisCenter, pathZ), { castShadow:false, receiveShadow:true, addCollider:false });

  // Side circulation remains outside the temple clear footprint.
  addPrecinctElement(new THREE.BoxGeometry(18, 126, pathH), pathMat, new THREE.Vector3(-99, 5, pathZ+0.004), { castShadow:false, receiveShadow:true, addCollider:false });
  addPrecinctElement(new THREE.BoxGeometry(18, 126, pathH), pathMat, new THREE.Vector3(99, 5, pathZ+0.004), { castShadow:false, receiveShadow:true, addCollider:false });

  // Cross-court bands are split into west/east pieces only, never under the STL.
  [-66, 66].forEach((y,idx) => {
    const sideW = 118 - templeClearX - 4;
    if (sideW > 0.1) {
      const cx = templeClearX + 2 + sideW/2;
      addPrecinctElement(new THREE.BoxGeometry(sideW, 18, pathH), pathMat, new THREE.Vector3(-cx, y, pathZ+0.006+idx*0.002), { castShadow:false, receiveShadow:true, addCollider:false });
      addPrecinctElement(new THREE.BoxGeometry(sideW, 18, pathH), pathMat, new THREE.Vector3(cx, y, pathZ+0.006+idx*0.002), { castShadow:false, receiveShadow:true, addCollider:false });
    }
  });

  // Main south/front stair sequence into the parkota.
  for (let i = 0; i < 7; i++) {
    addPrecinctElement(new THREE.BoxGeometry(38 + i * 8, 8.6, 0.48), trimMat, new THREE.Vector3(0, -precinctHalfY - 12 + i * 6.8, -1.42 + i * 0.24), { castShadow: false, receiveShadow: true });
  }

  const wallHeight = 8.2;
  const wallThickness = 4.2;
  const mainGateHalf = 15;
  const eastGateY = -43;
  const eastGateHalf = 12;

  // North wall.
  addPrecinctElement(new THREE.BoxGeometry(precinctHalfX*2, wallThickness, wallHeight), wallMat, new THREE.Vector3(0, precinctHalfY-wallThickness/2, wallHeight/2-.08));
  // South wall is split to create a true walkable main gate opening.
  const southSegW = precinctHalfX-mainGateHalf;
  addPrecinctElement(new THREE.BoxGeometry(southSegW, wallThickness, wallHeight), wallMat, new THREE.Vector3(-(precinctHalfX+mainGateHalf)/2, -precinctHalfY+wallThickness/2, wallHeight/2-.08));
  addPrecinctElement(new THREE.BoxGeometry(southSegW, wallThickness, wallHeight), wallMat, new THREE.Vector3((precinctHalfX+mainGateHalf)/2, -precinctHalfY+wallThickness/2, wallHeight/2-.08));
  // West wall remains continuous.
  addPrecinctElement(new THREE.BoxGeometry(wallThickness, precinctHalfY*2, wallHeight), wallMat, new THREE.Vector3(-precinctHalfX+wallThickness/2,0,wallHeight/2-.08));
  // East wall split around a secondary gateway, reflecting the reference image's east-side entry logic.
  const eastBottomLen=(eastGateY-eastGateHalf)-(-precinctHalfY);
  const eastTopLen=precinctHalfY-(eastGateY+eastGateHalf);
  addPrecinctElement(new THREE.BoxGeometry(wallThickness,eastBottomLen,wallHeight),wallMat,new THREE.Vector3(precinctHalfX-wallThickness/2,-precinctHalfY+eastBottomLen/2,wallHeight/2-.08));
  addPrecinctElement(new THREE.BoxGeometry(wallThickness,eastTopLen,wallHeight),wallMat,new THREE.Vector3(precinctHalfX-wallThickness/2,eastGateY+eastGateHalf+eastTopLen/2,wallHeight/2-.08));

  // Repeated wall buttresses/articulation.
  for(let y=-156;y<=156;y+=26){
    addPrecinctElement(new THREE.BoxGeometry(2.2,5.8,10.2),trimMat,new THREE.Vector3(-precinctHalfX+3.3,y,5.05));
    if(Math.abs(y-eastGateY)>18) addPrecinctElement(new THREE.BoxGeometry(2.2,5.8,10.2),trimMat,new THREE.Vector3(precinctHalfX-3.3,y,5.05));
  }
  for(let x=-91;x<=91;x+=26){
    if(Math.abs(x)>mainGateHalf+5) addPrecinctElement(new THREE.BoxGeometry(5.8,2.2,10.2),trimMat,new THREE.Vector3(x,-precinctHalfY+3.3,5.05));
    addPrecinctElement(new THREE.BoxGeometry(5.8,2.2,10.2),trimMat,new THREE.Vector3(x,precinctHalfY-3.3,5.05));
  }

  function addGate(x,y,rotationZ=0,span=30){
    const side=span/2+5;
    const pylons=[-side,side];
    pylons.forEach(s=>{
      const px=x + Math.cos(rotationZ)*s;
      const py=y + Math.sin(rotationZ)*s;
      addPrecinctElement(new THREE.BoxGeometry(8.2,8.2,13.4),wallMat,new THREE.Vector3(px,py,6.65));
      addPrecinctElement(new THREE.CylinderGeometry(4.1,4.8,5.8,8),roofMat,new THREE.Vector3(px,py,16.2));
    });
    const beamGeo=new THREE.BoxGeometry(span+18,3.4,3.6);
    addPrecinctElement(beamGeo,trimMat,new THREE.Vector3(x,y,13.1),{rotation:new THREE.Euler(0,0,rotationZ)});
    // Central upper pavilion gives the gateway a temple-like silhouette.
    addPrecinctElement(new THREE.BoxGeometry(9.2,5.6,5.8),wallMat,new THREE.Vector3(x,y,17.6),{rotation:new THREE.Euler(0,0,rotationZ)});
    addPrecinctElement(new THREE.CylinderGeometry(3.6,4.6,6.4,8),roofMat,new THREE.Vector3(x,y,23.1));
  }
  addGate(0,-precinctHalfY+3.1,0,30);
  addGate(precinctHalfX-3.1,eastGateY,Math.PI/2,24);

  // Short stair from east gate into the precinct.
  for(let i=0;i<5;i++){
    addPrecinctElement(new THREE.BoxGeometry(7.5,28+i*4,.48),trimMat,new THREE.Vector3(precinctHalfX+10-i*5.7,eastGateY,-1.28+i*.25),{castShadow:false,receiveShadow:true});
  }

  // Corner shrine/pavilion masses.
  [[-precinctHalfX+10,-precinctHalfY+10],[precinctHalfX-10,-precinctHalfY+10],[-precinctHalfX+10,precinctHalfY-10],[precinctHalfX-10,precinctHalfY-10]].forEach(([x,y])=>{
    addPrecinctElement(new THREE.BoxGeometry(13.5,13.5,10.8),wallMat,new THREE.Vector3(x,y,5.3));
    addPrecinctElement(new THREE.CylinderGeometry(5.1,6.5,7.8,8),roofMat,new THREE.Vector3(x,y,14.6));
    addPrecinctElement(new THREE.CylinderGeometry(2.8,4.8,6.1,8),trimMat,new THREE.Vector3(x,y,21.2));
  });

  // Inner parkota colonnade. Rendered as instanced stone columns to keep the
  // repeated perimeter rhythm from the reference without hundreds of draw calls.
  const columnPoints=[];
  for(let x=-94;x<=94;x+=10){
    if(Math.abs(x)>22){ columnPoints.push([x,-172]); columnPoints.push([x,172]); }
  }
  for(let y=-150;y<=150;y+=10){
    columnPoints.push([-102,y]);
    if(Math.abs(y-eastGateY)>18) columnPoints.push([102,y]);
  }
  const colGeo=new THREE.CylinderGeometry(.68,.86,6.7,10);
  const colInst=new THREE.InstancedMesh(colGeo,trimMat,columnPoints.length);
  const colMatrix=new THREE.Matrix4();
  columnPoints.forEach(([x,y],i)=>{
    colMatrix.makeTranslation(x,y,3.38);
    colInst.setMatrixAt(i,colMatrix);
    precinctColliderGeometries.push(colGeo.clone().applyMatrix4(colMatrix));
  });
  colInst.castShadow=false; colInst.receiveShadow=true; precinctGroup.add(colInst);

  // Continuous stone beam/cornice above the inner colonnade.
  addPrecinctElement(new THREE.BoxGeometry(204,3.0,1.15),trimMat,new THREE.Vector3(0,172,7.55));
  addPrecinctElement(new THREE.BoxGeometry(204,3.0,1.15),trimMat,new THREE.Vector3(0,-172,7.55));
  addPrecinctElement(new THREE.BoxGeometry(3.0,324,1.15),trimMat,new THREE.Vector3(-102,0,7.55));
  addPrecinctElement(new THREE.BoxGeometry(3.0,119,1.15),trimMat,new THREE.Vector3(102,-113.5,7.55));
  addPrecinctElement(new THREE.BoxGeometry(3.0,175,1.15),trimMat,new THREE.Vector3(102,86.5,7.55));

  // Parkota parapet bands, giving the perimeter a temple-wall silhouette rather
  // than a plain rectangular retaining wall.
  const parapetZ=8.65;
  addPrecinctElement(new THREE.BoxGeometry(precinctHalfX*2,5.0,1.05),roofMat,new THREE.Vector3(0,precinctHalfY-2.5,parapetZ));
  const southLeftW=precinctHalfX-mainGateHalf;
  addPrecinctElement(new THREE.BoxGeometry(southLeftW,5.0,1.05),roofMat,new THREE.Vector3(-(precinctHalfX+mainGateHalf)/2,-precinctHalfY+2.5,parapetZ));
  addPrecinctElement(new THREE.BoxGeometry(southLeftW,5.0,1.05),roofMat,new THREE.Vector3((precinctHalfX+mainGateHalf)/2,-precinctHalfY+2.5,parapetZ));
  addPrecinctElement(new THREE.BoxGeometry(5.0,precinctHalfY*2,1.05),roofMat,new THREE.Vector3(-precinctHalfX+2.5,0,parapetZ));
  addPrecinctElement(new THREE.BoxGeometry(5.0,eastBottomLen,1.05),roofMat,new THREE.Vector3(precinctHalfX-2.5,-precinctHalfY+eastBottomLen/2,parapetZ));
  addPrecinctElement(new THREE.BoxGeometry(5.0,eastTopLen,1.05),roofMat,new THREE.Vector3(precinctHalfX-2.5,eastGateY+eastGateHalf+eastTopLen/2,parapetZ));

  // Secondary wall pavilions visible in the reference along long parkota edges.
  const pavilionSites=[[-58,precinctHalfY-7],[0,precinctHalfY-7],[58,precinctHalfY-7],[-precinctHalfX+7,48],[-precinctHalfX+7,-48],[precinctHalfX-7,70]];
  pavilionSites.forEach(([x,y])=>{
    addPrecinctElement(new THREE.BoxGeometry(10.5,10.5,8.0),wallMat,new THREE.Vector3(x,y,7.1));
    addPrecinctElement(new THREE.CylinderGeometry(3.3,5.0,5.0,8),roofMat,new THREE.Vector3(x,y,13.6));
    addPrecinctElement(new THREE.CylinderGeometry(1.5,3.0,3.8,8),trimMat,new THREE.Vector3(x,y,18.0));
  });

  // Recessed portal rhythm. The reference identifies 44 doors; these panels
  // visually establish that repeated doorway cadence without pretending to model
  // undocumented interiors behind each opening.
  const doorMat=new THREE.MeshStandardMaterial({color:0x6f3f32,roughness:.78,metalness:.03});
  const doorGeo=new THREE.BoxGeometry(3.3,.18,4.4);
  const doorPoints=[];
  for(let i=0;i<12;i++) doorPoints.push([-82+i*15,-185.76,2.6]);
  for(let i=0;i<12;i++) doorPoints.push([-82+i*15,185.76,2.6]);
  // side walls use a rotated portal plane
  const southNorthDoors=new THREE.InstancedMesh(doorGeo,doorMat,24);
  doorPoints.forEach((v,i)=>{const m=new THREE.Matrix4().makeTranslation(...v);southNorthDoors.setMatrixAt(i,m);});
  precinctGroup.add(southNorthDoors);
  const sideDoorGeo=new THREE.BoxGeometry(.18,3.3,4.4);
  const sideDoors=new THREE.InstancedMesh(sideDoorGeo,doorMat,20);
  let di=0;
  for(let i=0;i<10;i++){let y=-135+i*30;let m=new THREE.Matrix4().makeTranslation(-115.76,y,2.6);sideDoors.setMatrixAt(di++,m);}
  for(let i=0;i<10;i++){let y=-135+i*30;if(Math.abs(y-eastGateY)<18)y+=18;let m=new THREE.Matrix4().makeTranslation(115.76,y,2.6);sideDoors.setMatrixAt(di++,m);}
  precinctGroup.add(sideDoors);

  // Landscape clusters within lawns; deliberately non-colliding to keep navigation fluid.
  const gardenTrunk=new THREE.MeshStandardMaterial({color:0x67503b,roughness:1});
  const gardenLeaf=new THREE.MeshStandardMaterial({color:0x6d884f,roughness:.98});
  const treeSpots=[[-76,-78],[-67,-20],[-82,34],[76,-76],[70,-18],[82,32],[-78,101],[-68,130],[74,103],[82,132]];
  treeSpots.forEach(([x,y],i)=>{
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.28,.42,3.2,7),gardenTrunk);trunk.position.set(x,y,1.65);trunk.castShadow=true;precinctGroup.add(trunk);
    const crown=new THREE.Mesh(new THREE.SphereGeometry(2.6+(i%3)*.4,10,8),gardenLeaf);crown.scale.z=1.3;crown.position.set(x,y,5.2);crown.castShadow=true;precinctGroup.add(crown);
  });

  // Low processional lamps on the approach and lateral courts.
  for(let i=0;i<12;i++){
    const y=-164+i*24;
    [-28,28].forEach(x=>{
      addPrecinctElement(new THREE.CylinderGeometry(.18,.24,1.2,10),trimMat,new THREE.Vector3(x,y,.62),{addCollider:false});
      const lamp=new THREE.PointLight(0xffb76a,0,8,1.8); lamp.position.set(x,y,1.45); scene.add(lamp); eveningRig.push(lamp);
    });
  }
  [-72,72].forEach(x=>{
    [-66,66].forEach(y=>{
      const lamp=new THREE.PointLight(0xffc27a,0,10,1.8);lamp.position.set(x,y,1.65);scene.add(lamp);eveningRig.push(lamp);
    });
  });

  finalizePrecinctCollider();
}

function createSacredSurroundings() {
  if (horizonGroup.userData.built) return;
  horizonGroup.userData.built = true;

  const skydome = new THREE.Mesh(
    new THREE.SphereGeometry(680, 36, 18),
    new THREE.MeshBasicMaterial({ color: 0xd8e3ef, side: THREE.BackSide, transparent: true, opacity: 0.16, fog: false })
  );
  skydome.position.z = 35;
  horizonGroup.add(skydome);
  horizonMaterials.push(skydome.material);

  const horizonBelt = new THREE.Mesh(
    new THREE.CylinderGeometry(335, 355, 18, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8b8f80, side: THREE.DoubleSide, transparent: true, opacity: 0.15, fog: false })
  );
  horizonBelt.position.z = 7;
  horizonGroup.add(horizonBelt);
  horizonMaterials.push(horizonBelt.material);

  const hillMat = new THREE.MeshStandardMaterial({ color: 0xa49e87, roughness: 1, metalness: 0 });
  for (let i = 0; i < 10; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), hillMat);
    const angle = i / 10 * Math.PI * 2 + (i % 2) * 0.08;
    const r = 268 + (i % 3) * 18;
    hill.scale.set(24 + (i % 4) * 8, 18 + (i % 5) * 6, 8 + (i % 3) * 3);
    hill.position.set(Math.cos(angle) * r, Math.sin(angle) * r, -5 + (i % 2) * 1.2);
    hill.receiveShadow = true;
    horizonGroup.add(hill);
  }

  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5f462e, roughness: 1 });
  const treeLeafMat = new THREE.MeshStandardMaterial({ color: 0x677e48, roughness: 0.98 });
  for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2 + ((i % 5) - 2) * 0.018;
    const r = 220 + (i % 7) * 11;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, 4.6, 6), treeTrunkMat);
    trunk.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 2.3);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    horizonGroup.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.8 + (i % 3) * 0.7, 8 + (i % 4), 8), treeLeafMat);
    crown.position.set(trunk.position.x, trunk.position.y, 8.2 + (i % 3) * 0.3);
    crown.castShadow = true;
    horizonGroup.add(crown);
  }
}

function createSanctumShrine() {
  if (sanctumGroup.userData.built) return;
  sanctumGroup.userData.built = true;
  // Use a lower sampling height here so we pick the Garbhgrih floor level,
  // not the upper shikhar / roof surfaces above the same x-y coordinates.
  // Sampled from the unreduced source mesh at the Garbhgrih location. Using the
  // source-floor value avoids depending on a distant streamed lower chunk during startup.
  const baseZ = 10.10723;

  const idolTex = textureLoader.load('/references/garbhgriha-idol.png');
  idolTex.colorSpace = THREE.SRGBColorSpace;
  idolTex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;

  const archShape = buildArchShape(9.6, 12.4, 4.6);
  const archGeo = new THREE.ShapeGeometry(archShape, 38);
  const archMat = new THREE.MeshStandardMaterial({ color: 0x231712, roughness: 0.74, metalness: 0.08, emissive: 0x080402 });
  const archBack = new THREE.Mesh(archGeo, archMat);
  archBack.rotation.x = Math.PI / 2;
  archBack.position.set(0, 95.2, baseZ + 5.95);
  archBack.castShadow = true;
  sanctumGroup.add(archBack);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xca9958, roughness: 0.45, metalness: 0.72, emissive: 0x2b1605, emissiveIntensity: 0.16 });
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 9.2), frameMat);
  const sideR = sideL.clone();
  sideL.position.set(-4.95, 95.0, baseZ + 5.0);
  sideR.position.set(4.95, 95.0, baseZ + 5.0);
  sanctumGroup.add(sideL, sideR);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.24, 0.46), frameMat);
  sill.position.set(0, 95.0, baseZ + 0.48);
  sanctumGroup.add(sill);

  sanctumPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(8.7, 11.3),
    new THREE.MeshStandardMaterial({ map: idolTex, side: THREE.DoubleSide, roughness: 0.88, metalness: 0.02, emissive: 0x2b1907, emissiveIntensity: 0.22 })
  );
  sanctumPanel.rotation.x = Math.PI / 2;
  sanctumPanel.position.set(0, 94.8, baseZ + 5.8);
  sanctumPanel.castShadow = false;
  sanctumPanel.receiveShadow = true;
  sanctumGroup.add(sanctumPanel);

  const dais = new THREE.Mesh(new THREE.BoxGeometry(10.2, 3.2, 1.4), frameMat);
  dais.position.set(0, 93.0, baseZ + 0.72);
  dais.castShadow = true;
  dais.receiveShadow = true;
  sanctumGroup.add(dais);

  sanctumGlow = new THREE.PointLight(0xffc86c, 6.8, 28, 1.6);
  sanctumGlow.position.set(0, 89.2, baseZ + 7.8);
  sanctumGroup.add(sanctumGlow);
  const sanctumFill = new THREE.SpotLight(0xffe0b0, 12, 34, Math.PI / 5.5, 0.6, 1.3);
  sanctumFill.position.set(0, 74, baseZ + 14);
  sanctumFill.target.position.set(0, 94.8, baseZ + 6);
  sanctumFill.castShadow = false;
  sanctumGroup.add(sanctumFill, sanctumFill.target);

  [-3.8, 3.8].forEach(x => {
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, 1.5, 10), frameMat);
    lampStem.position.set(x, 92.9, baseZ + 0.8);
    sanctumGroup.add(lampStem);
    const lampCup = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), frameMat);
    lampCup.scale.y = 0.55;
    lampCup.position.set(x, 92.9, baseZ + 1.58);
    sanctumGroup.add(lampCup);
    const flame = new THREE.Sprite(flameMat.clone());
    flame.position.set(x, 92.9, baseZ + 2.0);
    flame.scale.set(0.45, 0.72, 0.45);
    sanctumGroup.add(flame);
    diyaSprites.push(flame);
  });
}
// Small diya-like perimeter lights for atmosphere.
const flameMat = new THREE.SpriteMaterial({ color: 0xffb04e, transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false });
for (let i=0;i<30;i++) {
  const t=i/29, x=(i%2? 1:-1)*(47 + (i%3)*4), y=-95+t*170;
  const s=new THREE.Sprite(flameMat.clone()); s.position.set(x,y,1.15); s.scale.set(.38,.6,.38); scene.add(s); diyaSprites.push(s);
}

// Initialize time-dependent environment only after all dependent scene objects exist.
setTimeOfDay(8);

// --- Original full-fidelity temple + collision ---------------------------------
// The original STL is loaded as a single intact mesh. No reduction, chunking,
// spatial streaming or visibility slicing is used in this build. The same intact
// geometry also carries the BVH used for collision and floor queries.
let temple = null;
let collider = null;
const loading = document.querySelector('#loading');
const progressBar = document.querySelector('#progressBar');
const progressText = document.querySelector('#progressText');
const stl = new STLLoader();
let visualReady = false;
let collisionReady = false;
let modelBytesReceived = 0;
let modelProgressAt = performance.now();
let modelLoadStartedAt = performance.now();
let modelLoadFinished = false;

function formatMB(bytes){
  return (bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 1 : 2);
}

function setModelLoadMessage(message, pct = null){
  if (pct != null) progressBar.style.width = `${THREE.MathUtils.clamp(pct, 2, 100)}%`;
  progressText.textContent = message;
}

const templeMaterial = new THREE.MeshStandardMaterial({
  color: 0xdda998,
  roughness: .88,
  metalness: .015,
  side: THREE.DoubleSide,
});

// Compatibility stubs retained so the rest of the experience does not need any
// streaming-specific branches. They intentionally do nothing.
const streamState = { initialized:true, allLoaded:true, updateQueued:false, chunks:new Map(), manifest:null };
function collisionStreamIds(){ return new Set(); }
async function applyTempleStreaming(){ return true; }
async function ensureAllTempleChunks(){ return true; }
function updateTempleStreaming(){}

let sceneFinalizationStarted=false;
function finishTempleLoad() {
  if (!visualReady || !collisionReady || sceneFinalizationStarted) return;
  sceneFinalizationStarted=true;
  createTemplePrecinct();
  createSacredSurroundings();
  createSanctumShrine();
  createHotspots();
  createZoneBillboards();
  createAtmosphere();
  placePlayerAtEntrance();
  setModelLoadMessage('Mapping human-navigable surfaces…', 91);

  // Let the loader paint the navigation-mapping stage before the connected-space
  // analysis performs its CPU work.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    buildNavigationSurface();
    createLocationMarkers();
    updateTempleZone(true);
    updateWalkCamera(true);
    modelLoadFinished = true;
    progressBar.classList.remove('host-wait');
    progressBar.style.width = '100%';
    progressText.textContent = navigationSurface.ready
      ? `Ready · ${navigationSurface.nodes.length} navigable cells mapped`
      : 'Ready · navigation markers unavailable';

    document.body.classList.remove('app-loading');
    document.body.classList.add('app-ready');
    loading.style.pointerEvents = 'none';
    loading.style.opacity = '0';
    loading.style.visibility = 'hidden';
    loading.classList.add('done');
    setTimeout(() => { if (loading) loading.style.display = 'none'; }, 900);

    const entry = document.querySelector('#enterOverlay');
    if (entry) {
      entry.classList.remove('hidden');
      entry.style.display = '';
      entry.style.visibility = 'visible';
      entry.style.opacity = '1';
      entry.style.pointerEvents = 'auto';
    }
  }));
}

const MODEL_URL = '/models/ram-temple-full.stl';

async function preflightTempleModel(){
  try{
    const response = await fetch(MODEL_URL, { method:'HEAD', cache:'no-store' });
    if(!response.ok){
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const size = Number(response.headers.get('content-length')) || 0;
    if(size){
      setModelLoadMessage(`Temple file available · ${formatMB(size)} MB · starting download…`, 3);
    }else{
      setModelLoadMessage('Temple file available · host is streaming the model…', 3);
      progressBar.classList.add('host-wait');
    }
    return true;
  }catch(error){
    console.error('Temple model preflight failed:', error);
    progressBar.classList.add('load-error');
    progressText.innerHTML = `Temple model is not reachable on this host. Check <code>${MODEL_URL}</code>.`;
    return false;
  }
}

async function loadOriginalTemple(){
  modelLoadStartedAt = performance.now();
  modelProgressAt = modelLoadStartedAt;
  modelBytesReceived = 0;
  modelLoadFinished = false;

  const reachable = await preflightTempleModel();
  if(!reachable) return;

  stl.load(MODEL_URL, geometry => {
    modelLoadFinished = true;
    progressBar.classList.remove('host-wait');
    setModelLoadMessage('Preparing full-detail collision map…', 78);

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    setModelLoadMessage('Temple received · building collision map…', 84);
    geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: 72, strategy: 0 });

    temple = new THREE.Mesh(geometry, templeMaterial);
    temple.name = 'Original Full Detail Ram Temple';
    temple.castShadow = false;
    temple.receiveShadow = true;
    temple.frustumCulled = true;
    scene.add(temple);
    collider = temple;
    visualReady = true;
    collisionReady = true;
    finishTempleLoad();
  }, xhr => {
    modelProgressAt = performance.now();
    modelBytesReceived = xhr.loaded || modelBytesReceived;
    const mb = formatMB(modelBytesReceived);

    if(xhr.lengthComputable && xhr.total > 0){
      progressBar.classList.remove('host-wait');
      const pct = Math.min(74, Math.max(3, (xhr.loaded / xhr.total) * 74));
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `Original temple ${Math.round(xhr.loaded / xhr.total * 100)}% · ${mb} MB received`;
    }else{
      progressBar.classList.add('host-wait');
      const visualPct = Math.min(68, 8 + Math.log2(1 + modelBytesReceived / (1024 * 1024)) * 9);
      progressBar.style.width = `${visualPct}%`;
      progressText.textContent = `Receiving original temple · ${mb} MB received`;
    }
  }, err => {
    modelLoadFinished = true;
    progressBar.classList.remove('host-wait');
    progressBar.classList.add('load-error');
    console.error('Original temple load failed:', err);
    progressText.innerHTML = `Original temple could not be loaded. Verify <code>${MODEL_URL}</code> is published by the host.`;
  });
}

loadOriginalTemple();

setInterval(() => {
  if(modelLoadFinished) return;
  const now = performance.now();
  const quietFor = (now - modelProgressAt) / 1000;
  const elapsed = (now - modelLoadStartedAt) / 1000;

  if(modelBytesReceived === 0 && quietFor > 20){
    progressBar.classList.add('host-wait');
    progressText.textContent = elapsed > 60
      ? 'Still waiting for the temple file from the host…'
      : 'Waiting for the host to start sending the temple model…';
  }else if(modelBytesReceived > 0 && quietFor > 15){
    progressText.textContent = `Host paused temporarily · ${formatMB(modelBytesReceived)} MB received`;
  }
}, 3000);

// --- Player capsule ------------------------------------------------------------
const player = {
  radius: .42,
  height: 1.72,
  velocity: new THREE.Vector3(),
  position: new THREE.Vector3(0,-108,2.2),
  onGround: false,
  speed: 4.0,
};

const capsule = {
  start: new THREE.Vector3(),
  end: new THREE.Vector3(),
  radius: player.radius
};
const tempBox = new THREE.Box3();
const tempMat = new THREE.Matrix4();
const tempSegment = new THREE.Line3();
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempTriPoint = new THREE.Vector3();
const up = new THREE.Vector3(0,0,1);

function syncCapsule() {
  capsule.start.set(player.position.x, player.position.y, player.position.z + player.radius);
  capsule.end.set(player.position.x, player.position.y, player.position.z + player.height - player.radius);
}

function resolveCapsuleAgainstMesh(mesh) {
  if (!mesh?.geometry?.boundsTree) return new THREE.Vector3();
  syncCapsule();
  tempMat.copy(mesh.matrixWorld).invert();
  tempSegment.start.copy(capsule.start).applyMatrix4(tempMat);
  tempSegment.end.copy(capsule.end).applyMatrix4(tempMat);

  tempBox.makeEmpty();
  tempBox.expandByPoint(tempSegment.start);
  tempBox.expandByPoint(tempSegment.end);
  tempBox.min.addScalar(-capsule.radius);
  tempBox.max.addScalar(capsule.radius);

  mesh.geometry.boundsTree.shapecast({
    intersectsBounds: box => box.intersectsBox(tempBox),
    intersectsTriangle: tri => {
      const triPoint = tempTriPoint;
      const capsulePoint = tempVec;
      const dist = tri.closestPointToSegment(tempSegment, triPoint, capsulePoint);
      if (dist < capsule.radius) {
        const depth = capsule.radius - dist;
        const direction = capsulePoint.sub(triPoint).normalize();
        if (!Number.isFinite(direction.x)) return;
        tempSegment.start.addScaledVector(direction, depth);
        tempSegment.end.addScaledVector(direction, depth);
        if (direction.z > .38) player.onGround = true;
      }
    }
  });

  const corrected = tempSegment.start.clone().applyMatrix4(mesh.matrixWorld);
  corrected.z -= player.radius;
  const delta = corrected.sub(player.position);
  player.position.add(delta);
  return delta;
}

function loadedCollisionMeshes() {
  return collider?.geometry?.boundsTree ? [collider] : [];
}

function resolveCapsuleCollisions() {
  player.onGround = false;
  let strongest = new THREE.Vector3();
  for (const mesh of loadedCollisionMeshes()) {
    const delta = resolveCapsuleAgainstMesh(mesh);
    if (delta.lengthSq() > strongest.lengthSq()) strongest.copy(delta);
  }
  const deltaPrecinct = resolveCapsuleAgainstMesh(precinctCollider);
  if (deltaPrecinct.lengthSq() > strongest.lengthSq()) strongest.copy(deltaPrecinct);
  if (strongest.z > Math.abs(strongest.x) + Math.abs(strongest.y) && player.velocity.z < 0) player.velocity.z = 0;
}

function groundHeightAt(x,y, top=140) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x,y,top), new THREE.Vector3(0,0,-1), 0, 260);
  ray.firstHitOnly = true;
  let maxZ = -Infinity;
  [collider, precinctCollider].forEach(mesh => {
    if (!mesh) return;
    const hit = ray.intersectObject(mesh,false)[0];
    if (hit && hit.point.z > maxZ) maxZ = hit.point.z;
  });
  return Number.isFinite(maxZ) ? maxZ : 0;
}


function placePlayerAtEntrance() {
  const z = groundHeightAt(0,-108,130);
  player.position.set(0,-108,z+.08);
  updateWalkCamera(true);
}


// --- Navigation-aware temple zoning ------------------------------------------
const zoneState = {
  active: null,
  entered: new Set(),
  lastNarrated: null,
  bannerTimer: null,
};
const zoneBillboards = [];

const templeZones = [
  {
    id:'sacred-core', name:'Sacred Core', kicker:'Antarala & Sanctum', priority:100,
    contains:p=>Math.abs(p.x)<17 && p.y>=79 && p.y<=110,
    prompt:'Reduce pace · contemplative zone', center:[0,93],
    body:'You have reached the most inward zone of the walkthrough. Interface activity is deliberately subdued here so architectural focus and contemplative attention take precedence over spectacle.',
    narration:'You are entering the sacred core. Allow the pace to slow. Notice how the long processional axis resolves into a more concentrated and contemplative spatial experience.',
    meta:'Sacred core · quiet interpretation · verified ritual or iconographic content can be attached here.',
    light:{lightBoost:1.2, exposureBoost:-.04, fogFactor:.86, accent:0xffb85a, accentIntensity:22},
    audio:{freq:[130.81,196,261.63], gain:.034},
    boards:[['Sacred Core',0,96],['Contemplative Zone',15,84]]
  },
  {
    id:'sanctum-approach', name:'Sanctum Approach', kicker:'Darshan Axis', priority:90,
    contains:p=>Math.abs(p.x)<23 && p.y>=55 && p.y<79,
    prompt:'Follow the central axis toward darshan', center:[0,68],
    body:'The approach toward the sanctum progressively narrows attention. Lighting becomes warmer and spatial interpretation quieter, reinforcing the movement from assembly toward darshan.',
    narration:'This is the sanctum approach. The architecture now gathers movement and attention toward the inner sacred centre. Continue along the axis with a slower, more deliberate pace.',
    meta:'Sanctum approach · axial movement · warm emphasis lighting.',
    light:{lightBoost:1.16, exposureBoost:.01, fogFactor:.9, accent:0xffa63d, accentIntensity:19},
    audio:{freq:[146.83,220,293.66], gain:.04},
    boards:[['Toward Darshan',0,67],['Sacred Axis',18,59]]
  },
  {
    id:'pradakshina-east', name:'Pradakshina Path · East', kicker:'Circumambulatory Movement', priority:82,
    contains:p=>p.x>20 && p.x<52 && p.y>=-8 && p.y<76,
    prompt:'Continue in a calm circumambulatory rhythm', center:[33,33],
    body:'This lateral movement is interpreted as a pradakshina-oriented route around the inner temple mass. The experience shifts from frontal progression to circumambulatory movement and changing views of the architecture.',
    narration:'You have moved into the eastern circumambulatory path. Here the experience becomes less frontal and more cyclical, revealing the temple through changing angles as you move around its inner mass.',
    meta:'Pradakshina zone · peripheral circulation · changing architectural views.',
    light:{lightBoost:1.08, exposureBoost:.025, fogFactor:.96, accent:0xffc46b, accentIntensity:14},
    audio:{freq:[174.61,220,349.23], gain:.038},
    boards:[['Pradakshina Path',34,28],['Circumambulatory View',36,58]]
  },
  {
    id:'pradakshina-west', name:'Pradakshina Path · West', kicker:'Circumambulatory Movement', priority:82,
    contains:p=>p.x<-20 && p.x>-52 && p.y>=-8 && p.y<76,
    prompt:'Continue in a calm circumambulatory rhythm', center:[-33,33],
    body:'This lateral route supports circumambulatory exploration. The spatial emphasis changes from the principal front-to-back axis to repeated framed views between pillars, walls and temple projections.',
    narration:'You have moved into the western circumambulatory path. Observe how pillars and projections repeatedly frame the temple as your viewpoint changes around the inner structure.',
    meta:'Pradakshina zone · peripheral circulation · framed views.',
    light:{lightBoost:1.08, exposureBoost:.025, fogFactor:.96, accent:0xffc46b, accentIntensity:14},
    audio:{freq:[174.61,220,349.23], gain:.038},
    boards:[['Pradakshina Path',-34,28],['Framed Temple Views',-36,58]]
  },
  {
    id:'inner-hall', name:'Inner Hall', kicker:'Transition', priority:74,
    contains:p=>Math.abs(p.x)<=22 && p.y>=10 && p.y<55,
    prompt:'The spatial rhythm is becoming more inward', center:[0,33],
    body:'This inner hall continues the central sequence while reducing the perceptual distance to the sacred core. Pillars, openings and light gradients reinforce a more focused inward movement.',
    narration:'You are now in the inner hall. The architectural rhythm is becoming more concentrated, and the sequence ahead begins to feel increasingly inward and focused.',
    meta:'Inner hall · transition toward the sanctum approach.',
    light:{lightBoost:1.11, exposureBoost:.02, fogFactor:.94, accent:0xffad4a, accentIntensity:16},
    audio:{freq:[146.83,196,293.66], gain:.041},
    boards:[['Inner Hall',0,30],['Axis of Attention',15,44]]
  },
  {
    id:'mandapa-east', name:'Eastern Pillared Hall', kicker:'Mandapa Edge', priority:68,
    contains:p=>p.x>17 && p.x<=45 && p.y>=-48 && p.y<10,
    prompt:'Explore the pillar rhythm and lateral bays', center:[29,-18],
    body:'The eastern side of the mandapa reveals the hall through lateral bays and column rhythms. Navigation remains collision-aware around individual pillars and projections.',
    narration:'You are entering the eastern pillared hall. Notice how the repeating columns establish rhythm, depth and changing frames rather than a single uninterrupted room.',
    meta:'Mandapa side hall · column rhythm · collision-aware exploration.',
    light:{lightBoost:1.06, exposureBoost:.035, fogFactor:1, accent:0xffca72, accentIntensity:12},
    audio:{freq:[164.81,220,329.63], gain:.043},
    boards:[['Eastern Pillared Hall',29,-18],['Column Rhythm',38,-2]]
  },
  {
    id:'mandapa-west', name:'Western Pillared Hall', kicker:'Mandapa Edge', priority:68,
    contains:p=>p.x<-17 && p.x>=-45 && p.y>=-48 && p.y<10,
    prompt:'Explore the pillar rhythm and lateral bays', center:[-29,-18],
    body:'The western side of the mandapa provides a lateral reading of the pillared structure. Repeated columns create depth, rhythm and alternating areas of shadow and warm light.',
    narration:'You are entering the western pillared hall. The temple is now experienced laterally through repeated columns, alternating light, and a succession of framed spaces.',
    meta:'Mandapa side hall · layered columns · changing light.',
    light:{lightBoost:1.06, exposureBoost:.035, fogFactor:1, accent:0xffca72, accentIntensity:12},
    audio:{freq:[164.81,220,329.63], gain:.043},
    boards:[['Western Pillared Hall',-29,-18],['Layered Columns',-38,-2]]
  },
  {
    id:'mandapa', name:'Main Mandapa', kicker:'Assembly & Pillared Space', priority:62,
    contains:p=>Math.abs(p.x)<=22 && p.y>=-48 && p.y<10,
    prompt:'Move through the central pillared hall', center:[0,-20],
    body:'The mandapa is experienced as a spacious pillared gathering zone. The walkthrough emphasizes depth through column rhythm while retaining a clear visual relationship with the temple’s principal axis.',
    narration:'You are entering the main mandapa, the pillared gathering space. Notice the rhythm of columns and the way the central axis remains legible through a much broader hall.',
    meta:'Main mandapa · assembly space · principal axis remains visible.',
    light:{lightBoost:1.08, exposureBoost:.04, fogFactor:1, accent:0xffc870, accentIntensity:13},
    audio:{freq:[146.83,220,293.66], gain:.046},
    boards:[['Main Mandapa',0,-20],['Pillared Assembly',14,-5]]
  },
  {
    id:'entrance-platform', name:'Entrance Platform', kicker:'Raised Threshold', priority:54,
    contains:p=>Math.abs(p.x)<34 && p.y>=-68 && p.y<-48,
    prompt:'Pause and read the rising temple elevation', center:[0,-58],
    body:'The entrance platform establishes elevation and pause before the larger hall sequence. From here the visitor can read the temple mass, stairs, pillars and principal entrance as a composed threshold.',
    narration:'You have reached the entrance platform. This raised level creates a moment of pause before the larger hall sequence and gives the temple a stronger sense of elevation and threshold.',
    meta:'Entrance platform · raised datum · transition into mandapa.',
    light:{lightBoost:1.04, exposureBoost:.045, fogFactor:1.02, accent:0xffbd60, accentIntensity:12},
    audio:{freq:[130.81,196,293.66], gain:.044},
    boards:[['Entrance Platform',0,-57],['Raised Threshold',24,-54]]
  },
  {
    id:'main-stairs', name:'Main Staircase', kicker:'Ascent', priority:50,
    contains:p=>Math.abs(p.x)<26 && p.y>=-88 && p.y<-68,
    prompt:'Ascend toward the principal threshold', center:[0,-77],
    body:'The staircase converts horizontal approach into vertical ascent. Collision-aware step assistance allows the visitor to negotiate the modelled risers while retaining the sense of architectural elevation.',
    narration:'You are at the main staircase. The journey now changes from approach to ascent, marking a physical and symbolic transition toward the principal threshold.',
    meta:'Main staircase · vertical transition · assisted stair traversal.',
    light:{lightBoost:1.05, exposureBoost:.05, fogFactor:1.03, accent:0xffa43a, accentIntensity:15},
    audio:{freq:[130.81,174.61,261.63], gain:.046},
    boards:[['Sacred Ascent',0,-77],['Main Staircase',18,-73]]
  },
  {
    id:'approach', name:'Temple Approach', kicker:'Orientation', priority:10,
    contains:p=>p.y<-68 || Math.abs(p.x)>=45,
    prompt:'Align with the principal axis and proceed inward', center:[0,-101],
    body:'The outer approach establishes orientation before entry. The temple is read as a distant whole, with the axial path gradually becoming the dominant guide for movement.',
    narration:'Welcome to the temple approach. Begin by aligning with the principal axis. As you move inward, the experience will gradually shift from orientation to threshold, assembly, procession and contemplation.',
    meta:'Outer approach · orientation · beginning of the digital pilgrimage.',
    light:{lightBoost:1, exposureBoost:0, fogFactor:1.08, accent:0xff9a34, accentIntensity:9},
    audio:{freq:[130.81,196,261.63], gain:.038},
    boards:[['Temple Approach',0,-101],['Principal Axis',26,-91]]
  }
];

function zoneAt(position) {
  let best = null;
  for (const z of templeZones) {
    if (z.contains(position) && (!best || z.priority > best.priority)) best = z;
  }
  return best || templeZones[templeZones.length - 1];
}

function createZoneBillboards() {
  templeZones.forEach(zone => {
    (zone.boards || []).forEach(([text,x,y]) => {
      const el = document.createElement('div');
      el.className = 'billboard';
      el.textContent = text;
      const obj = new CSS2DObject(el);
      obj.position.set(x, y, groundHeightAt(x,y,140) + 2.4);
      obj.visible = false;
      obj.userData.zoneId = zone.id;
      scene.add(obj);
      zoneBillboards.push(obj);
    });
  });
}

function showZoneBanner(zone) {
  const banner = document.querySelector('#zoneBanner');
  document.querySelector('#zoneKicker').textContent = zone.kicker;
  document.querySelector('#zoneName').textContent = zone.name;
  document.querySelector('#zonePrompt').textContent = zone.prompt;
  banner.classList.add('show');
  clearTimeout(zoneState.bannerTimer);
  zoneState.bannerTimer = setTimeout(() => banner.classList.remove('show'), 4300);
}

function updateZoneInfo(zone) {
  document.querySelector('#infoKicker').textContent = zone.kicker;
  document.querySelector('#infoTitle').textContent = zone.name;
  document.querySelector('#infoBody').textContent = zone.body;
  document.querySelector('#infoMeta').textContent = zone.meta;
  if(!experience?.silence && !experience?.sacredFocus) document.querySelector('#infoPanel').classList.add('open');
}

function applyZoneVisuals(zone) {
  currentZoneProfile = zone.light;
  const [x,y] = zone.center;
  zoneAccentLight.position.set(x, y, groundHeightAt(x,y,140) + 5.5);
  setTimeOfDay(hour);
  zoneBillboards.forEach(obj => {
    const active = obj.userData.zoneId === zone.id;
    obj.visible = active && !experience?.sacredFocus && !experience?.silence;
    obj.element?.classList.toggle('zone-active', active);
  });
}

function narrateZone(zone, force=false) {
  if (!soundOn || experience?.silence || !('speechSynthesis' in window)) return;
  if (!force && zoneState.lastNarrated === `${zone.id}-${experience?.language||'en'}`) return;
  window.speechSynthesis.cancel();
  const hindi = zoneHindi?.[zone.id];
  const useHindi = experience?.language === 'hi' && hindi;
  const utterance = new SpeechSynthesisUtterance(useHindi ? hindi : zone.narration);
  utterance.rate = useHindi ? .82 : .88;
  utterance.pitch = .9;
  utterance.volume = experience?.sacredFocus ? .48 : .68;
  utterance.lang = useHindi ? 'hi-IN' : 'en-IN';
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => new RegExp(useHindi?'hi-IN':'en-IN','i').test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
  zoneState.lastNarrated = `${zone.id}-${experience?.language||'en'}`;
}

function retuneAmbient(zone) {
  if (!audioRig) return;
  const now = audioCtx.currentTime;
  zone.audio.freq.forEach((f,i) => audioRig.oscillators[i].frequency.setTargetAtTime(f, now, .8));
  audioRig.musicBus.gain.setTargetAtTime(soundOn && !experience?.silence ? zone.audio.gain : 0, now, .7);
}

function enterZone(zone, forceNarration=false) {
  const previous = zoneState.active;
  zoneState.active = zone;
  zoneState.entered.add(zone.id);
  if(!experience?.silence && !experience?.pilgrimage) showZoneBanner(zone);
  updateZoneInfo(zone);
  applyZoneVisuals(zone);
  applySacredFocus();
  updateJourneyStage();
  refreshGuide();
  retuneAmbient(zone);
  updateRitualEnvironment();
  const enteredExperience = document.querySelector('#enterOverlay').classList.contains('hidden');
  if (enteredExperience) {
    narrateZone(zone, forceNarration);
    if(previous?.id !== zone.id) playZoneChime(zone);
  }
}

function updateTempleZone(force=false) {
  if (mode !== 'walk' || !collisionReady) return;
  const next = zoneAt(player.position);
  if (force || zoneState.active?.id !== next.id) enterZone(next, force);
}


// --- Spiritual experience orchestration --------------------------------------
const experience = {
  pilgrimage: false,
  silence: false,
  language: 'en',
  stageIndex: 0,
  sacredFocus: false,
  coreVisited: false,
  exitReflectionShown: false,
  stillTime: 0,
  stillTriggeredFor: null,
  lastPosition: new THREE.Vector3(),
  pradakshinaIndex: 0,
  pradakshinaAngle: null,
  pradakshinaTravel: 0,
  pradakshinaComplete: false,
};

const pilgrimageStages = [
  {name:'Arrival', cue:'Orient yourself toward the temple', zones:['approach']},
  {name:'Threshold', cue:'Pause before crossing into the sacred precinct', zones:['main-stairs']},
  {name:'Ascent', cue:'Rise toward the entrance platform', zones:['entrance-platform']},
  {name:'Mandapa', cue:'Enter the pillared gathering space', zones:['mandapa','mandapa-east','mandapa-west']},
  {name:'Circumambulation', cue:'Move calmly around the inner temple mass', zones:['pradakshina-east','pradakshina-west']},
  {name:'Sanctum Approach', cue:'Let the pace and interface become quieter', zones:['inner-hall','sanctum-approach']},
  {name:'Darshan', cue:'Allow attention to settle toward the sacred centre', zones:['sacred-core']},
  {name:'Quiet Reflection', cue:'Carry the stillness back toward the outer world', zones:[]},
];

const zoneHindi = {
  approach:'मंदिर के बाहरी मार्ग में आपका स्वागत है। मुख्य अक्ष की ओर उन्मुख होकर धीरे-धीरे आगे बढ़ें।',
  'main-stairs':'आप मुख्य सीढ़ियों पर हैं। यह यात्रा अब आगमन से आरोहण की ओर बढ़ती है।',
  'entrance-platform':'आप प्रवेश मंच पर पहुँचे हैं। भीतर बढ़ने से पहले एक क्षण रुककर मंदिर की ऊँचाई और द्वार को देखें।',
  mandapa:'आप मुख्य मंडप में प्रवेश कर रहे हैं। स्तंभों की लय और मंदिर के केंद्रीय अक्ष को अनुभव करें।',
  'mandapa-east':'पूर्वी स्तंभित भाग में स्तंभों की पुनरावृत्ति, गहराई और बदलते दृष्टिकोण को देखें।',
  'mandapa-west':'पश्चिमी स्तंभित भाग में प्रकाश, छाया और स्तंभों से बनते क्रमिक दृश्यों को देखें।',
  'inner-hall':'आप भीतरी मंडप में हैं। आगे बढ़ते हुए स्थान अधिक केंद्रित और शांत होता जाता है।',
  'pradakshina-east':'आप पूर्वी परिक्रमा मार्ग में हैं। शांत गति से आगे बढ़ते हुए मंदिर के बदलते रूपों को देखें।',
  'pradakshina-west':'आप पश्चिमी परिक्रमा मार्ग में हैं। बदलते कोणों से मंदिर की संरचना को अनुभव करें।',
  'sanctum-approach':'यह गर्भगृह की ओर जाने वाला मार्ग है। गति धीमी रखें और ध्यान को भीतर की ओर आने दें।',
  'sacred-core':'आप पवित्र केंद्र के निकट हैं। कुछ क्षण शांत रहें और अपने ध्यान को स्थिर होने दें।'
};

function setPilgrimage(enabled) {
  experience.pilgrimage = enabled;
  document.querySelector('#pilgrimageBtn')?.classList.toggle('active', enabled);
  document.querySelector('#journeyProgress')?.classList.toggle('hidden', !enabled);
  if(!enabled) journeyGuideLight.intensity=0;
  if (enabled) {
    experience.stageIndex = 0;
    experience.pradakshinaIndex = 0;
    experience.pradakshinaAngle = null;
    experience.pradakshinaTravel = 0;
    experience.pradakshinaComplete = false;
    experience.exitReflectionShown = false;
    updateJourneyStage(true);
  }
}

function zoneStageIndex(zoneId) {
  return pilgrimageStages.findIndex(s => s.zones.includes(zoneId));
}
function updateJourneyStage(force=false) {
  if (!experience.pilgrimage || !zoneState.active) return;
  let idx = zoneStageIndex(zoneState.active.id);
  if (idx < 0) idx = experience.stageIndex;
  // Circumambulation is meaningful but never becomes a hard gate.
  if (idx >= 5 && !experience.pradakshinaComplete && experience.stageIndex === 4) idx = 5;
  if (idx > experience.stageIndex || force) experience.stageIndex = Math.max(experience.stageIndex, idx);
  const stage = pilgrimageStages[Math.min(experience.stageIndex, pilgrimageStages.length-1)];
  document.querySelector('#journeyStageNo').textContent = `${Math.min(experience.stageIndex+1,8)} / 8`;
  document.querySelector('#journeyStage').textContent = stage.name;
  document.querySelector('#journeyCue').textContent = stage.cue;
  document.querySelector('#journeyLine').style.width = `${(Math.min(experience.stageIndex,7)/7)*100}%`;
  const targetStage=pilgrimageStages[Math.min(experience.stageIndex+1,6)];
  const targetZone=templeZones.find(z=>targetStage?.zones?.includes(z.id));
  if(targetZone){const [x,y]=targetZone.center;journeyGuideLight.position.set(x,y,groundHeightAt(x,y,140)+4);journeyGuideLight.intensity=experience.pilgrimage&&!experience.sacredFocus?7:0;}
}

function applySacredFocus() {
  const focus = zoneState.active && ['sanctum-approach','sacred-core'].includes(zoneState.active.id);
  if (experience.sacredFocus === focus) return;
  experience.sacredFocus = focus;
  sacredFocusFactor = focus ? .58 : 1;
  document.body.classList.toggle('sacred-focus', focus && !experience.silence);
  if (focus) {
    document.querySelector('#infoPanel')?.classList.remove('open');
    hotspotGroup.visible = false;
    zoneBillboards.forEach(b=>b.visible=false);
  } else {
    hotspotGroup.visible = true;
    if(zoneState.active) applyZoneVisuals(zoneState.active);
  }
  setTimeOfDay(hour);
}

function setSilenceMode(on) {
  experience.silence = on;
  document.body.classList.toggle('silence-mode', on);
  document.querySelector('#silenceBtn')?.classList.toggle('active', on);
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (audioRig) {
    const now=audioCtx.currentTime;
    audioRig.musicBus.gain.setTargetAtTime(on ? 0 : (soundOn ? (zoneState.active?.audio.gain || .04) : 0), now, .6);
    audioRig.master.gain.setTargetAtTime(soundOn ? (on ? .42 : 1) : 0, now, .5);
  }
}

function toggleLanguage(){
  experience.language = experience.language === 'en' ? 'hi' : 'en';
  document.querySelector('#languageBtn').textContent = experience.language === 'en' ? 'EN' : 'हिं';
  if(zoneState.active && soundOn && !experience.silence) narrateZone(zoneState.active,true);
}

function updatePradakshina() {
  const status=document.querySelector('#pradakshinaStatus');
  const dx=player.position.x, dy=player.position.y-34;
  const radius=Math.hypot(dx,dy);
  const inRing=player.position.y>-8 && player.position.y<80 && radius>22 && radius<57;
  status?.classList.toggle('show', inRing && !experience.silence);
  if (!inRing || experience.pradakshinaComplete) { experience.pradakshinaAngle=null; return; }
  const angle=Math.atan2(dy,dx);
  if(experience.pradakshinaAngle!=null){
    let d=angle-experience.pradakshinaAngle;
    while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2;
    // Opposite motion naturally cancels, so random back-and-forth does not count as a lap.
    if(Math.abs(d)<.35) experience.pradakshinaTravel+=d;
  }
  experience.pradakshinaAngle=angle;
  const quarters=Math.min(4,Math.floor(Math.abs(experience.pradakshinaTravel)/(Math.PI*2)*4+.12));
  experience.pradakshinaIndex=quarters;
  if(status) status.querySelector('span').textContent=`${quarters} / 4`;
  if(Math.abs(experience.pradakshinaTravel)>=Math.PI*2*.86){
    experience.pradakshinaComplete=true;
    if(experience.pilgrimage) experience.stageIndex=Math.max(experience.stageIndex,5);
    if(!experience.silence) playGentleBell(new THREE.Vector3(0,32,8), .55);
    showReflection('The circumambulatory movement is complete. Pause briefly before continuing inward.','A quiet acknowledgement — no score, no achievement.');
  }
}

const reflectionThoughts = {
  'entrance-platform':'A threshold is not only crossed with the feet; it can also mark a change in attention.',
  mandapa:'Notice the rhythm between columns, light and empty space. Let the architecture set the pace.',
  'inner-hall':'As the space becomes more inward, allow the need for information to become less important.',
  'sanctum-approach':'Remain still. Let the central axis gather the eye before moving again.',
  'sacred-core':'No further instruction is necessary here. Let the space hold your attention for a moment.'
};
function showReflection(text, meta='Contemplative pause') {
  const el=document.querySelector('#reflectionVerse');
  if(!el || experience.silence) return;
  el.innerHTML=`${text}<small>${meta}</small>`;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer=setTimeout(()=>el.classList.remove('show'),6500);
}
function updateStillness(dt) {
  if(!walkEngaged || mode!=='walk') return;
  const moved=experience.lastPosition.distanceTo(player.position);
  experience.lastPosition.copy(player.position);
  const eligible=reflectionThoughts[zoneState.active?.id];
  if(moved<.008 && eligible && !experience.silence){
    experience.stillTime+=dt;
    document.querySelector('#stillnessPrompt')?.classList.toggle('show',experience.stillTime>5 && experience.stillTime<9);
    if(experience.stillTime>9 && experience.stillTriggeredFor!==zoneState.active.id){
      experience.stillTriggeredFor=zoneState.active.id;
      showReflection(eligible,'Stillness is an interaction');
    }
  }else{
    experience.stillTime=0;
    document.querySelector('#stillnessPrompt')?.classList.remove('show');
    if(moved>.05) experience.stillTriggeredFor=null;
  }
}

function updateExitJourney() {
  if(zoneState.active?.id==='sacred-core') experience.coreVisited=true;
  if(experience.pilgrimage && experience.coreVisited && !experience.exitReflectionShown && player.position.y<58){
    experience.exitReflectionShown=true;
    experience.stageIndex=7; updateJourneyStage(true);
    document.querySelector('#exitReflection')?.classList.remove('hidden');
  }
}

// Communicate a sacred threshold without an invisible collision wall.
const sacredBoundaryGroup=new THREE.Group(); scene.add(sacredBoundaryGroup);
function createSacredBoundary(){
  const mat=new THREE.MeshStandardMaterial({color:0xc78640,emissive:0x7a3610,emissiveIntensity:.6,roughness:.5,transparent:true,opacity:.72});
  [-19,19].forEach(x=>{
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.16,.21,1.15,12),mat); post.rotation.x=Math.PI/2; post.position.set(x,78,groundHeightAt(x,78,140)+.55); sacredBoundaryGroup.add(post);
    const lamp=new THREE.PointLight(0xffb451,8,10,1.8); lamp.position.set(x,78,post.position.z+1); sacredBoundaryGroup.add(lamp);
  });
  const line=new THREE.Mesh(new THREE.BoxGeometry(28,.12,.035),new THREE.MeshBasicMaterial({color:0xe6a955,transparent:true,opacity:.28}));
  line.position.set(0,78,groundHeightAt(0,78,140)+.04); sacredBoundaryGroup.add(line);
}

// Incense, dust, flowers and restrained human presence.
const incenseState=[]; let incensePoints=null; let dustPoints=null; const devotees=[]; const ritualDecor=new THREE.Group(); scene.add(ritualDecor);
function createAtmosphere(){
  ritualReady = true;
  createSacredBoundary();
  const emitters=[[-10,-55],[10,-55],[-8,48],[8,48],[-5,75],[5,75]];
  const count=72, pos=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const e=emitters[i%emitters.length], baseZ=groundHeightAt(e[0],e[1],140)+.35;
    incenseState.push({x:e[0],y:e[1],z:baseZ,phase:Math.random()*8,speed:.12+Math.random()*.16,drift:(Math.random()-.5)*.35});
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  incensePoints=new THREE.Points(g,new THREE.PointsMaterial({color:0xd9cbbb,size:.18,transparent:true,opacity:.18,depthWrite:false,sizeAttenuation:true}));scene.add(incensePoints);

  const dustN=120, dp=new Float32Array(dustN*3);
  for(let i=0;i<dustN;i++){dp[i*3]=(Math.random()-.5)*130;dp[i*3+1]=-95+Math.random()*190;dp[i*3+2]=1+Math.random()*26;}
  const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dp,3));
  dustPoints=new THREE.Points(dg,new THREE.PointsMaterial({color:0xffdda0,size:.055,transparent:true,opacity:.12,depthWrite:false}));scene.add(dustPoints);

  // Restrained stylised devotees: simple silhouettes, slow paths, no game behaviour.
  const paths=[[-18,-70,-18,-12],[18,-62,18,10],[-28,-22,-28,28],[12,55,12,73]];
  paths.forEach((p,i)=>{
    const group=new THREE.Group();
    const robe=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.65,4,8),new THREE.MeshStandardMaterial({color:[0x8b512f,0x6e3d2f,0x9a7043,0x71483f,0xa06a3c,0x694c38][i],roughness:.9})); robe.rotation.x=Math.PI/2; robe.position.z=.72;
    const head=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),new THREE.MeshStandardMaterial({color:0x9a6a4a,roughness:1}));head.position.z=1.45; group.add(robe,head);
    group.userData={a:new THREE.Vector2(p[0],p[1]),b:new THREE.Vector2(p[2],p[3]),phase:Math.random(),speed:.018+Math.random()*.012,standing:i===5,seated:i===4}; if(i===4){robe.scale.z=.58;head.position.z=1.08;}
    scene.add(group); devotees.push(group);
  });

  // Subtle flower/rangoli accents. Decorative only; visibility changes with ritual time.
  const flowerMat=new THREE.MeshStandardMaterial({color:0xe8a234,roughness:.8,emissive:0x6a2a07,emissiveIntensity:.18});
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=4.2+(i%2)*.5;const f=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),flowerMat);f.position.set(Math.cos(a)*r,-61+Math.sin(a)*r,groundHeightAt(Math.cos(a)*r,-61+Math.sin(a)*r,140)+.08);ritualDecor.add(f);}
}
function updateAtmosphere(t,dt){
  if(incensePoints){const a=incensePoints.geometry.attributes.position;for(let i=0;i<incenseState.length;i++){const q=incenseState[i],u=(t*q.speed+q.phase)%1; a.setXYZ(i,q.x+Math.sin(t*.55+q.phase)*(.12+u*.55)+q.drift*u,q.y+Math.cos(t*.4+q.phase)*(.08+u*.28),q.z+u*4.8);}a.needsUpdate=true;incensePoints.material.opacity=experience.sacredFocus ? .28 : .16;}
  if(dustPoints){dustPoints.rotation.z=t*.003; dustPoints.position.z=Math.sin(t*.12)*.2;}
  devotees.forEach((d,i)=>{const u=(t*d.userData.speed+d.userData.phase)%2;const v=u<=1?u:2-u;const p=(d.userData.standing||d.userData.seated)?d.userData.b:d.userData.a.clone().lerp(d.userData.b,v);d.position.set(p.x,p.y,groundHeightAt(p.x,p.y,140)); if(!d.userData.standing&&!d.userData.seated){const dir=d.userData.b.clone().sub(d.userData.a);if(u>1)dir.negate();d.rotation.z=Math.atan2(-dir.x,dir.y);} });
}

function ritualProfile(){
  if(hour>=4.6&&hour<6.8)return {id:'brahma',incense:.30,flowers:.45,devotees:.35,env:'birds'};
  if(hour>=6.8&&hour<11)return {id:'morning',incense:.24,flowers:.75,devotees:.72,env:'birds'};
  if(hour>=11&&hour<16.8)return {id:'midday',incense:.14,flowers:.55,devotees:.52,env:'quiet'};
  if(hour>=16.8&&hour<19.3)return {id:'sandhya',incense:.34,flowers:1,devotees:.82,env:'aarti'};
  return {id:'night',incense:.22,flowers:.65,devotees:.28,env:'night'};
}
function updateRitualEnvironment(){
  const p=ritualProfile(); document.body.dataset.ritual=p.id;
  if(incensePoints) incensePoints.material.opacity=p.incense;
  ritualDecor.visible=p.flowers>.2; ritualDecor.scale.setScalar(.85+p.flowers*.15);
  devotees.forEach((d,i)=>d.visible=i<Math.ceil(devotees.length*p.devotees));
  ritualLightFactor=p.id==='sandhya'?1.16:1;
}

// Local architectural-spiritual knowledge graph: grounded in the app's verified geometry/zoning.
const knowledgeLinks={
  approach:[['Why begin on axis?','The axial approach helps the visitor read the temple as a whole before entering its more layered interior spaces.'],['Why does the temple rise?','Elevation makes the transition from outer ground to raised sacred architecture physically legible.']],
  'main-stairs':[['Why are stairs important?','Here the route changes from horizontal approach to vertical ascent, making the threshold bodily perceptible.']],
  mandapa:[['Why so many pillars?','Repeated pillars structure large interior space into rhythmic bays, shaping movement, depth and framed views.'],['What should I notice?','Look for the continuity of the central axis even while the surrounding hall becomes broader and more layered.']],
  'pradakshina-east':[['Why move around the temple?','Circumambulatory movement changes the relationship from a single frontal view to a sequence of views around the inner mass.']],
  'pradakshina-west':[['Why move around the temple?','Circumambulatory movement changes the relationship from a single frontal view to a sequence of views around the inner mass.']],
  'sanctum-approach':[['Why is the interface disappearing?','The application intentionally reduces digital information here so the architecture and inward visual focus take precedence.'],['Why is the light warmer?','Local lighting is being used as a quiet navigational cue rather than relying on arrows or game-like markers.']],
  'sacred-core':[['Why is this area quieter?','The experience is designed to become less informational and less visually busy toward the most inward zone.'],['What should I do here?','Nothing is required. You can remain still, observe the space, or continue when you wish.']]
};
function refreshGuide(){
  const wrap=document.querySelector('#guideQuestions'),answer=document.querySelector('#guideAnswer'); if(!wrap)return;
  wrap.innerHTML=''; const links=knowledgeLinks[zoneState.active?.id]||[['What is this space?',zoneState.active?.body||'This zone is part of the temple walkthrough.']];
  links.forEach(([q,a])=>{const b=document.createElement('button');b.textContent=q;b.onclick=()=>answer.textContent=a;wrap.appendChild(b);});
  answer.textContent='Choose a question for a brief, grounded explanation.';
}

function updateInfoDepth(depth){
  const z=zoneState.active;if(!z)return;
  document.querySelectorAll('.depth-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.depth===depth));
  const body=document.querySelector('#infoBody');
  if(depth==='brief') body.textContent=z.body.split('.').slice(0,2).join('.')+'.';
  else if(depth==='context') body.textContent=z.body;
  else body.textContent=`${z.body} Architectural reading: ${z.meta} This interpretive layer describes the digital model and spatial sequence; temple-specific historical or ritual claims should be replaced with authenticated institutional content.`;
}

// --- Information hotspots -----------------------------------------------------
const hotspotGroup = new THREE.Group(); scene.add(hotspotGroup);
const hotspots = [];
const hotspotDefs = [
  { p:[0,-77], title:'Entrance & Threshold', kicker:'Sacred Threshold', body:'Thresholds in temple architecture mark a deliberate change of realm—from ordinary movement into a space structured for attention, reverence and ritual.', meta:'Interactive marker · Press E when highlighted' },
  { p:[-28,-35], title:'Pillared Edge', kicker:'Architecture', body:'Columns define rhythm, structure and procession. In this walkthrough they also participate directly in collision detection, so the digital movement respects the physical model.', meta:'Collision-aware architectural feature' },
  { p:[0,-25], title:'Mandapa Zone', kicker:'Gathering Space', body:'The pillared hall is experienced as a layered transition: open enough for assembly, yet increasingly focused toward the temple’s sacred centre.', meta:'Curatorial text placeholder — suitable for multilingual interpretation' },
  { p:[0,18], title:'Inner Processional Axis', kicker:'Movement', body:'The central line organizes sight, movement and attention. Lighting changes across the day have been designed to make the same path feel distinct at dawn, noon, aarti and night.', meta:'Try the Time controls below' },
  { p:[0,57], title:'Toward the Sanctum', kicker:'Darshan', body:'As the route approaches the innermost zone, interpretation should become quieter and less intrusive. The interface therefore uses small markers and optional panels rather than permanent large overlays.', meta:'Experience design principle: reverence before spectacle' },
  { p:[22,72], title:'Temple Craft & Detail', kicker:'Craft', body:'The model contains dense architectural detail. The renderer uses physically based shading and directional daylight so carved surfaces remain legible without turning the temple into a game-like environment.', meta:'Lighting: dynamic sun + warm architectural lights' },
  { p:[0,93], title:'Sacred Core', kicker:'Contemplative Zone', body:'This zone is presented as a contemplative destination. For a production version, this point can host authenticated historical, iconographic, ritual or conservation material supplied by the temple authority.', meta:'Recommended: verified institutional content only' }
];

const locationMarkerGroup = new THREE.Group(); scene.add(locationMarkerGroup);
const locationMarkers = [];
let activeLocationMarker = null;
let pendingLocationClick = null;
const pointerNDC = new THREE.Vector2(0,0);
let pointerOnCanvas = false;

function makeLocationDotTexture(){
  const c=document.createElement('canvas'); c.width=c.height=128;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,3,64,64,58);
  g.addColorStop(0,'rgba(255,250,215,1)');
  g.addColorStop(.13,'rgba(255,220,130,1)');
  g.addColorStop(.28,'rgba(242,150,45,.98)');
  g.addColorStop(.48,'rgba(219,104,20,.58)');
  g.addColorStop(.72,'rgba(255,177,65,.18)');
  g.addColorStop(1,'rgba(255,150,30,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  ctx.beginPath(); ctx.arc(64,64,18,0,Math.PI*2); ctx.fillStyle='rgba(255,239,185,.98)'; ctx.fill();
  ctx.beginPath(); ctx.arc(64,64,10,0,Math.PI*2); ctx.fillStyle='rgba(211,91,18,1)'; ctx.fill();
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; tex.needsUpdate=true; return tex;
}

const locationDotTexture = makeLocationDotTexture();

function createLocationMarkers() {
  if (locationMarkers.length) return;
  walkLocations.forEach((loc, i) => {
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: locationDotTexture,
      color: 0xffffff,
      transparent: true,
      opacity: .94,
      depthTest: true,
      depthWrite: false,
      // World scale is recalculated every frame to keep the dot at ~64 CSS px.
      sizeAttenuation: true,
      blending: THREE.NormalBlending
    }));
    const anchor = getLocationAnchor(loc);
    // Never render a navigation marker unless the human-capsule solver has
    // actually found reachable standing space for it.
    if(!anchor) return;
    marker.position.set(anchor.x, anchor.y, anchor.eyeZ);
    marker.scale.set(.5,.5,1);
    marker.renderOrder=12;
    marker.userData = { locationMarker:true, locationId:loc.id, title:loc.name, sub:loc.sub, index:i };
    locationMarkerGroup.add(marker);
    locationMarkers.push(marker);

    const div = document.createElement('div');
    div.className = 'location-marker-label';
    div.innerHTML = `<span>${String(i+1).padStart(2,'0')}</span><strong>${loc.name}</strong><small>${loc.sub}</small><em>Click to move</em>`;
    const label = new CSS2DObject(div);
    label.position.set(0,0,.88);
    label.visible = false;
    marker.add(label);
    marker.userData.label = label;
  });
  // Runtime audit: every marker reports the surface, feet and camera-eye levels
  // actually used. This makes hosted/deployment discrepancies easy to inspect.
  console.table(walkLocations.map(loc => {
    const a=getLocationAnchor(loc);
    return a ? {location:loc.name,x:a.x.toFixed(2),y:a.y.toFixed(2),surfaceZ:a.surfaceZ.toFixed(2),feetZ:a.feetZ.toFixed(2),eyeZ:a.eyeZ.toFixed(2),navCell:a.navCell} : {location:loc.name,status:'NO VALID NAVIGATION POINT'};
  }));
}

const LOCATION_DOT_PX = 64;
const locationMarkerCameraSpace = new THREE.Vector3();

function fixedPixelSpriteScale(sprite, pixels = LOCATION_DOT_PX){
  // Convert a requested CSS-pixel diameter to world units at this sprite's
  // camera-space depth. This keeps the marker visually ~64 px regardless of
  // camera distance, zoom/FOV, screen resolution or device pixel ratio.
  locationMarkerCameraSpace.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse);
  const depth = Math.max(.25, Math.abs(locationMarkerCameraSpace.z));
  const viewportHeight = Math.max(1, renderer.domElement.clientHeight || window.innerHeight || 1);
  const visibleWorldHeight = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
  return (pixels / viewportHeight) * visibleWorldHeight;
}

function updateLocationMarkers(t) {
  if (!locationMarkers.length) return;
  const currentZoneId = zoneState.active?.id || null;
  locationMarkers.forEach((m, i) => {
    const loc = walkLocationById.get(m.userData.locationId);
    const anchor = getLocationAnchor(loc);
    if(!anchor){m.visible=false;return;}
    const dx = anchor.x - player.position.x;
    const dy = anchor.y - player.position.y;
    const dist = Math.hypot(dx, dy);
    const sameZone = currentZoneId && zoneAt(new THREE.Vector3(anchor.x,anchor.y,anchor.feetZ))?.id === currentZoneId;
    const isCurrent = currentWalkLocationId === loc.id;
    // Actual billboard-navigation layer: nearby markers remain readily discoverable,
    // while distant markers fade to keep the temple visually quiet.
    const reveal = mode === 'walk' && walkEngaged && !experience?.silence && !experience?.sacredFocus && (dist < 105 || sameZone || isCurrent);
    m.visible = reveal;
    if (!reveal) return;

    const bob = Math.sin(t * 1.55 + i * .55) * .035;
    m.position.set(anchor.x, anchor.y, anchor.eyeZ + bob);
    const hover = activeLocationMarker === m;
    const fixedScale = fixedPixelSpriteScale(m, LOCATION_DOT_PX);
    // Keep the physical screen footprint fixed. Hover/current state changes
    // luminance only; it never makes the marker larger and obscure the view.
    m.scale.set(fixedScale, fixedScale, 1);
    m.material.opacity = hover ? 1 : (isCurrent ? .98 : THREE.MathUtils.clamp(1-dist/150,.56,.93));
    if (m.userData.label) {
      m.userData.label.visible = hover;
      if (m.userData.label.element) m.userData.label.element.style.opacity = hover ? 1 : 0;
    }
  });

  if (mode !== 'walk' || !walkEngaged || !pointerOnCanvas || streetDrag) {
    setActiveLocationMarker(null);
    return;
  }
  raycaster.setFromCamera(pointerNDC, camera);
  raycaster.far = 260;
  const hits = raycaster.intersectObjects(locationMarkers.filter(m => m.visible), false);
  setActiveLocationMarker(hits[0]?.object || null);
}

function setActiveLocationMarker(marker) {
  if (activeLocationMarker === marker) return;
  if (activeLocationMarker?.userData?.label) activeLocationMarker.userData.label.visible = false;
  activeLocationMarker = marker;
  if (activeLocationMarker?.userData?.label) activeLocationMarker.userData.label.visible = true;
  const tip = document.querySelector('#hoverTip');
  if (activeLocationMarker) {
    tip.textContent = `${activeLocationMarker.userData.title} · Click to move`;
    tip.classList.add('show');
    renderer.domElement.style.cursor = 'pointer';
  } else {
    if (!activeHotspot) tip.classList.remove('show');
    tip.textContent = activeHotspot ? `E · ${activeHotspot.userData.title}` : '';
    renderer.domElement.style.cursor = streetDrag ? 'grabbing' : '';
  }
}

function createHotspots() {
  const orbGeo = new THREE.SphereGeometry(.32,18,18);
  hotspotDefs.forEach((d,i) => {
    const z = groundHeightAt(d.p[0],d.p[1],140) + 1.6;
    const mat = new THREE.MeshStandardMaterial({color:0xffc766,emissive:0xe77b1f,emissiveIntensity:2.2,roughness:.45});
    const orb = new THREE.Mesh(orbGeo,mat);
    orb.position.set(d.p[0],d.p[1],z);
    orb.userData = {...d, hotspot:true, index:i};
    hotspotGroup.add(orb); hotspots.push(orb);

    const halo = new THREE.Mesh(new THREE.RingGeometry(.46,.58,32), new THREE.MeshBasicMaterial({color:0xffd58b,transparent:true,opacity:.32,side:THREE.DoubleSide,depthWrite:false}));
    halo.position.copy(orb.position); halo.rotation.x=Math.PI/2; halo.userData.decorative=true; hotspotGroup.add(halo); orb.userData.halo=halo;

    const div=document.createElement('div'); div.className='hotspot-label'; div.textContent=d.title;
    const label=new CSS2DObject(div); label.position.set(0,0,.62); orb.add(label);
  });

}

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
let activeHotspot = null;
function updateInteraction(t) {
  updateLocationMarkers(t);
  hotspots.forEach((h,i)=>{
    const dx=h.position.x-player.position.x, dy=h.position.y-player.position.y;
    const dist=Math.hypot(dx,dy);
    const near = dist < 19;
    const sameZone = zoneState.active && zoneAt(h.position)?.id === zoneState.active.id;
    const reveal = !experience?.silence && !experience?.sacredFocus && near && (sameZone || dist < 10);
    h.visible = reveal;
    if(h.userData.halo) h.userData.halo.visible = reveal;
    const labelObj=h.children.find(c=>c.isCSS2DObject);
    if(labelObj?.element) labelObj.element.style.opacity = reveal ? Math.max(.3,1-dist/22) : 0;
    const s=1+Math.sin(t*2.2+i)*.12; h.scale.setScalar(s);
    if(h.userData.halo){h.userData.halo.rotation.z=t*.25+i;h.userData.halo.scale.setScalar(1+Math.sin(t*1.7+i)*.12)}
  });
  if (mode !== 'walk' || !walkEngaged || !hotspots.length) { setActiveHotspot(null); return; }
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  raycaster.far=12;
  const hits=raycaster.intersectObjects(hotspots.filter(h=>h.visible),false);
  setActiveHotspot(hits[0]?.object || null);
}
function setActiveHotspot(h){
  if(activeHotspot===h)return;
  if(activeHotspot) activeHotspot.material.emissiveIntensity=2.2;
  activeHotspot=h;
  const tip=document.querySelector('#hoverTip');
  if(h && !activeLocationMarker){h.material.emissiveIntensity=5; tip.textContent=`E · ${h.userData.title}`;tip.classList.add('show');}
  else if(!h && !activeLocationMarker) tip.classList.remove('show');
}
function openInfo(h){
  if(!h)return;
  document.querySelector('#infoKicker').textContent=h.userData.kicker;
  document.querySelector('#infoTitle').textContent=h.userData.title;
  document.querySelector('#infoBody').textContent=h.userData.body;
  document.querySelector('#infoMeta').textContent=h.userData.meta;
  if(!experience?.silence && !experience?.sacredFocus) document.querySelector('#infoPanel').classList.add('open');
}

// --- Input ---------------------------------------------------------------------
const keys = new Set();
const movementCodes = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',e=>{
  if (movementCodes.has(e.code)) e.preventDefault();
  if(e.code==='Escape' && walkTransition){cancelWalkTransition();return;}
  if(!walkTransition) keys.add(e.code);
  if(e.code==='KeyE'&&activeHotspot&&!walkTransition)openInfo(activeHotspot);
});
addEventListener('keyup',e=>{
  if (movementCodes.has(e.code)) e.preventDefault();
  keys.delete(e.code);
});
addEventListener('blur',()=>keys.clear());

let mode='walk';

// --- Walk Mode named-location navigation --------------------------------------
// These are curated, ground-level viewpoints. They are linked as a navigation tree
// so a transition between two branches returns through an architectural hub instead
// of cutting directly through walls. Geometry around the complete route is prefetched
// before the camera starts moving.
const walkLocations = [
  {id:'main-gate', name:'Main Gate', sub:'Primary parkota entrance', x:0, y:-178, yaw:0, parent:null, floorZ:0.12},
  {id:'outer-forecourt', name:'Outer Forecourt', sub:'Arrival court inside the gate', x:0, y:-150, yaw:0, parent:'main-gate', floorZ:0.12},
  {id:'temple-approach', name:'Temple Approach', sub:'Principal processional axis', x:-1, y:-114.5, yaw:0, parent:'outer-forecourt', floorZ:0.10},
  {id:'sacred-ascent', name:'Sacred Ascent', sub:'Main staircase', x:0, y:-89, yaw:0, parent:'temple-approach', floorZ:7.24},
  {id:'entrance-platform', name:'Entrance Platform', sub:'Raised threshold', x:-1, y:-62, yaw:0, parent:'sacred-ascent', floorZ:7.24},
  {id:'mandapa-forecourt', name:'Mandapa Forecourt', sub:'Transition into the hall', x:-1, y:-46, yaw:0, parent:'entrance-platform', floorZ:7.24},
  {id:'main-mandapa', name:'Main Mandapa', sub:'Central pillared gathering space', x:-1, y:-29, yaw:0, parent:'mandapa-forecourt', floorZ:7.24},
  {id:'east-pillared-hall', name:'East Pillared Hall', sub:'Eastern column rhythm', x:23, y:-11, yaw:-1.15, parent:'main-mandapa', floorZ:7.24},
  {id:'west-pillared-hall', name:'West Pillared Hall', sub:'Western column rhythm', x:-23, y:-11, yaw:1.15, parent:'main-mandapa', floorZ:7.24},
  {id:'inner-axis', name:'Inner Processional Axis', sub:'Central inward movement', x:-1, y:18, yaw:0, parent:'main-mandapa', floorZ:7.24},
  {id:'east-pradakshina', name:'East Pradakshina', sub:'Eastern circumambulatory path', x:33, y:29, yaw:0.15, parent:'inner-axis', floorZ:7.24},
  {id:'west-pradakshina', name:'West Pradakshina', sub:'Western circumambulatory path', x:-33, y:29, yaw:-0.15, parent:'inner-axis', floorZ:7.24},
  {id:'inner-hall', name:'Inner Hall', sub:'Quieter inward threshold', x:-6, y:48, yaw:0.12, parent:'inner-axis', floorZ:7.24},
  {id:'sanctum-approach', name:'Sanctum Approach', sub:'Approach toward darshan', x:-5, y:70, yaw:0.10, parent:'inner-hall', floorZ:7.24},
  {id:'darshan-threshold', name:'Darshan Threshold', sub:'Pause before the sacred core', x:-4, y:77, yaw:0.08, parent:'sanctum-approach', floorZ:7.24},
  {id:'garbhgrih-darshan', name:'Garbhgrih Darshan', sub:'Respectful viewing position', x:-3, y:87, yaw:0.06, parent:'darshan-threshold', floorZ:7.24},
  {id:'east-parkota', name:'East Parkota Walk', sub:'Outer precinct colonnade', x:88, y:-78, yaw:0.2, parent:'outer-forecourt', floorZ:0.12},
  {id:'north-precinct', name:'North Precinct', sub:'Northern parkota court', x:0, y:150, yaw:Math.PI, parent:'outer-forecourt', floorZ:0.12},
];
const walkLocationById = new Map(walkLocations.map(l=>[l.id,l]));
const walkLocationAnchorById = new Map();
let currentWalkLocationId = 'temple-approach';
let walkTransition = null;

function nearestWalkLocation(pos=player.position) {
  let best=walkLocations[0], bestD=Infinity;
  for(const l of walkLocations){
    const d=(pos.x-l.x)*(pos.x-l.x)+(pos.y-l.y)*(pos.y-l.y);
    if(d<bestD){bestD=d;best=l;}
  }
  return best;
}
function locationGroundZ(l){
  return Number.isFinite(l.floorZ) ? l.floorZ + .08 : groundHeightAt(l.x,l.y,18)+.08;
}

// --- Human navigation surface -------------------------------------------------
// Navigation is derived from free space, not from triangle normals. A point belongs
// to the navigation surface only when the same human capsule used by Walk Mode can
// stand there AND that point is connected to the entrance through neighboring valid
// standing positions. This intentionally excludes isolated roofs, ledges and cavities.
const navigationSurface = {
  ready:false,
  step:3.5,
  minX:-98,
  maxX:98,
  minY:-188.5,
  maxY:161.5,
  maxNodes:6000,
  nodes:[],
  byCell:new Map(),
  buildMs:0,
};
window.__templeNavigation = navigationSurface;

function navCellKey(ix,iy){ return `${ix},${iy}`; }
function navCellForXY(x,y){
  return {
    ix:Math.round((x-navigationSurface.minX)/navigationSurface.step),
    iy:Math.round((y-navigationSurface.minY)/navigationSurface.step)
  };
}
function navXYForCell(ix,iy){
  return {
    x:navigationSurface.minX+ix*navigationSurface.step,
    y:navigationSurface.minY+iy*navigationSurface.step
  };
}

function collectSupportHeightsNear(x,y,referenceFeetZ,up=1.25,down=1.45){
  // Intersections are merely candidate support heights. We deliberately do not
  // inspect face normals. Human-capsule occupancy decides whether a candidate is usable.
  const top=referenceFeetZ+up;
  const bottom=referenceFeetZ-down;
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y,top),new THREE.Vector3(0,0,-1),0,top-bottom);
  ray.firstHitOnly=false;
  const heights=[];
  [collider,precinctCollider].forEach(mesh=>{
    if(!mesh)return;
    const hits=ray.intersectObject(mesh,false);
    for(const hit of hits){
      const z=hit.point.z;
      if(z<bottom-.02||z>top+.02)continue;
      if(!heights.some(v=>Math.abs(v-z)<.055))heights.push(z);
    }
  });
  heights.sort((a,b)=>Math.abs((a+.08)-referenceFeetZ)-Math.abs((b+.08)-referenceFeetZ));
  return heights;
}

function testCapsuleStanding(x,y,surfaceZ){
  const intended=new THREE.Vector3(x,y,surfaceZ+.08);
  player.position.copy(intended);
  // Fractionally penetrate support so collision must resolve onto a real surface.
  player.position.z-=.075;
  player.velocity.set(0,0,-.1);
  player.onGround=false;
  resolveCapsuleCollisions();
  resolveCapsuleCollisions();
  const resolved=player.position.clone();
  const horizontal=Math.hypot(resolved.x-intended.x,resolved.y-intended.y);
  const vertical=Math.abs(resolved.z-intended.z);
  if(horizontal>.13||vertical>.22)return null;
  return {x:resolved.x,y:resolved.y,feetZ:resolved.z,surfaceZ:resolved.z-.08};
}

function findStandableNearHeight(x,y,referenceFeetZ,up=1.25,down=1.45){
  const heights=collectSupportHeightsNear(x,y,referenceFeetZ,up,down);
  for(const surfaceZ of heights.slice(0,10)){
    const standing=testCapsuleStanding(x,y,surfaceZ);
    if(standing)return standing;
  }
  return null;
}

function edgeIsHumanNavigable(a,b){
  const dz=Math.abs(b.feetZ-a.feetZ);
  if(dz>1.05)return false;
  const dist=Math.hypot(b.x-a.x,b.y-a.y);
  if(dist>navigationSurface.step*1.5)return false;
  // Test intermediate body positions. This prevents the graph from connecting
  // through a wall merely because walkable floors exist on both sides of it.
  for(const t of [.5]){
    const x=THREE.MathUtils.lerp(a.x,b.x,t);
    const y=THREE.MathUtils.lerp(a.y,b.y,t);
    const expected=THREE.MathUtils.lerp(a.feetZ,b.feetZ,t);
    const mid=findStandableNearHeight(x,y,expected,.8,.9);
    if(!mid)return false;
    if(Math.abs(mid.feetZ-expected)>.48)return false;
  }
  return true;
}

function seedNavigationSurface(){
  const preferred={x:player.position.x,y:player.position.y,feetZ:player.position.z};
  let standing=findStandableNearHeight(preferred.x,preferred.y,preferred.feetZ,1.1,1.3);
  if(standing)return standing;
  // Small local search only for seed recovery; this is not a location fallback.
  for(const r of [1,2,3,4]){
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      const x=preferred.x+Math.cos(a)*r, y=preferred.y+Math.sin(a)*r;
      standing=findStandableNearHeight(x,y,preferred.feetZ,1.3,1.5);
      if(standing)return standing;
    }
  }
  return null;
}

function buildNavigationSurface(){
  const started=performance.now();
  navigationSurface.nodes.length=0;
  navigationSurface.byCell.clear();
  navigationSurface.ready=false;
  walkLocationAnchorById.clear();

  const savedPos=player.position.clone();
  const savedVel=player.velocity.clone();
  const savedGround=player.onGround;
  const seed=seedNavigationSurface();
  if(!seed){
    console.error('Navigation surface: no valid entrance seed found.');
    player.position.copy(savedPos);player.velocity.copy(savedVel);player.onGround=savedGround;
    return;
  }

  const seedCell=navCellForXY(seed.x,seed.y);
  const seedXY=navXYForCell(seedCell.ix,seedCell.iy);
  const snappedSeed=findStandableNearHeight(seedXY.x,seedXY.y,seed.feetZ,1.3,1.5)||seed;
  const first={...snappedSeed,ix:seedCell.ix,iy:seedCell.iy};
  navigationSurface.nodes.push(first);
  navigationSurface.byCell.set(navCellKey(first.ix,first.iy),first);
  const queue=[first];
  let q=0;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

  while(q<queue.length && navigationSurface.nodes.length<navigationSurface.maxNodes){
    const current=queue[q++];
    for(const [dx,dy] of dirs){
      const ix=current.ix+dx, iy=current.iy+dy;
      const xy=navXYForCell(ix,iy);
      if(xy.x<navigationSurface.minX||xy.x>navigationSurface.maxX||xy.y<navigationSurface.minY||xy.y>navigationSurface.maxY)continue;
      const key=navCellKey(ix,iy);
      if(navigationSurface.byCell.has(key))continue;
      // Mark as visited before the expensive test; null means non-navigation cell.
      navigationSurface.byCell.set(key,null);
      const candidate=findStandableNearHeight(xy.x,xy.y,current.feetZ,1.05,1.35);
      if(!candidate)continue;
      if(!edgeIsHumanNavigable(current,candidate))continue;
      const node={...candidate,ix,iy};
      navigationSurface.byCell.set(key,node);
      navigationSurface.nodes.push(node);
      queue.push(node);
    }
  }

  player.position.copy(savedPos);player.velocity.copy(savedVel);player.onGround=savedGround;
  navigationSurface.ready=navigationSurface.nodes.length>0;
  navigationSurface.buildMs=performance.now()-started;
  console.info(`Navigation surface: ${navigationSurface.nodes.length} connected human-standing cells in ${navigationSurface.buildMs.toFixed(0)} ms.`);
}

function nearestNavigationNode(x,y,maxDistance=18){
  if(!navigationSurface.ready)return null;
  let best=null,bestD2=maxDistance*maxDistance;
  for(const n of navigationSurface.nodes){
    const dx=n.x-x,dy=n.y-y,d2=dx*dx+dy*dy;
    if(d2<bestD2){bestD2=d2;best=n;}
  }
  return best;
}

function getLocationAnchor(l){
  if(walkLocationAnchorById.has(l.id))return walkLocationAnchorById.get(l.id);
  // Crucially: floorZ is not used. The named XY is only a semantic hint. The
  // actual destination must be a point on the entrance-connected navigation surface.
  const node=nearestNavigationNode(l.x,l.y,20);
  if(!node){
    walkLocationAnchorById.set(l.id,null);
    console.warn(`No entrance-connected navigation surface near ${l.name}`);
    return null;
  }
  const anchor={
    x:node.x,y:node.y,feetZ:node.feetZ,surfaceZ:node.surfaceZ,
    eyeZ:node.feetZ+walkCam.eyeHeight,navCell:`${node.ix},${node.iy}`
  };
  walkLocationAnchorById.set(l.id,anchor);
  return anchor;
}

function resolveSafeLocationTarget(target){
  const a=getLocationAnchor(target);
  return a?{x:a.x,y:a.y,z:a.feetZ,surfaceZ:a.surfaceZ}:null;
}

function setTransitionBadge(target,progress=0,show=false){
  const badge=document.querySelector('#walkTransitionBadge');
  if(!badge)return;
  badge.classList.toggle('show',show);
  const name=document.querySelector('#walkTransitionName'); if(name)name.textContent=target?.name||'';
  const bar=document.querySelector('#walkTransitionProgress'); if(bar)bar.style.width=`${Math.round(progress*100)}%`;
}
function refreshCurrentWalkLocation(){
  const near=nearestWalkLocation();
  currentWalkLocationId=near.id;
}

function cancelWalkTransition(){ walkTransition=null; setTransitionBadge(null,0,false); }

// Location navigation is deliberately a direct viewpoint move. There are no
// generated paths or camera splines in this build. Each destination is a curated
// safe viewpoint; clicking it relocates the visitor and applies the stored heading.
async function transitionToWalkLocation(id){
  const target=walkLocationById.get(id); if(!target)return;
  if(mode!=='walk') await setMode('walk');
  const anchor=getLocationAnchor(target);
  if(!anchor){
    console.warn(`No validated navigation point available for ${target.name}.`);
    return;
  }
  // Marker and visitor share exactly the same validated navigation-space anchor.
  // Re-test after teleport; if the live BVH moves the capsule materially, abort
  // instead of ever placing the camera inside architectural geometry.
  const previousPos=player.position.clone();
  player.position.set(anchor.x,anchor.y,anchor.feetZ);
  player.velocity.set(0,0,0);
  player.onGround=false;
  resolveCapsuleCollisions();
  resolveCapsuleCollisions();
  const teleportHorizontal=Math.hypot(player.position.x-anchor.x,player.position.y-anchor.y);
  const teleportVertical=Math.abs(player.position.z-anchor.feetZ);
  if(teleportHorizontal>.18 || teleportVertical>.24){
    console.warn(`Rejected unsafe navigation jump to ${target.name}`, {teleportHorizontal,teleportVertical,anchor});
    player.position.copy(previousPos);
    player.velocity.set(0,0,0);
    updateWalkCamera(true);
    console.warn(`${target.name} is not currently safe to enter.`);
    return;
  }
  walkCam.yaw=target.yaw;
  walkCam.pitch=0.015;
  updateWalkCamera(true);
  // Eye-level verification: camera must match feet + configured human eye height.
  const expectedEyeZ=player.position.z+walkCam.eyeHeight;
  if(Math.abs(camera.position.z-expectedEyeZ)>.03){
    camera.position.z=expectedEyeZ;
    updateWalkCamera(true);
  }
  currentWalkLocationId=target.id;
  refreshCurrentWalkLocation();
  updateTempleZone(true);
}
function updateWalkLocationTransition(){ return false; }

let darshanTween=null;
const darshanViews={
  entrance:{pos:new THREE.Vector3(0,-142,28),target:new THREE.Vector3(0,-38,16)},
  mandapa:{pos:new THREE.Vector3(52,-58,28),target:new THREE.Vector3(0,-10,15)},
  shikhara:{pos:new THREE.Vector3(92,10,76),target:new THREE.Vector3(0,42,35)},
  pradakshina:{pos:new THREE.Vector3(-76,22,34),target:new THREE.Vector3(0,32,18)},
  sanctum:{pos:new THREE.Vector3(0,38,16),target:new THREE.Vector3(0,88,18)},
};
function setDarshanView(name){
  const v=darshanViews[name]||darshanViews.entrance;
  darshanTween={fromPos:camera.position.clone(),toPos:v.pos.clone(),fromTarget:orbit.target.clone(),toTarget:v.target.clone(),t:0};
}
async function setMode(next){
  const btn=document.querySelector('#modeBtn');
  const cross=document.querySelector('#crosshair');
  const dc=document.querySelector('#darshanControls');
  if(next==='darshan'){
    cancelWalkTransition();
    mode='darshan';
    if(temple) temple.frustumCulled=false;
    walkEngaged=false; orbit.enabled=true; orbit.enablePan=false; orbit.rotateSpeed=.45; orbit.zoomSpeed=.55; cross.classList.add('orbit'); btn.textContent='Darshan Mode'; btn.classList.remove('active'); dc?.classList.remove('hidden');
    setDarshanView('entrance');
  } else {
    mode='walk';
    if(temple) temple.frustumCulled=true;
    orbit.enabled=false; cross.classList.remove('orbit'); btn.textContent='Walk Mode'; btn.classList.add('active'); dc?.classList.add('hidden'); walkEngaged=true;
    updateWalkCamera(true);
  }
}
function updateDarshanTween(dt){
  if(!darshanTween||mode!=='darshan')return;darshanTween.t=Math.min(1,darshanTween.t+dt*.58);const e=1-Math.pow(1-darshanTween.t,3);camera.position.lerpVectors(darshanTween.fromPos,darshanTween.toPos,e);orbit.target.lerpVectors(darshanTween.fromTarget,darshanTween.toTarget,e);orbit.update();if(darshanTween.t>=1)darshanTween=null;
}

// Adaptive procedural devotional music + spoken zone narration.
// The music is generated locally with WebAudio so no copyrighted recording is bundled.
let audioCtx=null, audioRig=null, soundOn=true;
let lastMusicUpdate=0;
function ensureAudio(){
  if(audioCtx) return;
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();

  const master=audioCtx.createGain(); master.gain.value=1; master.connect(audioCtx.destination);
  const convolver=audioCtx.createConvolver(); const irLen=Math.floor(audioCtx.sampleRate*1.7); const ir=audioCtx.createBuffer(2,irLen,audioCtx.sampleRate); for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<irLen;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/irLen,3.1);} convolver.buffer=ir;
  const reverbGain=audioCtx.createGain(); reverbGain.gain.value=.16; convolver.connect(reverbGain); reverbGain.connect(master);
  const musicBus=audioCtx.createGain(); musicBus.gain.value=0; musicBus.connect(master);
  const bed=audioCtx.createGain(); bed.gain.value=.82; bed.connect(musicBus);
  const shimmer=audioCtx.createGain(); shimmer.gain.value=.08; shimmer.connect(musicBus);

  const oscillators=[];
  [130.81,196,261.63].forEach((f,i)=>{
    const o=audioCtx.createOscillator();
    const g=audioCtx.createGain();
    o.type=i===0?'sine':'triangle'; o.frequency.value=f; g.gain.value=i===0 ? .45 : .11;
    o.connect(g); g.connect(bed); o.start(); oscillators.push(o);
  });

  // Soft upper harmonic, used like a restrained tanpura/bansuri colour.
  const melodic=audioCtx.createOscillator();
  const melodicGain=audioCtx.createGain();
  melodic.type='sine'; melodic.frequency.value=392; melodicGain.gain.value=.025;
  melodic.connect(melodicGain); melodicGain.connect(shimmer); melodic.start();

  const lfo=audioCtx.createOscillator();
  const lfoGain=audioCtx.createGain();
  lfo.type='sine'; lfo.frequency.value=.09; lfoGain.gain.value=.012;
  lfo.connect(lfoGain); lfoGain.connect(melodicGain.gain); lfo.start();

  audioRig={master,musicBus,bed,shimmer,oscillators,melodic,melodicGain,reverb:convolver};
  retuneAmbient(zoneState.active || templeZones[templeZones.length-1]);
}

function zoneCenterDistance(zone, pos){
  const dx=pos.x-zone.center[0], dy=pos.y-zone.center[1];
  return Math.hypot(dx,dy);
}

function approachMusicProfile(){
  if(!templeZones.length) return null;
  const ranked=templeZones
    .map(z=>({z,d:zoneCenterDistance(z,player.position)}))
    .sort((a,b)=>a.d-b.d)
    .slice(0,2);
  const a=ranked[0], b=ranked[1] || ranked[0];
  const wa=1/Math.max(6,a.d), wb=1/Math.max(6,b.d);
  const sum=wa+wb;
  const t=wb/sum;
  const freq=a.z.audio.freq.map((f,i)=>THREE.MathUtils.lerp(f,b.z.audio.freq[i]||f,t));
  const gain=THREE.MathUtils.lerp(a.z.audio.gain,b.z.audio.gain,t);
  const inward=THREE.MathUtils.clamp((player.position.y+110)/210,0,1);
  return {freq,gain, melodic:THREE.MathUtils.lerp(329.63,523.25,inward), shimmer:.055 + inward*.065};
}

function updateApproachMusic(nowSeconds){
  if(!audioRig || !soundOn || nowSeconds-lastMusicUpdate<.22) return;
  lastMusicUpdate=nowSeconds;
  const profile=approachMusicProfile();
  if(!profile) return;
  const now=audioCtx.currentTime;
  profile.freq.forEach((f,i)=>audioRig.oscillators[i].frequency.setTargetAtTime(f,now,.65));
  audioRig.melodic.frequency.setTargetAtTime(profile.melodic,now,1.15);
  audioRig.shimmer.gain.setTargetAtTime(profile.shimmer,now,.9);
  audioRig.musicBus.gain.setTargetAtTime(experience?.silence ? 0 : profile.gain,now,.8);
}

function playZoneChime(zone){
  if(!audioCtx || !soundOn || experience?.silence) return;
  const now=audioCtx.currentTime;
  const base=zone.audio.freq[1] || 196;
  [1,1.5,2].forEach((ratio,i)=>{
    const o=audioCtx.createOscillator();
    const g=audioCtx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(base*ratio,now);
    g.gain.setValueAtTime(0,now);
    g.gain.linearRampToValueAtTime(.035/(i+1),now+.025);
    g.gain.exponentialRampToValueAtTime(.0001,now+1.8+i*.35);
    o.connect(g); g.connect(audioRig.master); o.start(now); o.stop(now+2.4+i*.35);
  });
}

let lastFootstep=0, lastEnvEvent=0, lastAartiConch=-999;
function spatialPanner(position, maxDistance=90){
  const p=audioCtx.createPanner(); p.panningModel='HRTF'; p.distanceModel='inverse'; p.refDistance=3; p.maxDistance=maxDistance; p.rolloffFactor=1.15;
  p.positionX.value=position.x;p.positionY.value=position.y;p.positionZ.value=position.z; return p;
}
function playGentleBell(position=new THREE.Vector3(0,0,6), strength=1){
  if(!audioCtx||!soundOn)return;const now=audioCtx.currentTime,p=spatialPanner(position,110);p.connect(audioRig.master);p.connect(audioRig.reverb);
  [392,784,1176].forEach((f,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(.018*strength/(i+1),now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+2.6+i*.4);o.connect(g);g.connect(p);o.start(now);o.stop(now+3.3);});
}
function playSoftConch(position=new THREE.Vector3(0,64,9)){
  if(!audioCtx||!soundOn||experience?.silence)return;const now=audioCtx.currentTime,p=spatialPanner(position,130),g=audioCtx.createGain(),o=audioCtx.createOscillator(),lfo=audioCtx.createOscillator(),lg=audioCtx.createGain();
  o.type='sawtooth';o.frequency.setValueAtTime(118,now);o.frequency.exponentialRampToValueAtTime(142,now+1.6);lfo.frequency.value=5;lg.gain.value=3;lfo.connect(lg);lg.connect(o.frequency);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.012,now+.35);g.gain.exponentialRampToValueAtTime(.0001,now+3.5);o.connect(g);g.connect(p);p.connect(audioRig.master);p.connect(audioRig.reverb);o.start(now);lfo.start(now);o.stop(now+3.7);lfo.stop(now+3.7);
}
function playBird(position){
  if(!audioCtx||!soundOn)return;const now=audioCtx.currentTime,p=spatialPanner(position,65);p.connect(audioRig.master);p.connect(audioRig.reverb);const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(1650,now);o.frequency.linearRampToValueAtTime(2300,now+.12);o.frequency.linearRampToValueAtTime(1850,now+.26);g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(.007,now+.03);g.gain.exponentialRampToValueAtTime(.0001,now+.34);o.connect(g);g.connect(p);o.start(now);o.stop(now+.36);
}
function playFootstep(position){
  if(!audioCtx||!soundOn)return;const now=audioCtx.currentTime,p=spatialPanner(position,18);p.connect(audioRig.master);p.connect(audioRig.reverb);const len=Math.floor(audioCtx.sampleRate*.09),buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);const src=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),g=audioCtx.createGain();filter.type='lowpass';filter.frequency.value=420;g.gain.value=.022;src.buffer=buf;src.connect(filter);filter.connect(g);g.connect(p);src.start(now);
}
function updateSpatialAudio(t){
  if(!audioCtx||!soundOn)return;
  const L=audioCtx.listener, f=new THREE.Vector3();camera.getWorldDirection(f);
  if(L.positionX){L.positionX.value=camera.position.x;L.positionY.value=camera.position.y;L.positionZ.value=camera.position.z;L.forwardX.value=f.x;L.forwardY.value=f.y;L.forwardZ.value=f.z;L.upX.value=0;L.upY.value=0;L.upZ.value=1;}
  const moving=Math.hypot(player.velocity.x,player.velocity.y)>.35;
  if(moving&&t-lastFootstep>(experience?.sacredFocus ? .72 : .52)){lastFootstep=t;playFootstep(camera.position.clone());}
  const rp=ritualProfile();
  if(rp.env==='birds'&&t-lastEnvEvent>4.5){lastEnvEvent=t;playBird(new THREE.Vector3((Math.random()-.5)*80,-40+Math.random()*100,14+Math.random()*10));}
  if(rp.env==='aarti'&&t-lastEnvEvent>6.5){lastEnvEvent=t;playGentleBell(new THREE.Vector3((Math.random()-.5)*12,70+Math.random()*18,8),.45);}
  if(rp.env==='aarti'&&t-lastAartiConch>40){lastAartiConch=t;playSoftConch();}
}

function toggleSound(){
  ensureAudio();
  soundOn=!soundOn;
  const zone=zoneState.active || templeZones[templeZones.length-1];
  audioRig.master.gain.setTargetAtTime(soundOn?1:0,audioCtx.currentTime,.3);
  audioRig.musicBus.gain.setTargetAtTime(soundOn && !experience?.silence ? zone.audio.gain : 0,audioCtx.currentTime,.3);
  if(!soundOn && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if(soundOn && zoneState.active) narrateZone(zoneState.active,true);
  document.querySelector('#soundBtn').classList.toggle('active',soundOn);
}

function updatePointerNdcFromEvent(e){
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  pointerOnCanvas = true;
}

renderer.domElement.addEventListener('pointerdown', e => {
  if (mode !== 'walk' || !walkEngaged || e.button !== 0) return;
  updatePointerNdcFromEvent(e);
  if (!streetDrag) {
    raycaster.setFromCamera(pointerNDC, camera);
    raycaster.far = 260;
    const hit = raycaster.intersectObjects(locationMarkers.filter(m => m.visible), false)[0]?.object || null;
    setActiveLocationMarker(hit);
  }
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  if (activeLocationMarker) {
    pendingLocationClick = { marker: activeLocationMarker, x: e.clientX, y: e.clientY };
    return;
  }
  streetDrag = true;
  renderer.domElement.setPointerCapture?.(e.pointerId);
  renderer.domElement.classList.add('dragging-view');
});

renderer.domElement.addEventListener('pointermove', e => {
  updatePointerNdcFromEvent(e);
  if (mode !== 'walk' || !walkEngaged || !streetDrag) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  if (pendingLocationClick && Math.hypot(e.clientX - pendingLocationClick.x, e.clientY - pendingLocationClick.y) > 6) pendingLocationClick = null;
  // Street View style: drag the world; dragging right turns the view left.
  walkCam.yaw -= dx * walkCam.mouseSensitivityX;
  walkCam.pitch = THREE.MathUtils.clamp(
    walkCam.pitch + dy * walkCam.mouseSensitivityY,
    walkCam.minPitch,
    walkCam.maxPitch
  );
  updateWalkCamera();
  updateTempleStreaming(performance.now() / 1000);
});

async function endStreetDrag(e) {
  const hadPending = pendingLocationClick;
  streetDrag = false;
  renderer.domElement.classList.remove('dragging-view');
  if (e?.pointerId != null) renderer.domElement.releasePointerCapture?.(e.pointerId);
  if (hadPending && activeLocationMarker && hadPending.marker === activeLocationMarker) {
    pendingLocationClick = null;
    await transitionToWalkLocation(activeLocationMarker.userData.locationId);
    return;
  }
  pendingLocationClick = null;
}
renderer.domElement.addEventListener('pointerup', endStreetDrag);
renderer.domElement.addEventListener('pointercancel', endStreetDrag);
renderer.domElement.addEventListener('pointerleave', e => { pointerOnCanvas = false; if (streetDrag && !(e.buttons & 1)) endStreetDrag(e); else setActiveLocationMarker(null); });

renderer.domElement.addEventListener('pointerenter', () => { pointerOnCanvas = true; });
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

renderer.domElement.addEventListener('wheel', e => {
  if (mode !== 'walk' || !walkEngaged) return;
  e.preventDefault();
  const direction = Math.sign(e.deltaY);
  const nextFov = THREE.MathUtils.clamp(
    camera.fov * (1 + direction * walkCam.zoomStep),
    walkCam.minFov,
    walkCam.maxFov
  );
  camera.fov = nextFov;
  camera.updateProjectionMatrix();
}, { passive:false });

function beginExperience(pilgrimage=false){
  const entry = document.querySelector('#enterOverlay');
  if(entry){
    entry.classList.add('hidden');
    entry.style.opacity = '0';
    entry.style.visibility = 'hidden';
    entry.style.pointerEvents = 'none';
    setTimeout(() => { if(entry.classList.contains('hidden')) entry.style.display = 'none'; }, 500);
  }
  ensureAudio();
  setPilgrimage(pilgrimage);
  walkEngaged=true; mode='walk';
  experience.lastPosition.copy(player.position);
  updateTempleZone(true); updateWalkCamera(true); updateRitualEnvironment();
}
const enterBtn = document.querySelector('#enterBtn');
const pilgrimageEnterBtn = document.querySelector('#pilgrimageEnterBtn');
if(enterBtn) enterBtn.addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  beginExperience(false);
});
if(pilgrimageEnterBtn) pilgrimageEnterBtn.addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  beginExperience(true);
});
document.querySelector('#pilgrimageBtn').onclick=()=>setPilgrimage(!experience.pilgrimage);
document.querySelector('#silenceBtn').onclick=()=>setSilenceMode(!experience.silence);
document.querySelector('#languageBtn').onclick=toggleLanguage;
document.querySelector('#modeBtn').onclick=()=>setMode(mode==='walk'?'darshan':'walk');
document.querySelector('#soundBtn').onclick=toggleSound;
document.querySelector('#qualityBtn')?.addEventListener('click',()=>applyPerformanceMode(performanceState.mode==='performance'?'balanced':'performance'));
document.querySelector('#helpBtn').onclick=()=>document.querySelector('#helpModal').classList.remove('hidden');
document.querySelector('#closeHelp').onclick=()=>document.querySelector('#helpModal').classList.add('hidden');
document.querySelector('#closeInfo').onclick=()=>document.querySelector('#infoPanel').classList.remove('open');
document.querySelector('#timeSlider').oninput=e=>setTimeOfDay(e.target.value);
document.querySelectorAll('.time-chip').forEach(b=>b.onclick=()=>setTimeOfDay(b.dataset.hour));
document.querySelectorAll('.depth-tabs button').forEach(b=>b.onclick=()=>updateInfoDepth(b.dataset.depth));
document.querySelectorAll('#darshanControls button').forEach(b=>b.onclick=()=>setDarshanView(b.dataset.view));
document.querySelector('#guideToggle').onclick=()=>document.querySelector('#guidePanel').classList.toggle('open');
document.querySelector('#closeReflection').onclick=()=>document.querySelector('#exitReflection').classList.add('hidden');

// --- Animation -----------------------------------------------------------------
const clock=new THREE.Clock();
function updatePlayer(dt){
  if(mode!=='walk'||!walkEngaged||walkTransition)return;

  const turnRight = (keys.has('KeyD')||keys.has('ArrowRight')) ? 1 : 0;
  const turnLeft = (keys.has('KeyA')||keys.has('ArrowLeft')) ? 1 : 0;
  walkCam.yaw += (turnRight - turnLeft) * walkCam.keyTurnSpeed * dt;
  updateWalkOrientation(dt, false);

  const forwardInput = ((keys.has('KeyW')||keys.has('ArrowUp'))?1:0)-((keys.has('KeyS')||keys.has('ArrowDown'))?1:0);
  const forward=tempVec.set(Math.sin(walkCam.currentYaw), Math.cos(walkCam.currentYaw), 0).normalize();
  const move=new THREE.Vector3().addScaledVector(forward, forwardInput);
  if(move.lengthSq())move.normalize();
  const baseSpeed=keys.has('ShiftLeft')||keys.has('ShiftRight')?5.4:3.2;
  const onStairs = zoneState.active?.id==='main-stairs';
  const zoneScale=experience?.sacredFocus ? .58 : (zoneState.active?.id==='inner-hall' ? .78 : (onStairs ? .72 : 1));
  const speed=baseSpeed*zoneScale*(experience?.pilgrimage ? .9 : 1);
  const moveDamping = onStairs ? 8.5 : 11.5;
  player.velocity.x=THREE.MathUtils.damp(player.velocity.x,move.x*speed,moveDamping,dt);
  player.velocity.y=THREE.MathUtils.damp(player.velocity.y,move.y*speed,moveDamping,dt);
  if(!player.onGround)player.velocity.z-=18*dt; else player.velocity.z=Math.max(0,player.velocity.z);

  const before=player.position.clone();
  player.position.addScaledVector(player.velocity,dt);
  resolveCapsuleCollisions();

  // A modest but smoother step assist: if horizontal movement was strongly blocked,
  // retry from a small lifted position, useful over stairs without jolting the view.
  const wanted=new THREE.Vector2(player.velocity.x*dt,player.velocity.y*dt).length();
  const got=new THREE.Vector2(player.position.x-before.x,player.position.y-before.y).length();
  if(player.onGround && wanted>.015 && got<wanted*.28){
    const blockedPos=player.position.clone();
    player.position.copy(before).add(new THREE.Vector3(player.velocity.x*dt,player.velocity.y*dt,.28));
    resolveCapsuleCollisions();
    const retryGot=new THREE.Vector2(player.position.x-before.x,player.position.y-before.y).length();
    if(retryGot<got)player.position.copy(blockedPos);
  }

  if(player.position.z<-12){placePlayerAtEntrance();player.velocity.set(0,0,0)}
  updateWalkCamera(dt);
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05), t=clock.elapsedTime;
  performanceState.frameCounter++;
  const transitioning=updateWalkLocationTransition(dt);
  if(!transitioning) updatePlayer(dt);

  // Non-motion systems do not need a full 60 Hz update. Throttling them removes
  // a substantial amount of CPU work without changing navigation responsiveness.
  if (performanceState.frameCounter % 2 === 0) {
    updateTempleZone();
    updateJourneyStage();
    updatePradakshina();
    updateStillness(dt * 2);
    updateExitJourney();
    updateInteraction(t);
  }
  if (performanceState.frameCounter % 3 === 0) {
    updateApproachMusic(t);
    updateSpatialAudio(t);
    updateAtmosphere(t, dt * 3);
  }
  if (performanceState.frameCounter % 6 === 0 && !walkTransition) updateTempleStreaming(t);
  if (performanceState.frameCounter % 30 === 0 && !walkTransition) refreshCurrentWalkLocation();
  updateDarshanTween(dt);
  if(orbit.enabled&&!darshanTween)orbit.update();
  if (performanceState.frameCounter % 2 === 0) {
    diyaSprites.forEach((s,i)=>{
      const base = 0.78 + Math.sin(t*7.3+i*1.7)*0.06;
      s.material.opacity = THREE.MathUtils.clamp(s.material.opacity * .94 + base * .06, 0.08, 1);
    });
  }
  updateAdaptivePerformance(dt);
  renderer.render(scene,camera);
  if (performanceState.frameCounter % 2 === 0) labelRenderer.render(scene,camera);
}
applyPerformanceMode('performance');
animate();

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);labelRenderer.setSize(innerWidth,innerHeight);
});
