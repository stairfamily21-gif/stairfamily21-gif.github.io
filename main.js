import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Parts Windows can't detect. Fill these in if you know them and they'll show up on the site.
const MY_PARTS = {
  cooler: '', // CPU cooler model
  psu: '',    // power supply model + wattage
  fans: '',   // case fan model
};

const S = window.RIG_STATS || {};
const cpuS = S.cpu || {}, gpuS = S.gpu || {}, memS = S.memory || {}, stS = S.storage || {}, mbS = S.motherboard || {};

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k) => { const c = 0.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const has = (v) => v !== null && v !== undefined && v !== '';

// ---------------------------------------------------------------- boot screen
const bootLines = [
  ['AORUS BIOS ' + (mbS.bios || ''), 'hl'],
  [(mbS.product || 'Motherboard') + '  ·  ' + (S.os || ''), ''],
  ['', ''],
  ['CPU   ' + (cpuS.name || 'Processor'), 'ok'],
  ['MEM   ' + (memS.modules ? memS.modules.length + ' × ' + memS.modules[0].capacityGB + ' GB ' + (memS.modules[0].type || '') : 'Memory'), 'ok'],
  ['GPU   ' + (gpuS.name || 'Graphics'), 'ok'],
  ['NVMe  ' + (stS.name || 'Storage'), 'ok'],
  ['', ''],
  ['JACKING IN…', 'hl'],
];
(async function boot() {
  const log = $('boot-log');
  for (const [txt, cls] of bootLines) {
    const span = document.createElement('div');
    if (cls === 'ok' && txt) span.innerHTML = `${txt}  <span class="ok">[ OK ]</span>`;
    else { span.textContent = txt || ' '; if (cls) span.className = cls; }
    log.appendChild(span);
    await new Promise((r) => setTimeout(r, 110));
  }
})();

// ---------------------------------------------------------------- renderer
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('boot-log').textContent = 'Your browser could not start WebGL, so the 3D model cannot load here.';
  throw e;
}
// Phones and small screens get a lighter version (no mirror floor, no shadows, less rain).
const LOW = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const BG = 0x07031a;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(0x0d0526, 0.003);
const pmrem = new THREE.PMREMGenerator(renderer);

// A dark room lined with neon tubes, rendered once into an environment map so
// every metal and glossy surface reflects neon like it would on a real street.
function neonEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(100, 60, 100), new THREE.MeshBasicMaterial({ color: 0x06030f, side: THREE.BackSide })));
  const tube = (color, k, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
    m.position.set(x, y, z);
    env.add(m);
  };
  tube(0xff2a6d, 7, 2, 44, 2, -48, 4, -18);
  tube(0xff2a6d, 6, 64, 1.6, 1.6, -8, 28, -48);
  tube(0x05d9e8, 7, 2, 44, 2, 48, 4, 14);
  tube(0x05d9e8, 5, 1.6, 1.6, 72, 32, 28, 0);
  tube(0xf9f002, 4, 34, 1.2, 1.2, -4, -12, 48);
  tube(0x9d4dff, 2.4, 44, 20, 1, 0, 10, 49);
  tube(0xffffff, 2.6, 34, 1, 34, 0, 29.5, 0);
  return pmrem.fromScene(env, 0.035).texture;
}
scene.environment = neonEnvironment();
scene.environmentIntensity = 1.0;

const camera = new THREE.PerspectiveCamera(38, Math.max(1, innerWidth) / Math.max(1, innerHeight), 0.5, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 10;
controls.maxDistance = 230;
controls.maxPolarAngle = Math.PI / 2 + 0.06; // never sink under the street
controls.autoRotateSpeed = 1.6;
controls.addEventListener('start', () => { controls.autoRotate = false; $('hint').classList.add('gone'); });

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 3 });
document.body.appendChild(labelRenderer.domElement);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const BLOOM = 1.0;
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), BLOOM, 0.62, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Film look: chromatic aberration toward the edges, scanlines, vignette, grain,
// and a slice glitch that kicks in when the PC explodes.
const cyber = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    glitch: { value: 0 },
    aberration: { value: 0.0028 },
    resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, glitch, aberration;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      float tick = floor(time * 24.0);
      if (glitch > 0.001) {
        float band = floor(uv.y * 28.0);
        if (hash(vec2(band, tick)) > 1.0 - glitch * 0.55) uv.x += (hash(vec2(band, tick + 7.0)) - 0.5) * 0.14 * glitch;
      }
      vec2 dir = uv - 0.5;
      float d = length(dir);
      float ab = aberration * (1.0 + glitch * 10.0) * d * 2.2;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + dir * ab).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - dir * ab).b);
      col *= 0.965 + 0.035 * sin(vUv.y * resolution.y * 1.6);
      col *= mix(1.0, smoothstep(0.9, 0.22, d), 0.6);
      col += (hash(vUv * resolution + fract(time * 7.3) * 91.0) - 0.5) * 0.05;
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(cyber);

// ---------------------------------------------------------------- helpers
await Promise.race([
  Promise.all([document.fonts.load('700 64px "Chakra Petch"'), document.fonts.load('400 32px "Share Tech Mono"'), document.fonts.load('900 64px "Orbitron"')]),
  new Promise((r) => setTimeout(r, 1800)),
]).catch(() => {});
const FONT_UI = '"Chakra Petch", sans-serif';
const FONT_MONO = '"Share Tech Mono", monospace';
const FONT_DISPLAY = '"Orbitron", sans-serif';

// Procedural surface detail: speckle noise for roughness variation, and
// fine directional lines for brushed metal.
function dataTex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
const noiseTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const r = 10 + Math.random() * 50, v = 150 + Math.random() * 105;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},.35)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
  }
  for (let i = 0; i < 9000; i++) { const v = 120 + Math.random() * 135; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1); }
  return dataTex(c, 2);
})();
const brushedTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 110 + Math.random() * 145;
    g.fillStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.35})`;
    g.fillRect(Math.random() * 512 - 100, Math.random() * 512, 60 + Math.random() * 400, 1);
  }
  return dataTex(c, 1);
})();

function std(color, roughness = 0.5, metalness = 0.5, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function phys(color, roughness, metalness, extra = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
}
const rgbMats = [];
// Per-part material cache, so fading one part never fades another.
function kit() {
  const c = {};
  const get = (key, make) => c[key] || (c[key] = make());
  return {
    pcb: () => get('pcb', () => phys(0x12161b, 0.55, 0.3, { clearcoat: 0.5, clearcoatRoughness: 0.4 })),
    black: () => get('black', () => std(0x0b0c0f, 0.6, 0.35, { roughnessMap: noiseTex })),
    plastic: () => get('plastic', () => phys(0x15161c, 0.62, 0.05, { roughnessMap: noiseTex, clearcoat: 0.15 })),
    darkMetal: () => get('dm', () => phys(0x2a2d35, 0.36, 0.92, { roughnessMap: brushedTex, anisotropy: 0.6 })),
    gunmetal: () => get('gm', () => phys(0x474c57, 0.34, 0.95, { roughnessMap: brushedTex, anisotropy: 0.7 })),
    alu: () => get('alu', () => phys(0xc3c8d0, 0.3, 1, { roughnessMap: brushedTex, anisotropy: 0.85 })),
    copper: () => get('cu', () => phys(0xd98a5c, 0.24, 1, { roughnessMap: noiseTex, clearcoat: 0.25 })),
    gold: () => get('au', () => std(0xe0b866, 0.22, 1)),
    blade: () => get('blade', () => phys(0x15171f, 0.28, 0.1, { transparent: true, opacity: 0.9, clearcoat: 0.6, side: THREE.DoubleSide })),
    glow: (hex, i = 2.5) => get('g' + hex + '_' + i, () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: hex, emissiveIntensity: i, roughness: 0.4 })),
    rgb: (phase = 0, i = 2.6) => get('rgb' + phase, () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: i });
      rgbMats.push({ m, phase });
      return m;
    }),
  };
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function cyl(r, h, mat, x = 0, y = 0, z = 0, parent, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// Text drawn onto a transparent canvas. lines: [{ text, size, weight, color, font, y }]
function textTex(w, h, lines, bg = null) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of lines) {
    g.font = `${l.weight || 700} ${l.size}px ${l.font || '"Chakra Petch", sans-serif'}`;
    g.fillStyle = l.color || '#fff';
    if (l.spacing) g.letterSpacing = l.spacing + 'px';
    g.fillText(l.text, l.x ?? w / 2, l.y ?? h / 2);
    g.letterSpacing = '0px';
  }
  return canvasTex(c);
}
function decal(tex, w, h, { glow = 0, parent, pos = [0, 0, 0], rot = [0, 0, 0], lit = false } = {}) {
  const mat = lit
    ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, metalness: 0.2, depthWrite: false })
    : new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(glow || 1, glow || 1, glow || 1) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.renderOrder = 2;
  if (parent) parent.add(m);
  return m;
}
const dotTex = (() => {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.85)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const rainbowTex = (() => {
  const c = makeCanvas(4, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  ['#ff2a6d', '#d300c5', '#7a3cff', '#05d9e8', '#7a3cff', '#d300c5', '#ff2a6d'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

// ---------------------------------------------------------------- fans
const spinners = [];
// A real fan blade: wider at the tip, pitched steeply at the root and flatter at
// the tip, and swept forward — built by bending a subdivided box.
const bladeGeos = new Map();
function bladeGeometry(size) {
  if (bladeGeos.has(size)) return bladeGeos.get(size);
  const L = size * 0.3, W = size * 0.15;
  const g = new THREE.BoxGeometry(L, W, size * 0.01, 12, 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), t = x / L + 0.5;
    let y = p.getY(i) * (0.7 + t * 0.55);
    let z = p.getZ(i) + Math.pow(p.getY(i) / W, 2) * size * 0.012; // slight cup
    const ang = 0.8 - t * 0.38;
    const ny = y * Math.cos(ang) - z * Math.sin(ang);
    const nz = y * Math.sin(ang) + z * Math.cos(ang);
    p.setXYZ(i, x, ny + t * t * size * 0.06, nz);
  }
  g.computeVertexNormals();
  bladeGeos.set(size, g);
  return g;
}
// plain: an ordinary black fan with no RGB (what's actually in the rig). capMat colours the hub sticker.
function makeFan(k, size, { phase = 0, speed = 9, ringColor = null, plain = false, capMat = null } = {}) {
  const g = new THREE.Group(); // spins around local Z
  const t = size * 0.21, fw = size * 0.075;
  const frame = k.plastic();
  box(size, fw, t, frame, 0, size / 2 - fw / 2, 0, g);
  box(size, fw, t, frame, 0, -size / 2 + fw / 2, 0, g);
  box(fw, size, t, frame, size / 2 - fw / 2, 0, 0, g);
  box(fw, size, t, frame, -size / 2 + fw / 2, 0, 0, g);
  // round shroud inside the square frame
  const shroudRing = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.47, size * 0.47, t * 0.96, 48, 1, true), frame);
  shroudRing.rotation.x = Math.PI / 2;
  shroudRing.material.side = THREE.DoubleSide;
  g.add(shroudRing);
  if (!plain) {
    const ringMat = ringColor ? k.glow(ringColor, 2.4) : k.rgb(phase);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.43, size * 0.018, 8, 64), ringMat);
    ring.position.z = t * 0.35;
    g.add(ring);
    const ring2 = ring.clone(); ring2.position.z = -t * 0.35; g.add(ring2);
  }
  const rotor = new THREE.Group();
  g.add(rotor);
  const hub = cyl(size * 0.13, t * 0.7, k.black(), 0, 0, 0, rotor);
  hub.rotation.x = Math.PI / 2;
  const cap = cyl(size * 0.09, t * 0.72, capMat || (plain ? k.black() : ringColor ? k.glow(ringColor, 1.2) : k.rgb(phase, 1.4)), 0, 0, 0.01, rotor);
  cap.rotation.x = Math.PI / 2;
  const bladeGeo = bladeGeometry(size);
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 9) * Math.PI * 2;
    const b = new THREE.Mesh(bladeGeo, plain ? k.black() : k.blade());
    b.position.x = size * 0.27;
    b.rotation.z = 0.18;
    pivot.add(b);
    rotor.add(pivot);
  }
  // four struts holding the motor, like a real fan frame
  for (let i = 0; i < 4; i++) {
    const s = box(size * 0.36, size * 0.022, size * 0.02, frame, 0, 0, -t * 0.42, g);
    s.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
    s.position.set(Math.cos(s.rotation.z) * size * 0.3, Math.sin(s.rotation.z) * size * 0.3, -t * 0.42);
  }
  // corner screws
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const sc = cyl(size * 0.022, t * 1.02, k.gunmetal(), sx * size * 0.43, sy * size * 0.43, 0, g, 10);
    sc.rotation.x = Math.PI / 2;
  }
  spinners.push({ obj: rotor, speed });
  return g;
}

// ---------------------------------------------------------------- PCB texture
function pcbTextures() {
  const PX = 40, W = Math.round(24.4 * PX), H = Math.round(30.5 * PX);
  const base = makeCanvas(W, H), glow = makeCanvas(W, H);
  const b = base.getContext('2d'), gl = glow.getContext('2d');
  b.fillStyle = '#1a222c'; b.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    b.fillStyle = `rgba(${40 + Math.random() * 30},${55 + Math.random() * 30},${70 + Math.random() * 30},${Math.random() * 0.08})`;
    b.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W, H);
  const P = (u, v) => [(u + 12.2) * PX, (15.25 - v) * PX];
  const trace = (pts, width = 2, bright = 0.45) => {
    for (const [ctx, style] of [[b, 'rgba(110,140,170,.75)'], [gl, `rgba(80,200,255,${Math.min(1, bright * 1.5)})`]]) {
      ctx.beginPath();
      ctx.moveTo(...P(...pts[0]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(...P(...pts[i]));
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
    }
  };
  // CPU -> memory bus
  for (let i = 0; i < 22; i++) {
    const v = 2.4 + i * 0.4, j = (i - 11) * 0.12;
    trace([[0.2, v], [-1.2, v], [-2, v + j], [-3.6, v + j]], 2, 0.55);
  }
  // CPU -> PCIe x16
  for (let i = 0; i < 18; i++) {
    const u = 1.2 + i * 0.34;
    trace([[u, 4.6], [u, 1.2 - (i % 3) * 0.2], [u + 0.4, 0.6], [u + 0.4, -2.0]], 2, 0.5);
  }
  // chipset links
  for (let i = 0; i < 10; i++) {
    const v = -7.3 - i * 0.35;
    trace([[-2.2, v], [0.5, v], [1.2, v + 0.7], [10.5, v + 0.7]], 1.6, 0.3);
  }
  for (let i = 0; i < 8; i++) trace([[-5 + i * 0.4, -7.4], [-5 + i * 0.4, -4], [-3 + i * 0.3, -2.5], [-3 + i * 0.3, 0.5]], 1.6, 0.28);
  // random fill
  for (let i = 0; i < 160; i++) {
    let u = -11.5 + Math.random() * 23, v = -14.5 + Math.random() * 29;
    const pts = [[u, v]];
    for (let s = 0; s < 3; s++) {
      if (Math.random() < 0.5) u += (Math.random() - 0.5) * 6; else v += (Math.random() - 0.5) * 6;
      pts.push([clamp(u, -12, 12), clamp(v, -15, 15)]);
    }
    trace(pts, 1.2, 0.12 + Math.random() * 0.12);
  }
  // silkscreen
  b.fillStyle = 'rgba(220,228,240,.75)';
  b.font = '600 34px "Share Tech Mono", monospace';
  b.fillText('B650 AORUS ELITE AX', ...P(-3, -14.3));
  b.font = '600 22px "Share Tech Mono", monospace';
  b.fillText('AM5', ...P(5.4, 10.9));
  b.fillText('PCIEX16', ...P(0.6, -3.5));
  b.fillText('DDR5_A2', ...P(-5.6, -1.4));
  b.fillText('M2A_CPU', ...P(-1.8, 3.1));
  for (const [u, v] of [[-11.3, 14.4], [-11.3, -1], [-11.3, -14.4], [10.9, 14.4], [10.9, -1], [10.9, -14.4], [0.9, 14.4], [0.9, -14.4]]) {
    const [x, y] = P(u, v);
    b.beginPath(); b.arc(x, y, 14, 0, Math.PI * 2); b.fillStyle = '#c9a85a'; b.fill();
    b.beginPath(); b.arc(x, y, 7, 0, Math.PI * 2); b.fillStyle = '#05060a'; b.fill();
  }
  return { map: canvasTex(base), glow: canvasTex(glow) };
}

// ---------------------------------------------------------------- parts registry
const parts = {};
const pickables = [];
const anchors = {};
const fadeables = []; // non-selectable things that fade on explode / selection

function collectMats(obj) {
  const set = new Set();
  obj.traverse((o) => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => set.add(m));
  });
  const mats = [...set];
  mats.forEach((m) => { m.userData.base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite }; });
  return mats;
}
function applyFade(mats, f) {
  for (const m of mats) {
    const base = m.userData.base;
    const faded = f < 0.995;
    const wantT = faded || base.transparent;
    if (m.transparent !== wantT) { m.transparent = wantT; m.needsUpdate = true; }
    m.opacity = base.opacity * f;
    m.depthWrite = base.depthWrite && f > 0.6;
  }
}

function addPart(id, group, cfg) {
  scene.add(group);
  group.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(group);
  const center = box3.getCenter(new THREE.Vector3());
  const size = box3.getSize(new THREE.Vector3());
  const p = {
    id, group, ...cfg,
    home: group.position.clone(),
    homeRot: group.rotation.clone(),
    offset: new THREE.Vector3(...cfg.offset),
    rot: new THREE.Vector3(...(cfg.rot || [0, 0, 0])),
    delay: cfg.delay || 0,
    subs: cfg.subs || [],
    localCenter: group.worldToLocal(center.clone()),
    halfH: size.y / 2,
    size,
    sel: 1, selTarget: 1,
    mats: collectMats(group),
    jitter: new THREE.Vector3(),
  };
  p.subs.forEach((s) => { s.home = s.obj.position.clone(); s.offset = new THREE.Vector3(...s.offset); });
  group.traverse((o) => { if (o.isMesh) { o.userData.partId = id; pickables.push(o); } });
  // floating label (shown when exploded)
  const el = document.createElement('div');
  el.className = 'label';
  el.style.setProperty('--c', cfg.color);
  el.innerHTML = `<b>●</b> ${cfg.short}`;
  el.addEventListener('click', (e) => { e.stopPropagation(); select(id); });
  p.label = new CSS2DObject(el);
  scene.add(p.label);
  parts[id] = p;
  return p;
}

// ---------------------------------------------------------------- layout (1 unit = 1 cm)
const MB = { x: 8.8, y: 6.75, z: -10 }; // motherboard centre; board surface at z ≈ -9.92

// ---- case shell (not selectable)
// Modelled on the real case: a dual-chamber "fish tank" with glass on the front and
// left side, a black steel frame, perforated top / bottom / right side, and the PSU
// hidden in the rear chamber behind the motherboard tray.
const CASE = { x0: -23, x1: 23, y0: -24, y1: 24, zBack: -24, zTray: -11.2, zGlass: 11.6 };
function buildCase() {
  const k = kit();
  const shell = new THREE.Group();
  const steel = phys(0x0c0d10, 0.48, 0.65, { roughnessMap: noiseTex, clearcoat: 0.2, clearcoatRoughness: 0.6 });
  const meshC = makeCanvas(256, 256), mg = meshC.getContext('2d');
  mg.fillStyle = '#fff'; mg.fillRect(0, 0, 256, 256);
  mg.fillStyle = '#000';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    mg.beginPath(); mg.arc(x * 16 + (y % 2) * 8 + 4, y * 16 + 8, 5.4, 0, Math.PI * 2); mg.fill();
  }
  const meshTex = new THREE.CanvasTexture(meshC);
  meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
  meshTex.repeat.set(7, 7);
  const perf = phys(0x111216, 0.5, 0.7, { alphaMap: meshTex, alphaTest: 0.5, side: THREE.DoubleSide });

  const { x0, x1, y0, y1, zBack, zTray, zGlass } = CASE;
  const W = x1 - x0, H = y1 - y0, D = zGlass - zBack, zMid = (zGlass + zBack) / 2;
  // frame rails along all 12 edges
  const r = 0.9;
  for (const y of [y0, y1]) for (const z of [zBack, zGlass]) box(W, r, r, steel, 0, y, z, shell);
  for (const x of [x0, x1]) for (const z of [zBack, zGlass]) box(r, H, r, steel, x, 0, z, shell);
  for (const x of [x0, x1]) for (const y of [y0, y1]) box(r, r, D, steel, x, y, zMid, shell);
  // perforated top, bottom and right side
  box(W, 0.3, D, perf, 0, y1, zMid, shell);
  box(W, 0.3, D, perf, 0, y0, zMid, shell);
  box(W, H, 0.3, perf, 0, 0, zBack, shell);
  // motherboard tray: solid behind the board, perforated behind the side intake fans
  box(29, H, 0.4, steel, 8.5, 0, zTray, shell);
  box(17, H, 0.4, perf, -14.5, 0, zTray, shell);
  // rear panel (I/O + PCIe brackets) and the solid front of the rear chamber
  box(0.4, H, D, steel, x1, 0, zMid, shell);
  box(0.4, H, zTray - zBack, steel, x0, 0, (zTray + zBack) / 2, shell);
  // bottom fan mounts (empty in the real build) — just the rails
  for (const x of [-14, 0, 14]) box(12, 0.25, 0.6, steel, x, y0 + 0.4, 6, shell);
  // feet
  for (const x of [-19, 19]) for (const z of [zBack + 4, zGlass - 4]) rbox(5, 1.2, 3, 0.4, k.black(), x, y0 - 0.8, z, shell);
  scene.add(shell);
  fadeables.push({ id: 'shell', obj: shell, mats: collectMats(shell), offset: new THREE.Vector3(0, 0, -20), min: 0.12, sel: 1, home: shell.position.clone() });

  // tempered glass: left side and front, with the green edge real glass has
  const glass = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb0b8, roughness: 0.03, metalness: 0.05, transparent: true, opacity: 0.08, depthWrite: false, clearcoat: 1, envMapIntensity: 1.3 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2fa37c, transparent: true, opacity: 0.6 });
  const pane = (w, h, d, x, y, z) => {
    box(w, h, d, glassMat, x, y, z, glass);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), edgeMat);
    e.position.set(x, y, z);
    glass.add(e);
  };
  pane(W - 1, H - 1, 0.4, 0, 0, zGlass);                        // left side glass
  pane(0.4, H - 1, zGlass - zTray, x0, 0, (zGlass + zTray) / 2); // front glass
  const streakC = makeCanvas(512, 512), sg2 = streakC.getContext('2d');
  const sgr = sg2.createLinearGradient(0, 0, 512, 512);
  sgr.addColorStop(0.18, 'rgba(255,255,255,0)'); sgr.addColorStop(0.3, 'rgba(255,255,255,.07)');
  sgr.addColorStop(0.36, 'rgba(255,255,255,.04)'); sgr.addColorStop(0.42, 'rgba(255,255,255,.05)');
  sgr.addColorStop(0.5, 'rgba(255,255,255,0)');
  sg2.fillStyle = sgr; sg2.fillRect(0, 0, 512, 512);
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, H - 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(streakC), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  streak.position.z = zGlass + 0.22;
  glass.add(streak);
  scene.add(glass);
  fadeables.push({ id: 'glass', obj: glass, mats: collectMats(glass), offset: new THREE.Vector3(-6, 10, 50), rot: new THREE.Vector3(0.3, -0.5, 0.12), min: 0, sel: 1, home: glass.position.clone() });
}

// ---- motherboard
function buildMotherboard() {
  const k = kit();
  const g = new THREE.Group();
  g.position.set(MB.x, MB.y, MB.z);
  const { map, glow } = pcbTextures();
  const top = new THREE.MeshPhysicalMaterial({
    map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.3,
    bumpMap: map, bumpScale: 1.2, clearcoat: 0.7, clearcoatRoughness: 0.35,
  });
  const edge = std(0x1a2026, 0.6, 0.3);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(24.4, 30.5, 0.16), [edge, edge, edge, edge, top, edge]));
  const S0 = 0.08;
  const B = (w, h, d, mat, u, v, lift = 0) => box(w, h, d, mat, u, v, S0 + d / 2 + lift, g);

  const heat = std(0x5b616c, 0.32, 0.95);
  const heatDark = std(0x2b3038, 0.35, 0.9);
  // CPU socket + retention
  B(5.6, 5.6, 0.45, k.darkMetal(), 3, 7.5);
  B(5.8, 0.4, 0.6, k.gunmetal(), 3, 10.4);
  B(5.8, 0.4, 0.6, k.gunmetal(), 3, 4.6);
  // VRM heatsinks
  B(11.6, 2.3, 2.2, heat, 2.8, 13.45);
  B(2.3, 10.5, 2.2, heat, 7.45, 7.25);
  for (let i = 0; i < 9; i++) B(0.18, 2.32, 0.2, heatDark, -2.4 + i * 1.3, 13.45, 2.2);
  for (let i = 0; i < 7; i++) B(2.32, 0.18, 0.2, heatDark, 7.45, 3 + i * 1.4, 2.2);

  // I/O shroud
  B(3.2, 14.3, 3.4, k.plastic(), 10.6, 8.1);

  const aorus = textTex(1024, 192, [{ text: 'AORUS', size: 140, color: '#ffffff', spacing: 18 }]);
  decal(aorus, 10, 1.9, { glow: 1.25, parent: g, pos: [10.6, 8.1, S0 + 3.41], rot: [0, 0, Math.PI / 2] });
  // DIMM slots (A1, A2, B1, B2) — sticks sit in A2 and B2
  [-4.0, -4.9, -5.8, -6.7].forEach((u, i) => {
    const m = i % 2 ? k.black() : std(0x3a3f48, 0.5, 0.5);
    B(0.62, 13.6, 0.85, m, u, 6);
    B(0.7, 0.6, 1.25, k.plastic(), u, 12.9);
  });
  // PCIe slots
  B(8.9, 0.75, 1.05, k.alu(), 4.95, -2.5);
  B(8.9, 0.7, 1.0, k.black(), 4.95, -8.5);
  B(8.9, 0.7, 1.0, k.black(), 4.95, -12.5);
  // M.2 connector
  B(0.5, 2.2, 0.5, k.black(), 6.4, 1.5);
  // chipset heatsink
  B(5.5, 5, 1.1, heat, -5, -10);
  const logo = textTex(512, 512, [{ text: '◆', size: 260, color: '#ff8a3d', y: 230 }, { text: 'AORUS', size: 72, color: '#e9eef7', y: 420, spacing: 8 }]);
  decal(logo, 3.6, 3.6, { glow: 1.5, parent: g, pos: [-5, -10, S0 + 1.11] });
  // 24-pin, CMOS battery, capacitors, headers
  B(1.0, 5.4, 1.4, k.black(), -11.5, 4);
  const bat = cyl(0.95, 0.3, k.alu(), -1.5, -6, S0 + 0.15, g);
  bat.rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const c = cyl(0.33, 1, std(0x23272e, 0.4, 0.7), -0.6, 3.3 + i * 1.05, S0 + 0.5, g, 14);
    c.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 6; i++) B(1.4, 0.5, 0.7, k.black(), -9 + i * 2.6, -14.6);
  // anchor for the 24-pin power feed
  anchors.mobo24 = new THREE.Object3D(); anchors.mobo24.position.set(-11.5, 4, 1.8); g.add(anchors.mobo24);
  return addPart('motherboard', g, {
    title: mbS.product || 'Motherboard', short: 'Motherboard', color: '#ff8a3d',
    offset: [0, 0, -7], delay: 0.05,
  });
}

// ---- CPU
function buildCPU() {
  const k = kit();
  const g = new THREE.Group();
  g.position.set(MB.x + 3, MB.y + 7.5, MB.z + 0.62);
  box(4, 4, 0.14, std(0x1e4734, 0.55, 0.25), 0, 0, 0, g);
  for (let i = 0; i < 10; i++) box(0.22, 0.12, 0.06, k.gold(), -1.6 + i * 0.36, -1.75, 0.1, g);
  // chiplets: CCD with stacked 3D V-Cache + I/O die
  box(1.15, 0.8, 0.12, k.glow(0xffa53d, 2.4), -0.75, 0.8, 0.13, g);
  box(1.0, 0.66, 0.06, k.glow(0xff5a2a, 3.4), -0.75, 0.8, 0.22, g);
  box(1.35, 1.75, 0.1, k.glow(0x3de1ff, 1.8), 0.7, -0.35, 0.12, g);
  const ihs = new THREE.Group();
  g.add(ihs);
  rbox(3.7, 3.7, 0.3, 0.08, k.alu(), 0, 0, 0.47, ihs);
  for (const [x, y] of [[-1.9, 1.3], [-1.9, -1.3], [1.9, 1.3], [1.9, -1.3]]) box(0.2, 0.6, 0.18, k.alu(), x, y, 0.38, ihs);
  const ihsTex = textTex(512, 512, [
    { text: 'AMD', size: 120, color: '#2b2f36', y: 150, spacing: 6 },
    { text: 'RYZEN 7', size: 64, color: '#2b2f36', y: 270 },
    { text: '7800X3D', size: 64, color: '#2b2f36', y: 350, weight: 600, font: '"Share Tech Mono", monospace' },
  ]);
  decal(ihsTex, 3.3, 3.3, { lit: true, parent: ihs, pos: [0, 0, 0.625] });
  anchors.cpu = new THREE.Object3D(); anchors.cpu.position.set(0, 0, 0.8); g.add(anchors.cpu);
  return addPart('cpu', g, {
    title: 'AMD Ryzen 7 7800X3D', short: 'CPU', color: '#ffb547',
    offset: [-3, 5, 12], rot: [0.5, -0.4, 0], delay: 0.14,
    subs: [{ obj: ihs, offset: [0, 0, 2.6] }],
  });
}

// ---- CPU cooler: dual-tower air cooler with 6 heat pipes and two black fans (from photos)
function buildCooler() {
  const k = kit();
  const g = new THREE.Group();
  g.position.set(MB.x + 3, MB.y + 7.5, -2);
  const nickel = phys(0xcfc8bd, 0.22, 1, { clearcoat: 0.3 });
  // cold plate + mounting
  box(4, 4, 0.5, k.copper(), 0, 0, -6.55, g);
  rbox(5, 5, 1, 0.15, nickel, 0, 0, -5.8, g);
  box(9.5, 1.2, 0.35, k.gunmetal(), 0, 0, -5.15, g);
  // six heat pipes, each a U running from the base up through both towers
  const pipeYs = [-5, -3, -1, 1, 3, 5];
  for (const y of pipeYs) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4, y, 6.5), new THREE.Vector3(-4, y, -3.6), new THREE.Vector3(-3.2, y, -5.1),
      new THREE.Vector3(0, y, -5.6), new THREE.Vector3(3.2, y, -5.1), new THREE.Vector3(4, y, -3.6), new THREE.Vector3(4, y, 6.5),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.3, 10, false), nickel));
  }
  // two fin stacks
  const finGeo = new THREE.BoxGeometry(5, 12.5, 0.05);
  const m4 = new THREE.Matrix4();
  for (const tx of [-4, 4]) {
    const fins = new THREE.InstancedMesh(finGeo, k.alu(), 38);
    for (let i = 0; i < 38; i++) { m4.makeTranslation(tx, 0, -4.4 + i * 0.28); fins.setMatrixAt(i, m4); }
    g.add(fins);
    // black top cover with the pipe ends poking through
    rbox(5.4, 12.9, 0.5, 0.18, k.black(), tx, 0, 6.35, g);
    for (const y of pipeYs) {
      const capEnd = cyl(0.34, 0.35, nickel, tx, y, 6.75, g, 14);
      capEnd.rotation.x = Math.PI / 2;
    }
  }
  // fans: one between the towers, one on the front tower
  const fanMid = makeFan(k, 12, { speed: 7, plain: true, capMat: std(0xd9d9d9, 0.5, 0.1) });
  fanMid.rotation.y = -Math.PI / 2;
  fanMid.position.set(0, 0, 0.9);
  g.add(fanMid);
  const fanFront = makeFan(k, 12, { speed: 7, plain: true, capMat: std(0xd9d9d9, 0.5, 0.1) });
  fanFront.rotation.y = -Math.PI / 2;
  fanFront.position.set(-7.8, 0, 1.9);
  g.add(fanFront);
  return addPart('cooler', g, {
    title: MY_PARTS.cooler || 'Dual-tower CPU air cooler', short: 'Cooler', color: '#7a9cff',
    offset: [3, 13, 28], rot: [0, 1.15, 0.1], delay: 0.02,
  });
}

// ---- RAM: G.Skill Flare X5 — black heat spreaders, no RGB (from photos)
function buildRAM(i, x) {
  const k = kit();
  const g = new THREE.Group();
  g.position.set(x, MB.y + 6, -7.8);
  box(0.12, 13.3, 3.0, std(0x1b4a33, 0.6, 0.2), 0, 0, -0.15, g);
  const spreader = phys(0x101115, 0.42, 0.7, { roughnessMap: noiseTex, clearcoat: 0.25 });
  for (const s of [-1, 1]) box(0.15, 13.4, 3.3, spreader, s * 0.16, 0, 0.05, g);
  box(0.47, 13.4, 0.14, spreader, 0, 0, 1.68, g);
  // side print: "G.SKILL" and "FLARE X5" with the red X
  const c = makeCanvas(1024, 160), cg = c.getContext('2d');
  cg.textBaseline = 'middle';
  cg.font = `700 60px ${FONT_UI}`; cg.fillStyle = '#c9ccd2'; cg.fillText('G.SKILL', 40, 80);
  cg.font = `italic 700 78px ${FONT_UI}`;
  let px = 560;
  for (const [ch, col] of [['F', '#e8e8ea'], ['L', '#e8e8ea'], ['A', '#e8e8ea'], ['R', '#e8e8ea'], ['E', '#e8e8ea'], [' ', '#fff'], ['X', '#e0182d'], [' ', '#fff'], ['5', '#e8e8ea']]) {
    cg.fillStyle = col; cg.fillText(ch, px, 82); px += cg.measureText(ch).width + 4;
  }
  const side = canvasTex(c);
  for (const s of [-1, 1]) decal(side, 12.8, 2.0, { lit: true, parent: g, pos: [s * 0.245, 0, 0.25], rot: [0, s * Math.PI / 2, Math.PI / 2] });
  anchors['ram' + i] = new THREE.Object3D(); anchors['ram' + i].position.set(0, 0, 1.9); g.add(anchors['ram' + i]);
  return addPart('ram' + i, g, {
    title: `G.Skill Flare X5 · 16 GB (stick ${i})`, short: 'RAM ' + i, color: '#ff3df0', info: 'ram',
    offset: i === 1 ? [-7, 9, 13] : [-13, 6, 17], rot: [0, 0.75, i === 1 ? 0.12 : -0.1], delay: i === 1 ? 0.1 : 0.15,
  });
}

// ---- GPU: dark shroud, exposed fins along the edge, backlit "GEFORCE RTX" by the bracket (from photos)
function buildGPU() {
  const k = kit();
  const g = new THREE.Group();
  g.position.set(8, 2.2, -3.6);
  const shroud = phys(0x24272d, 0.4, 0.75, { roughnessMap: noiseTex, clearcoat: 0.3 });
  rbox(27, 4.4, 12, 0.5, shroud, 0, -0.4, 0, g);
  box(26.6, 0.35, 11.6, phys(0x2c3037, 0.32, 0.95, { roughnessMap: brushedTex, anisotropy: 0.6 }), 0, 2.0, 0, g);
  // silver trim on the visible edge
  box(27.05, 0.28, 0.2, k.gunmetal(), 0, 1.45, 5.95, g);
  box(27.05, 0.28, 0.2, k.gunmetal(), 0, -2.35, 5.95, g);
  // exposed heatsink fins visible along the top edge
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 2.6, 0.5), phys(0x4a4e55, 0.58, 0.85, { roughnessMap: noiseTex }), 110);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 110; i++) { m4.makeTranslation(-12.5 + i * 0.16, -0.5, 6.0); fins.setMatrixAt(i, m4); }
  g.add(fins);
  // backlit logo near the bracket end, white with a cool blue tint
  const rtx = textTex(1024, 128, [{ text: 'GEFORCE RTX', size: 100, color: '#dbe6ff', spacing: 10 }]);
  box(10.2, 1.5, 0.08, k.black(), 7.2, -0.5, 6.22, g);
  decal(rtx, 9.4, 1.18, { glow: 1.5, parent: g, pos: [7.2, -0.5, 6.28] });
  const logoLight = new THREE.PointLight(0x9fb8ff, 10, 14, 2);
  logoLight.position.set(7.2, -0.5, 8);
  g.add(logoLight);
  // fans face down
  const fanSpeed = ((gpuS.fanPercent ?? 30) / 100) * 28;
  for (const fx of [-7, 4]) {
    const f = makeFan(k, 9.6, { speed: fanSpeed, plain: true, capMat: k.gunmetal() });
    f.rotation.x = Math.PI / 2;
    f.position.set(fx, -2.7, 0);
    g.add(f);
  }
  // rear bracket with vent cut-outs + ports
  box(0.15, 5.4, 12.4, k.alu(), 13.6, 0, 0, g);
  for (let i = 0; i < 4; i++) box(0.4, 1.2, 1.8, k.black(), 13.8, 0.4, -4 + i * 2.6, g);
  // power connector (the braided cable plugs in here)
  box(2.2, 1.0, 0.8, k.black(), 3, -1.6, 6.3, g);
  anchors.gpuPower = new THREE.Object3D(); anchors.gpuPower.position.set(3, -1.6, 6.8); g.add(anchors.gpuPower);
  anchors.gpu = new THREE.Object3D(); anchors.gpu.position.set(5.75, 2.1, -5.5); g.add(anchors.gpu);
  return addPart('gpu', g, {
    title: gpuS.name || 'Graphics card', short: 'GPU', color: '#8dff5a',
    offset: [-5, -15, 22], rot: [-1.15, 0.15, 0], delay: 0.06,
  });
}

// ---- NVMe SSD
function buildSSD() {
  const k = kit();
  const g = new THREE.Group();
  g.position.set(MB.x + 2.1, MB.y + 1.5, MB.z + 0.5);
  box(8, 2.2, 0.1, std(0x0b1020, 0.55, 0.3), 0, 0, 0, g);
  box(1.4, 1.4, 0.16, k.black(), 2.5, 0, 0.13, g);
  box(2, 1.6, 0.16, k.black(), 0, 0, 0.13, g);
  box(2, 1.6, 0.16, k.black(), -2.4, 0, 0.13, g);
  box(0.35, 2, 0.11, k.gold(), 3.9, 0, 0, g);
  const lbl = textTex(1024, 280, [
    { text: 'KLEVV', size: 92, color: '#ffffff', x: 190, y: 110, spacing: 6 },
    { text: 'CRAS C910G', size: 54, color: '#ff5470', x: 190, y: 200, weight: 600 },
    { text: '1TB · NVMe', size: 60, color: '#c7cfdb', x: 720, y: 150, weight: 600, font: '"Share Tech Mono", monospace' },
  ], '#1a1d24');
  decal(lbl, 7.2, 1.97, { lit: true, parent: g, pos: [-0.2, 0, 0.23] });
  anchors.ssd = new THREE.Object3D(); anchors.ssd.position.set(0, 0, 0.4); g.add(anchors.ssd);
  return addPart('ssd', g, {
    title: stS.name || 'NVMe SSD', short: 'SSD', color: '#ffb547',
    offset: [-7, -3, 15], rot: [0.6, 0.3, 0], delay: 0.17,
  });
}

// ---- PSU (model unknown) — lives in the rear chamber, behind the motherboard tray
function buildPSU() {
  const k = kit();
  const g = new THREE.Group();
  g.position.set(14.5, -14, -17.6);
  rbox(14, 15, 8.6, 0.4, phys(0x0e0f12, 0.55, 0.55, { roughnessMap: noiseTex }), 0, 0, 0, g);
  const t = textTex(1024, 512, [
    { text: 'POWER', size: 120, color: '#f2f5fa', y: 190, spacing: 20 },
    { text: MY_PARTS.psu || 'SUPPLY', size: MY_PARTS.psu ? 56 : 120, color: '#ff4d6d', y: 320, spacing: MY_PARTS.psu ? 2 : 20 },
  ]);
  decal(t, 10, 5, { glow: 1.1, parent: g, pos: [0, 0.5, 4.32] });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) box(0.3, 1.2, 2.2, k.black(), -7.1, 4.5 - r * 2.2, -1.6 + c * 3.2, g);
  anchors.psu = new THREE.Object3D(); anchors.psu.position.set(-6, 7.6, 4.3); g.add(anchors.psu);
  return addPart('psu', g, {
    title: MY_PARTS.psu || 'Power supply', short: 'PSU', color: '#ff4d6d',
    offset: [6, -4, 40], rot: [0.1, -0.55, 0], delay: 0.08,
  });
}

// ---- case fans: three plain black 120 mm fans on the tray beside the motherboard,
// pulling air in through the perforated right side panel (from photos)
function buildFans() {
  const kF = kit();
  const col = new THREE.Group();
  col.position.set(-14.5, 2.5, -9.6);
  const hubSticker = phys(0x8a3a28, 0.45, 0.4, { clearcoat: 0.4 });
  [12.5, 0, -12.5].forEach((y) => {
    const f = makeFan(kF, 12, { speed: 9, plain: true, capMat: hubSticker });
    f.rotation.y = Math.PI; // exhaust side (struts + motor) faces the glass
    f.position.y = y;
    col.add(f);
  });
  addPart('frontFans', col, {
    title: MY_PARTS.fans || 'Side intake fans', short: 'Intake fans', color: '#3de1ff', info: 'fans',
    offset: [-12, 4, 22], rot: [0, 0.3, 0], delay: 0.04,
  });
}

// ---- cables (fade away when exploded)
function buildCables() {
  const grp = new THREE.Group();
  // braided grey GPU power cable
  const braid = makeCanvas(128, 128), bg = braid.getContext('2d');
  bg.fillStyle = '#5e6168'; bg.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 256; i += 10) {
    bg.strokeStyle = 'rgba(220,224,230,.55)'; bg.lineWidth = 3;
    bg.beginPath(); bg.moveTo(i, 0); bg.lineTo(i + 128, 128); bg.stroke();
    bg.strokeStyle = 'rgba(20,22,26,.6)';
    bg.beginPath(); bg.moveTo(i + 128, 0); bg.lineTo(i, 128); bg.stroke();
  }
  const braidTex = new THREE.CanvasTexture(braid);
  braidTex.colorSpace = THREE.SRGBColorSpace;
  braidTex.wrapS = braidTex.wrapT = THREE.RepeatWrapping;
  braidTex.repeat.set(40, 2);
  const braidMat = std(0xffffff, 0.75, 0.15, { map: braidTex, bumpMap: braidTex, bumpScale: 0.6 });
  const blackMat = std(0x0d0e11, 0.55, 0.2);
  const tube = (pts, r, mat) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 12, false), mat));
  };
  tube([[1.5, -17, -11.4], [2, -15.5, -6], [4.5, -11, 2.5], [8.5, -5, 4.6], [11, -0.7, 3.6], [11, 0.6, 3.25]], 0.62, braidMat);
  // black 24-pin ribbon from the board edge into the tray grommet
  for (let i = 0; i < 8; i++) {
    const y = 8.6 + i * 0.55;
    tube([[-2.4, y, -8.9], [-4.6, y + 0.2, -8.5], [-6.2, y + 0.4, -10.1], [-6.6, y + 0.4, -11.6]], 0.17, blackMat);
  }
  // CPU power (EPS) at the top edge
  tube([[7.8, 21.7, -9.3], [7.8, 23.0, -10.2], [7.8, 23.1, -11.6]], 0.4, blackMat);
  scene.add(grp);
  fadeables.push({ id: 'cables', obj: grp, mats: collectMats(grp), offset: new THREE.Vector3(), min: 0, sel: 1, home: grp.position.clone() });
}

buildCase();
buildMotherboard();
buildCPU();
buildCooler();
buildRAM(1, MB.x - 4.9);
buildRAM(2, MB.x - 6.7);
buildGPU();
buildSSD();
buildPSU();
buildFans();
buildCables();

// ---------------------------------------------------------------- environment
const FLOOR_Y = -25.6;
const signs = [];
const rain = {};
const splashes = [];
{
  // --- wet street: a mirror underneath, with rough asphalt on top that has puddle holes in it
  const puddleC = makeCanvas(1024, 1024), pg = puddleC.getContext('2d');
  pg.fillStyle = '#e6e6e6'; pg.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 30 + Math.random() * 150;
    const gr = pg.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(0.6, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    pg.fillStyle = gr;
    pg.beginPath(); pg.ellipse(x, y, r, r * (0.4 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2); pg.fill();
  }
  for (let i = 0; i < 40000; i++) { const v = Math.random() * 255; pg.fillStyle = `rgba(${v},${v},${v},.18)`; pg.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2); }
  const puddleTex = dataTex(puddleC, 5);

  if (!LOW) {
    const mirror = new Reflector(new THREE.PlaneGeometry(1400, 1400), {
      clipBias: 0.003,
      textureWidth: Math.floor(innerWidth * 0.6),
      textureHeight: Math.floor(innerHeight * 0.6),
      color: 0x6a6476,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = FLOOR_Y - 0.02;
    scene.add(mirror);
  }
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({
      color: 0x040308, roughness: 0.7, metalness: 0.3, roughnessMap: noiseTex,
      alphaMap: LOW ? null : puddleTex, transparent: !LOW, opacity: LOW ? 1 : 0.94, depthWrite: true,
    })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = FLOOR_Y;
  asphalt.receiveShadow = true;
  scene.add(asphalt);
  const grid = new THREE.GridHelper(1400, 230, 0xff2a6d, 0x3a1550);
  grid.position.y = FLOOR_Y + 0.03;
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  grid.material.depthWrite = false;
  scene.add(grid);

  // --- lighting: soft purple ambience, a shadow-casting key light, neon rims
  scene.add(new THREE.HemisphereLight(0x4a2a8a, 0x05010a, 0.3));
  const key = new THREE.SpotLight(0xf0e8ff, 16000, 0, 0.36, 0.7, 2);
  key.position.set(34, 100, 72);
  key.target.position.set(2, -6, 0);
  key.castShadow = !LOW;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.03;
  key.shadow.camera.near = 50;
  key.shadow.camera.far = 260;
  scene.add(key, key.target);
  const rimL = new THREE.DirectionalLight(0xff2a6d, 2.2);
  rimL.position.set(-90, 30, -50);
  const rimR = new THREE.DirectionalLight(0x05d9e8, 1.8);
  rimR.position.set(95, 22, 20);
  scene.add(rimL, rimR);
  const pl = (c, i, x, y, z) => { const l = new THREE.PointLight(c, i, 0, 2); l.position.set(x, y, z); scene.add(l); };
  pl(0xdfe6ff, 70, -12, 8, 2);      // soft cool light inside the case
  pl(0xff2a6d, 60, 3, 14, 6);       // a little neon spill through the glass
  pl(0x7a3cff, 90, 2, -14, 6);

  pl(0xe6dcff, 200, -2, 12, 22);
  pl(0xbfd6ff, 180, 8, -8, 9);
  pl(0xff2a6d, 240, -34, -20, 34);   // magenta spill on the street
  pl(0x05d9e8, 220, 44, -20, 24);    // cyan spill on the street

  // --- city skyline in the haze
  const winC = makeCanvas(128, 256), wg = winC.getContext('2d');
  wg.fillStyle = '#000'; wg.fillRect(0, 0, 128, 256);
  const winCols = ['#ff2a6d', '#05d9e8', '#f9f002', '#d300c5', '#ffd9a8', '#ffd9a8', '#ffd9a8'];
  for (let y = 4; y < 256; y += 8) for (let x = 4; x < 128; x += 8) {
    if (Math.random() < 0.22) { wg.fillStyle = winCols[(Math.random() * winCols.length) | 0]; wg.globalAlpha = 0.4 + Math.random() * 0.6; wg.fillRect(x, y, 4, 4); }
  }
  wg.globalAlpha = 1;
  const winTex = canvasTex(winC);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  for (let i = 0; i < 64; i++) {
    const ang = (i / 64) * Math.PI * 2 + Math.random() * 0.08;
    const r = 400 + Math.random() * 220, h = 70 + Math.random() * 300, w = 24 + Math.random() * 40;
    const tex = winTex.clone(); tex.needsUpdate = true; tex.repeat.set(w / 24, h / 48);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: 0x07050e, roughness: 0.6, metalness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }));
    b.position.set(Math.cos(ang) * r, FLOOR_Y + h / 2, Math.sin(ang) * r);
    b.lookAt(0, b.position.y, 0);
    scene.add(b);
    if (Math.random() < 0.35) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.8, h * 0.6, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color([0xff2a6d, 0x05d9e8, 0xd300c5][i % 3]).multiplyScalar(3) }));
      strip.position.set(b.position.x * 0.94, FLOOR_Y + h * 0.55, b.position.z * 0.94);
      scene.add(strip);
    }
  }

  // --- neon signs (some flicker)
  const sign = (lines, w, h, pos, color, { vertical = false, flicker = false, scale = 2.6 } = {}) => {
    const cw = vertical ? 256 : 1024, ch = vertical ? 1024 : 256;
    const c = makeCanvas(cw, ch), g = c.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 28;
    g.strokeStyle = color; g.lineWidth = 10; g.strokeRect(14, 14, cw - 28, ch - 28);
    g.fillStyle = '#ffffff';
    lines.forEach((l, i) => {
      g.font = `${l.weight || 900} ${l.size}px ${l.font || FONT_DISPLAY}`;
      const y = vertical ? ch / 2 + (i - (lines.length - 1) / 2) * l.size * 1.05 : ch / 2 + (i - (lines.length - 1) / 2) * l.size * 1.1;
      g.fillStyle = color; g.fillText(l.text, cw / 2, y);
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(l.text, cw / 2, y); g.shadowBlur = 28;
    });
    const mat = new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(scale, scale, scale), fog: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos);
    m.lookAt(0, pos[1], 0);
    m.rotateY(Math.PI); // face the text toward the PC, not away from it
    scene.add(m);
    signs.push({ m, base: scale, flicker, seed: Math.random() * 100, off: 0 });
  };
  sign([{ text: '電', size: 380, font: 'sans-serif' }, { text: '脳', size: 380, font: 'sans-serif' }], 52, 208, [-190, 80, -215], '#ff2a6d', { vertical: true, flicker: true, scale: 3.2 });
  sign([{ text: 'STAIRFAMILY21', size: 120 }], 184, 46, [150, 125, -300], '#05d9e8', { scale: 3.2 });
  sign([{ text: 'OVERCLOCK', size: 140 }], 140, 35, [-80, 175, -360], '#f9f002', { flicker: true, scale: 2.8 });
  sign([{ text: 'ネ', size: 300, font: 'sans-serif' }, { text: 'オ', size: 300, font: 'sans-serif' }, { text: 'ン', size: 300, font: 'sans-serif' }], 36, 144, [260, 50, -140], '#d300c5', { vertical: true, flicker: true, scale: 3.2 });
  sign([{ text: '7800X3D', size: 150 }], 112, 28, [-300, 100, -40], '#ff2a6d', { scale: 3 });
  sign([{ text: 'OPEN 24/7', size: 150, font: FONT_UI, weight: 700 }], 80, 20, [270, 2, 70], '#05d9e8', { flicker: true, scale: 3 });

  // --- rain: falling streaks, plus little splash rings where it lands
  const N = LOW ? 1200 : 4000;
  const pos = new Float32Array(N * 6);
  const speed = new Float32Array(N);
  const spawn = (i, y) => {
    const x = (Math.random() - 0.5) * 460, z = (Math.random() - 0.5) * 460;
    const len = 2.2 + Math.random() * 2.2;
    pos.set([x, y, z, x + 0.25, y + len, z], i * 6);
    speed[i] = 70 + Math.random() * 40;
  };
  for (let i = 0; i < N; i++) spawn(i, FLOOR_Y + Math.random() * 160);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rainLines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8b8ff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
  rainLines.frustumCulled = false;
  scene.add(rainLines);
  Object.assign(rain, { N, pos, speed, spawn, geo: rg });

  const ringGeo = new THREE.RingGeometry(0.7, 0.85, 24);
  for (let i = 0; i < (LOW ? 20 : 60); i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xc8d4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = FLOOR_Y + 0.06;
    m.visible = false;
    scene.add(m);
    splashes.push({ m, life: 1 });
  }
}

// real shadows: solid parts cast and receive them
scene.traverse((o) => {
  if (!o.isMesh) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (mats.some((m) => m.transparent || m.isMeshBasicMaterial || (m.emissiveIntensity > 1.5 && m.color && m.color.getHex() === 0))) return;
  o.castShadow = true;
  o.receiveShadow = true;
});

function updateWorld(dt, time) {
  // rain
  const { N, pos, speed, spawn, geo } = rain;
  for (let i = 0; i < N; i++) {
    const d = speed[i] * dt;
    pos[i * 6 + 1] -= d; pos[i * 6 + 4] -= d;
    pos[i * 6] -= d * 0.06; pos[i * 6 + 3] -= d * 0.06;
    if (pos[i * 6 + 1] < FLOOR_Y) spawn(i, FLOOR_Y + 120 + Math.random() * 40);
  }
  geo.attributes.position.needsUpdate = true;
  // splashes near the PC
  for (const s of splashes) {
    if (s.life >= 1) {
      if (Math.random() < dt * 3.5) {
        s.life = 0;
        s.m.visible = true;
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 90;
        s.m.position.x = Math.cos(a) * r;
        s.m.position.z = Math.sin(a) * r;
      }
      continue;
    }
    s.life += dt * 1.8;
    s.m.scale.setScalar(0.3 + s.life * 3.2);
    s.m.material.opacity = (1 - s.life) * 0.5;
    if (s.life >= 1) s.m.visible = false;
  }
  // flickering neon
  for (const s of signs) {
    let k = s.base;
    if (s.flicker) {
      if (s.off > 0) { s.off -= dt; k *= 0.12; }
      else if (Math.random() < dt * 0.35) s.off = 0.05 + Math.random() * 0.18;
      k *= 0.92 + 0.08 * Math.sin(time * 60 + s.seed);
    }
    s.m.material.color.setScalar(k);
  }
}

// ---------------------------------------------------------------- data flows between parts
const flows = [];
function flow(a, pa, b, pb, color, load, oneWay = false) {
  load = clamp(has(load) ? load : 0.2);
  const count = 12 + Math.round(load * 30);
  const pos = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.95, map: dotTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(41 * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts, line);
  const f = {
    a, b, pa, pb, pts, line, count, oneWay,
    speed: 0.16 + load * 0.75,
    seeds: Array.from({ length: count }, () => Math.random()),
    curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
    baseOpacity: [1, 0.22],
  };
  flows.push(f);
}
const memLoad = has(memS.usedGB) ? memS.usedGB / memS.totalGB : null;
flow(anchors.cpu, 'cpu', anchors.ram1, 'ram1', 0xff5cf4, memLoad);
flow(anchors.cpu, 'cpu', anchors.ram2, 'ram2', 0xff5cf4, memLoad);
flow(anchors.cpu, 'cpu', anchors.gpu, 'gpu', 0x8dff5a, has(gpuS.utilization) ? gpuS.utilization / 100 : null);
flow(anchors.cpu, 'cpu', anchors.ssd, 'ssd', 0xffb547, has(stS.busyPercent) ? stS.busyPercent / 100 : null);
flow(anchors.psu, 'psu', anchors.gpuPower, 'gpu', 0xff4d6d, has(gpuS.powerW) ? gpuS.powerW / gpuS.powerLimitW : null, true);
flow(anchors.psu, 'psu', anchors.mobo24, 'motherboard', 0xff4d6d, 0.25, true);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3();
function updateFlows(time) {
  for (const f of flows) {
    f.a.getWorldPosition(_a);
    f.b.getWorldPosition(_b);
    const d = _a.distanceTo(_b);
    _m.addVectors(_a, _b).multiplyScalar(0.5);
    _m.z += 3 + d * 0.28;
    _m.y += d * 0.08;
    f.curve.v0.copy(_a); f.curve.v1.copy(_m); f.curve.v2.copy(_b);
    const arr = f.pts.geometry.attributes.position.array;
    for (let i = 0; i < f.count; i++) {
      let t = (f.seeds[i] + time * f.speed * (0.8 + f.seeds[i] * 0.4)) % 1;
      if (!f.oneWay && i % 2) t = 1 - t;
      f.curve.getPoint(t, _p);
      arr[i * 3] = _p.x; arr[i * 3 + 1] = _p.y; arr[i * 3 + 2] = _p.z;
    }
    f.pts.geometry.attributes.position.needsUpdate = true;
    f.pts.geometry.computeBoundingSphere();
    const la = f.line.geometry.attributes.position.array;
    for (let i = 0; i <= 40; i++) { f.curve.getPoint(i / 40, _p); la[i * 3] = _p.x; la[i * 3 + 1] = _p.y; la[i * 3 + 2] = _p.z; }
    f.line.geometry.attributes.position.needsUpdate = true;
    f.line.geometry.computeBoundingSphere();
    const vis = Math.max(parts[f.pa].sel, parts[f.pb].sel);
    f.pts.material.opacity = vis;
    f.line.material.opacity = 0.22 * vis;
  }
}

// ---------------------------------------------------------------- tweens + camera moves
const tweens = [];
function tween(dur, onUpdate, onDone, ease = easeInOutCubic) {
  const tw = { t: 0, dur, onUpdate, onDone, ease };
  tweens.push(tw);
  return tw;
}
function killTween(tw) { const i = tweens.indexOf(tw); if (i >= 0) tweens.splice(i, 1); }
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(tw.t / tw.dur, 1);
    tw.onUpdate(tw.ease(k), k);
    if (k >= 1) { tweens.splice(i, 1); tw.onDone && tw.onDone(); }
  }
}

const VIEWS = {
  home: { dir: new THREE.Vector3(46, 16, 80).normalize(), dist: 104, target: new THREE.Vector3(1, -2, 0) },
  exploded: { dir: new THREE.Vector3(52, 24, 118).normalize(), dist: 150, target: new THREE.Vector3(-1, 0, 6) },
};
function fitFactor() { const a = camera.aspect; return Number.isFinite(a) && a > 0 ? Math.min(2.4, Math.max(1, 1.15 / a)) : 1; }
function viewPos(v) { return v.target.clone().addScaledVector(v.dir, Math.min(v.dist * fitFactor(), controls.maxDistance - 5)); }

let camTween = null;
function flyTo(pos, target, dur = 1.4) {
  if (camTween) killTween(camTween);
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  camTween = tween(dur, (e) => {
    camera.position.lerpVectors(p0, pos, e);
    controls.target.lerpVectors(t0, target, e);
  }, () => { camTween = null; });
}

// ---------------------------------------------------------------- explode
let explodeT = 0, exploded = false, busy = false, exploding = true, charge = 0;
const btn = $('explode');

function partLocal(p) {
  const l = clamp((explodeT - p.delay) / (1 - p.delay));
  return exploding ? easeOutBack(l) : easeInOutCubic(l);
}

function applyExplode(time) {
  for (const p of Object.values(parts)) {
    const l = partLocal(p);
    p.group.position.copy(p.home).addScaledVector(p.offset, l);
    p.group.rotation.set(p.homeRot.x + p.rot.x * l, p.homeRot.y + p.rot.y * l, p.homeRot.z + p.rot.z * l);
    if (exploded || explodeT > 0) p.group.position.y += Math.sin(time * 0.9 + p.delay * 40) * 0.35 * clamp(l);
    if (charge > 0) {
      p.jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(charge * 0.45);
      p.group.position.add(p.jitter);
    }
    for (const s of p.subs) s.obj.position.copy(s.home).addScaledVector(s.offset, l);
  }
  for (const f of fadeables) {
    const l = clamp(exploding ? easeOutCubic(explodeT) : easeInOutCubic(explodeT));
    f.obj.position.copy(f.home).addScaledVector(f.offset, l);
    if (f.rot) f.obj.rotation.set(f.rot.x * l, f.rot.y * l, f.rot.z * l);
    f.fadeE = 1 - l * (1 - f.min);
  }
}

function toggleExplode() {
  if (busy) return;
  busy = true;
  btn.disabled = true;
  if (selected) deselect(true);
  if (!exploded) {
    tween(0.55, (e) => { charge = e; bloom.strength = BLOOM + e * 1.3; }, () => {
      charge = 0;
      exploding = true;
      boom();
      flyTo(viewPos(VIEWS.exploded), VIEWS.exploded.target, 1.9);
      tween(1.9, (e) => { explodeT = e; }, () => { exploded = true; busy = false; btn.disabled = false; }, (k) => k);
      tween(1.4, (e) => { bloom.strength = BLOOM + 1.3 * (1 - e); }, null, easeOutCubic);
    }, (k) => k * k);
    setButton(true);
  } else {
    exploding = false;
    flyTo(viewPos(VIEWS.home), VIEWS.home.target, 1.5);
    tween(1.5, (e) => { explodeT = 1 - e; }, () => { exploded = false; busy = false; btn.disabled = false; }, (k) => k);
    setButton(false);
  }
}
function setButton(toExploded) {
  btn.querySelector('.txt').textContent = toExploded ? 'Reassemble' : 'Explode';
  document.body.classList.toggle('exploded', toExploded);
}

// explosion FX: flash, sparks, shockwave, camera shake
const sparks = [];
let shake = 0, glitch = 0;
const shakeOff = new THREE.Vector3();
function boom() {
  const fl = $('flash');
  fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  shake = 1;
  glitch = 1;
  const origin = new THREE.Vector3(6, 4, 0);
  const N = 520;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = [];
  const palette = [0xffffff, 0x3de1ff, 0xff3df0, 0xffb547, 0x8dff5a].map((h) => new THREE.Color(h));
  for (let i = 0; i < N; i++) {
    pos.set([origin.x, origin.y, origin.z], i * 3);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.3).normalize().multiplyScalar(25 + Math.random() * 70);
    vel.push(v);
    const c = palette[(Math.random() * palette.length) | 0];
    col.set([c.r * 2, c.g * 2, c.b * 2], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.4, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 3, 3.4), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.position.copy(origin);
  ring.lookAt(camera.position);
  scene.add(ring);
  sparks.push({ pts, vel, life: 0, ring });
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt;
    const arr = s.pts.geometry.attributes.position.array;
    for (let j = 0; j < s.vel.length; j++) {
      const v = s.vel[j];
      v.multiplyScalar(0.955);
      v.y -= 22 * dt;
      arr[j * 3] += v.x * dt; arr[j * 3 + 1] += v.y * dt; arr[j * 3 + 2] += v.z * dt;
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
    s.pts.material.opacity = clamp(1 - s.life / 1.8);
    const r = easeOutCubic(clamp(s.life / 1.0)) * 90 + 1;
    s.ring.scale.setScalar(r);
    s.ring.material.opacity = clamp(1 - s.life / 1.0);
    if (s.life > 1.9) {
      scene.remove(s.pts, s.ring);
      s.pts.geometry.dispose(); s.pts.material.dispose();
      s.ring.geometry.dispose(); s.ring.material.dispose();
      sparks.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- selection + info panel
let selected = null;
let viewShift = 0, viewShiftTarget = 0, viewShiftY = 0, viewShiftYTarget = 0;

function select(id) {
  const p = parts[id];
  if (!p || busy) return;
  selected = id;
  for (const q of Object.values(parts)) q.selTarget = q === p ? 1 : 0.08;
  p.group.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(p.group);
  const center = box3.getCenter(new THREE.Vector3());
  const radius = box3.getSize(new THREE.Vector3()).length() / 2;
  const dist = Math.max(radius * 2.6, 17) * fitFactor();
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyTo(center.clone().addScaledVector(dir, dist), center, 1.2);
  controls.autoRotate = true;
  showPanel(id);
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.id === (p.info === 'ram' ? 'ram1' : p.info === 'fans' ? 'frontFans' : id)));
}
function deselect(silent) {
  if (!selected) return;
  selected = null;
  for (const q of Object.values(parts)) q.selTarget = 1;
  controls.autoRotate = false;
  hidePanel();
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  if (!silent) {
    const v = exploded ? VIEWS.exploded : VIEWS.home;
    flyTo(viewPos(v), v.target, 1.2);
  }
}

const pct = (v) => (has(v) ? Math.round(v) + '%' : '—');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function meter(label, value, max, text, color) {
  const w = has(value) && max ? clamp(value / max) * 100 : 0;
  return `<div class="meter" style="--c:${color}"><div class="meter-top"><span>${label}</span><span>${has(value) ? text : '—'}</span></div><div class="track"><div class="fill" data-w="${w}"></div></div></div>`;
}
function specs(rows) {
  return `<dl class="specs">${rows.filter((r) => has(r[1])).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

const ramPart = (memS.modules && memS.modules[0] && memS.modules[0].partNumber) || '';
const ramMatch = ramPart.match(/F5-(\d{4})J(\d\d)(\d\d)F(\d+)G/);
const ramRated = ramMatch ? +ramMatch[1] : null;
const ramCL = ramMatch ? `CL${ramMatch[2]}-${ramMatch[3]}-${ramMatch[3]}` : null;
const ramRunning = memS.modules && memS.modules[0] ? memS.modules[0].speedMTs : null;

const INFO = {
  cpu: () => ({
    eyebrow: 'Processor · CPU', color: '#ffb547',
    title: 'AMD Ryzen 7 7800X3D',
    role: 'The brain. Every instruction your PC runs goes through here: game logic, physics, Windows, Discord, all of it. The “X3D” means AMD stacked an extra 64 MB of cache right on top of the cores, so the CPU waits on memory much less. That’s why this chip is one of the best gaming CPUs ever made.',
    now: [
      meter('Overall load', cpuS.load, 100, pct(cpuS.load), '#ffb547'),
      meter('Effective clock', cpuS.effectiveClockMHz, 5000, has(cpuS.effectiveClockMHz) ? (cpuS.effectiveClockMHz / 1000).toFixed(2) + ' GHz' : '', '#ffb547'),
    ].join('') + (cpuS.coreLoads && cpuS.coreLoads.length
      ? `<div class="cores" style="--c:#ffb547">${cpuS.coreLoads.map((v) => `<div style="--h:${clamp(v / 100) * 100}%" title="${Math.round(v)}%"></div>`).join('')}</div><p class="cores-cap">Load on each of the ${cpuS.coreLoads.length} threads</p>`
      : ''),
    specs: [
      ['Cores / threads', `${cpuS.cores || 8} / ${cpuS.threads || 16}`],
      ['Base clock', '4.2 GHz'],
      ['Max boost', '5.0 GHz'],
      ['L2 cache', cpuS.l2KB ? cpuS.l2KB / 1024 + ' MB' : '8 MB'],
      ['L3 cache', (cpuS.l3KB ? cpuS.l3KB / 1024 : 96) + ' MB (3D V-Cache)'],
      ['Architecture', 'Zen 4 · 5 nm'],
      ['Socket', 'AM5'],
      ['Power (TDP)', '120 W'],
      ['Built-in graphics', cpuS.integratedGraphics ? 'Radeon (2 CU)' : null],
    ],
    note: 'Fun fact: lift the lid (the silver heat spreader) in the exploded view and you can see the two chiplets. The orange one is the 8-core compute die with the stacked V-Cache, and the blue one is the I/O die that talks to RAM and PCIe.',
  }),
  cooler: () => ({
    eyebrow: 'Cooling', color: '#7a9cff',
    title: MY_PARTS.cooler || 'Dual-tower CPU air cooler',
    role: 'Pulls heat off the CPU. A copper base touches the processor, six heat pipes carry the heat up into two tall stacks of thin aluminum fins, and two fans push air through both. Without it the 7800X3D would hit its 89 °C limit in seconds and slow itself down.',
    now: '<p class="role" style="margin:0">Windows doesn’t report cooler speed or temperature without extra software.</p>',
    specs: [
      ['Model', MY_PARTS.cooler || 'Not reported by Windows'],
      ['Design', 'Dual tower · 6 heat pipes · 2 × 120 mm fans'],
      ['CPU thermal limit', '89 °C'],
      ['CPU heat output', 'up to ~120 W'],
    ],
    note: MY_PARTS.cooler ? null : 'Modelled from photos of the real build. Windows can’t detect the exact cooler model.',
  }),
  ram: () => ({
    eyebrow: 'Memory · RAM', color: '#ff3df0',
    title: `G.Skill Flare X5 DDR5-${ramRated || ''} ${ramCL ? ramCL.split('-')[0] : ''} · ${memS.modules ? memS.modules.length + ' × ' + memS.modules[0].capacityGB + ' GB' : ''}`,
    role: 'Short-term memory. Anything you have open (the game you’re playing, browser tabs, Windows itself) lives here so the CPU can get to it in nanoseconds. It forgets everything when the power goes off; long-term storage is the SSD’s job.',
    now: meter('In use (whole system)', memS.usedGB, memS.totalGB, `${memS.usedGB} / ${memS.totalGB} GB`, '#ff3df0'),
    specs: [
      ['Total', memS.modules ? memS.modules.reduce((a, m) => a + m.capacityGB, 0) + ' GB' : null],
      ['Sticks', memS.modules ? `${memS.modules.length} × ${memS.modules[0].capacityGB} GB (dual channel)` : null],
      ['Type', memS.modules ? memS.modules[0].type : null],
      ['Rated speed', ramRated ? ramRated + ' MT/s' : null],
      ['Running at', ramRunning ? ramRunning + ' MT/s' : null],
      ['Timings', ramCL],
      ['Part number', ramPart],
    ],
    note: ramRated && ramRunning && ramRunning < ramRated
      ? `<strong>Free performance left on the table:</strong> these sticks are rated for ${ramRated} MT/s but are running at ${ramRunning}, the safe default. Turning on <strong>EXPO</strong> in the BIOS (on Gigabyte boards it’s usually under <em>Tweaker → Extreme Memory Profile</em>) runs them at full speed.`
      : null,
    warn: !!(ramRated && ramRunning && ramRunning < ramRated),
  }),
  gpu: () => ({
    eyebrow: 'Graphics · GPU', color: '#8dff5a',
    title: gpuS.name || 'NVIDIA GeForce RTX 4070 SUPER',
    role: 'Draws every frame you see. It has thousands of small cores that work on pixels in parallel, plus dedicated hardware for ray-traced lighting and for DLSS, the AI upscaling that lets you get high frame rates at better quality.',
    now: [
      meter('GPU load', gpuS.utilization, 100, pct(gpuS.utilization), '#8dff5a'),
      meter('Video memory (VRAM)', gpuS.vramUsedMB, gpuS.vramTotalMB, has(gpuS.vramUsedMB) ? `${(gpuS.vramUsedMB / 1024).toFixed(1)} / ${(gpuS.vramTotalMB / 1024).toFixed(0)} GB` : '', '#8dff5a'),
      meter('Power draw', gpuS.powerW, gpuS.powerLimitW, has(gpuS.powerW) ? `${Math.round(gpuS.powerW)} / ${Math.round(gpuS.powerLimitW)} W` : '', '#8dff5a'),
      meter('Temperature', gpuS.tempC, 90, has(gpuS.tempC) ? gpuS.tempC + ' °C' : '', '#8dff5a'),
      meter('Core clock', gpuS.clockMHz, gpuS.maxClockMHz, has(gpuS.clockMHz) ? gpuS.clockMHz + ' MHz' : '', '#8dff5a'),
    ].join(''),
    specs: [
      ['CUDA cores', '7,168'],
      ['Memory', '12 GB GDDR6X · 192-bit'],
      ['Boost clock', '2,475 MHz'],
      ['Power limit', has(gpuS.powerLimitW) ? Math.round(gpuS.powerLimitW) + ' W' : '220 W'],
      ['Architecture', 'Ada Lovelace'],
      ['Driver', gpuS.driver],
      ['Driving', S.display ? `${S.display.width}×${S.display.height} @ ${S.display.hz} Hz` : null],
    ],
    note: gpuS.fanPercent === 0
      ? `Notice the fans aren’t spinning? That’s on purpose. At ${gpuS.tempC} °C the card is in <strong>zero-RPM mode</strong> and stays silent until it heats up under load.`
      : null,
  }),
  ssd: () => ({
    eyebrow: 'Storage · NVMe SSD', color: '#ffb547',
    title: stS.name || 'NVMe SSD',
    role: 'Long-term memory. Windows, your games and your files live here and stay put when the PC is off. It plugs straight into the motherboard and talks to the CPU over PCIe, which is why games load in seconds instead of minutes.',
    now: [
      meter('Space used (C:)', stS.cUsedGB, stS.cTotalGB, `${stS.cUsedGB} / ${stS.cTotalGB} GB`, '#ffb547'),
      meter('Activity', stS.busyPercent, 100, pct(stS.busyPercent), '#ffb547'),
    ].join(''),
    specs: [
      ['Capacity', stS.sizeGB ? (stS.sizeGB >= 1000 ? stS.sizeGB / 1000 + ' TB' : stS.sizeGB + ' GB') : null],
      ['Interface', 'M.2 2280 · PCIe 4.0 ×4'],
      ['Protocol', stS.bus],
      ['Read / write now', has(stS.readMBs) ? `${stS.readMBs} / ${stS.writeMBs} MB/s` : null],
    ],
    note: has(stS.cUsedGB) ? `You’ve only used ${Math.round((stS.cUsedGB / stS.cTotalGB) * 100)}% of it, so there’s plenty of room for more games.` : null,
  }),
  motherboard: () => ({
    eyebrow: 'Motherboard', color: '#ff8a3d',
    title: mbS.product ? 'Gigabyte ' + mbS.product : 'Motherboard',
    role: 'The city everything lives in. It delivers power to every part and carries the data between them on the copper traces you can see glowing. The CPU sits in the socket, RAM in the long slots, the GPU in the metal-reinforced PCIe slot, and the SSD in the M.2 slot.',
    now: '<p class="role" style="margin:0">The board has no single “usage” number. It’s the road every bit of data travels on. The glowing streams show traffic between the parts.</p>',
    specs: [
      ['Socket', 'AM5'],
      ['Chipset', 'AMD B650'],
      ['Form factor', 'ATX'],
      ['Memory slots', '4 × DDR5 (2 used)'],
      ['Networking', 'Wi-Fi 6E · 2.5 GbE'],
      ['BIOS version', mbS.bios],
    ],
    note: null,
  }),
  psu: () => ({
    eyebrow: 'Power supply · PSU', color: '#ff4d6d',
    title: MY_PARTS.psu || 'Power supply',
    role: 'Turns wall power into the clean 12 V, 5 V and 3.3 V everything inside runs on. The red streams show power flowing out to the motherboard and the graphics card, which is the hungriest part in the case.',
    now: meter('GPU share of power right now', gpuS.powerW, 650, has(gpuS.powerW) ? `${Math.round(gpuS.powerW)} W` : '', '#ff4d6d'),
    specs: [
      ['Model', MY_PARTS.psu || 'Not reported by Windows'],
      ['Recommended size', '650 W or more'],
      ['Biggest consumer', 'RTX 4070 SUPER (up to 220 W)'],
      ['CPU max', '~120 W'],
    ],
    note: MY_PARTS.psu ? null : 'Windows can’t see what PSU is installed, so this box is a stand-in. NVIDIA recommends at least 650 W for this graphics card.',
  }),
  fans: () => ({
    eyebrow: 'Airflow · Case fans', color: '#3de1ff',
    title: MY_PARTS.fans || 'Case fans',
    role: 'The lungs. These three fans pull cool air in through the perforated side panel and push it across the motherboard, cooler and graphics card. The warm air escapes out the top and back. Good airflow keeps everything cooler and quieter.',
    now: '<p class="role" style="margin:0">Fan speeds aren’t visible to Windows without the motherboard’s own software.</p>',
    specs: [
      ['Model', MY_PARTS.fans || 'Not reported by Windows'],
      ['Layout', '3 × side intake, stacked'],
      ['Size', '120 mm'],
      ['Lighting', 'None (plain black)'],
    ],
    note: MY_PARTS.fans ? null : 'Laid out from photos of the real build. Windows can’t detect the fan model.',
  }),
};

const captured = S.capturedAt ? new Date(S.capturedAt) : null;
const capturedText = captured ? captured.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown';

function showPanel(id) {
  const p = parts[id];
  const info = INFO[p.info || id]();
  const extra = p.info === 'ram' ? `<p class="cores-cap" style="margin-top:-12px">You picked stick ${id.slice(-1)} of ${memS.modules ? memS.modules.length : 2}.</p>` : '';
  $('panel-body').innerHTML = `
    <div class="eyebrow" style="--c:${info.color}">${info.eyebrow}</div>
    <h2>${esc(info.title)}</h2>
    ${extra}
    <p class="role">${info.role}</p>
    <h3>Right now <small>snapshot</small></h3>
    ${info.now}
    <h3>Specs</h3>
    ${specs(info.specs)}
    ${info.note ? `<div class="note${info.warn ? ' warn' : ''}">${info.note}</div>` : ''}
    <p class="stamp">Usage captured ${capturedText}. A website can’t read a PC live, so these numbers are a snapshot.</p>`;
  const panel = $('panel');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  panel.scrollTop = 0;
  document.body.classList.add('panel-open');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.querySelectorAll('.fill').forEach((f) => { f.style.width = f.dataset.w + '%'; });
  }));
  updateViewShiftTargets();
}
function hidePanel() {
  const panel = $('panel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
  viewShiftTarget = 0; viewShiftYTarget = 0;
}
function updateViewShiftTargets() {
  if (!selected) { viewShiftTarget = 0; viewShiftYTarget = 0; return; }
  if (innerWidth > 900) { viewShiftTarget = 190; viewShiftYTarget = 0; }
  else { viewShiftTarget = 0; viewShiftYTarget = innerHeight * 0.26; }
}

// part chips
const CHIPS = [
  ['cpu', 'CPU', '#ffb547'], ['cooler', 'Cooler', '#7a9cff'], ['ram1', 'RAM', '#ff3df0'], ['gpu', 'GPU', '#8dff5a'],
  ['ssd', 'SSD', '#ffb547'], ['motherboard', 'Motherboard', '#ff8a3d'], ['psu', 'PSU', '#ff4d6d'], ['frontFans', 'Fans', '#3de1ff'],
];
$('parts').innerHTML = CHIPS.map(([id, name, c]) => `<button class="chip" type="button" data-id="${id}" style="--c:${c}"><i></i>${name}</button>`).join('');
$('parts').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  if (selected === b.dataset.id) deselect(); else select(b.dataset.id);
});

// ---------------------------------------------------------------- pointer input
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = $('tip');
function pickAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(pickables, false)) {
    const p = parts[h.object.userData.partId];
    if (p && p.sel > 0.5) return p.id;
  }
  return null;
}
let down = null, hoverId = null, lastMove = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 600;
  down = null;
  if (moved > 6 || !quick) return;
  const id = pickAt(e.clientX, e.clientY);
  if (id) { if (id !== selected) select(id); }
  else if (selected) deselect();
});
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') lastMove = e; });
canvas.addEventListener('pointerleave', () => { lastMove = null; setHover(null); });
function setHover(id, e) {
  hoverId = id;
  document.body.classList.toggle('hovering', !!id);
  if (id && e) {
    tip.hidden = false;
    tip.textContent = parts[id].title;
    tip.style.left = e.clientX + 'px';
    tip.style.top = e.clientY + 'px';
  } else tip.hidden = true;
}

btn.addEventListener('click', toggleExplode);
$('reset').addEventListener('click', () => {
  if (selected) deselect(true);
  const v = exploded ? VIEWS.exploded : VIEWS.home;
  flyTo(viewPos(v), v.target, 1.2);
});
$('close').addEventListener('click', () => deselect());
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') deselect();
  if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && document.activeElement.tagName !== 'INPUT') toggleExplode();
});

addEventListener('resize', () => {
  camera.aspect = Math.max(1, innerWidth) / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  cyber.uniforms.resolution.value.set(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
  updateViewShiftTargets();
});

// footer
$('foot').innerHTML = `Specs &amp; usage snapshot: ${esc(capturedText)}<br>Built with three.js · <a href="https://github.com/stairfamily21-gif/stairfamily21-gif.github.io" target="_blank" rel="noopener">source</a>`;

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const _c = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  camera.position.sub(shakeOff);
  updateTweens(dt);
  applyExplode(time);

  // selection fades
  for (const p of Object.values(parts)) {
    p.sel += (p.selTarget - p.sel) * Math.min(1, dt * 7);
    applyFade(p.mats, p.sel);
  }
  for (const f of fadeables) {
    f.sel += ((selected ? 0.05 : 1) - f.sel) * Math.min(1, dt * 7);
    applyFade(f.mats, (f.fadeE ?? 1) * f.sel);
    f.obj.visible = (f.fadeE ?? 1) * f.sel > 0.01;
  }

  for (const s of spinners) s.obj.rotation.z += s.speed * dt;
  // RGB cycles through the neon range only: cyan -> violet -> hot pink and back
  for (const r of rgbMats) r.m.emissive.setHSL(0.5 + 0.45 * (0.5 - 0.5 * Math.cos((time * 0.07 + r.phase) * Math.PI * 2)), 1, 0.55);
  rainbowTex.offset.y = (time * 0.12) % 1;

  scene.updateMatrixWorld();
  updateFlows(time);
  updateSparks(dt);
  updateWorld(dt, time);
  glitch = Math.max(0, glitch - dt * 1.6);
  cyber.uniforms.time.value = time;
  cyber.uniforms.glitch.value = Math.max(glitch, charge * 0.35, Math.random() < 0.004 ? 0.25 : 0);

  // labels follow parts
  const showLabels = explodeT > 0.75 && !selected;
  for (const p of Object.values(parts)) {
    _c.copy(p.localCenter);
    p.group.localToWorld(_c);
    p.label.position.set(_c.x, _c.y + p.halfH + 1.6, _c.z);
    p.label.element.classList.toggle('on', showLabels && !busy);
  }

  if (camTween) camera.lookAt(controls.target);
  else controls.update();

  // camera shake
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.8);
    const a = shake * shake * 1.6;
    shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
  } else shakeOff.set(0, 0, 0);
  camera.position.add(shakeOff);

  // shift the view so the selected part isn't hidden behind the panel
  viewShift += (viewShiftTarget - viewShift) * Math.min(1, dt * 5);
  viewShiftY += (viewShiftYTarget - viewShiftY) * Math.min(1, dt * 5);
  if (Math.abs(viewShift) > 0.5 || Math.abs(viewShiftY) > 0.5) camera.setViewOffset(innerWidth, innerHeight, viewShift, viewShiftY, innerWidth, innerHeight);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();

  if (lastMove && !down) {
    const id = pickAt(lastMove.clientX, lastMove.clientY);
    setHover(id, lastMove);
  }

  composer.render();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// intro: start far away and swoop in
camera.position.copy(viewPos(VIEWS.home)).multiplyScalar(1.9).add(new THREE.Vector3(-60, 50, 0));
controls.target.copy(VIEWS.home.target);
camera.lookAt(controls.target);
frame();
setTimeout(() => {
  $('boot').classList.add('done');
  flyTo(viewPos(VIEWS.home), VIEWS.home.target, 2.6);
}, 1300);
setTimeout(() => $('hint').classList.add('gone'), 9000);

// installable app + offline support
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// handy for poking around in the browser console
window.__rig = { THREE, scene, camera, controls, parts, select, toggleExplode, flyTo, viewPos, VIEWS };
