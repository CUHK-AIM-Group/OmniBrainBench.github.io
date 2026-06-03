// =============================================================================
// OmniBrainBench — procedural glowing brain (Hero visual)
// Original geometry: tracts are generated procedurally over a brain-shaped
// ellipsoid. No external model / no third-party coordinate data.
// =============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const box = document.getElementById('brainBox');
if (box && supportsWebGL()) {
  init(box);
} else if (box) {
  showFallback(box);
}

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function showFallback(box) {
  const img = document.createElement('img');
  img.src = 'static/images/OmniBrainBench_icon.png';
  img.alt = 'OmniBrainBench';
  img.style.cssText = 'width:60%;opacity:.85;display:block;margin:0 auto;';
  box.appendChild(img);
}

// ---- deterministic PRNG so the brain looks identical on every load ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Brain-like surface point for parameters (u around, v vertical), with a
// longitudinal fissure groove and slight front-back asymmetry.
function brainSurface(u, v, jitter, rnd) {
  // u in [0, 2π) azimuth, v in [-1, 1] elevation
  const a = 0.085, b = 0.062, c = 0.072; // ellipsoid radii (x wide, y tall, z deep)
  const ce = Math.cos(v * Math.PI / 2);
  let x = a * ce * Math.cos(u);
  let y = b * Math.sin(v * Math.PI / 2);
  let z = c * ce * Math.sin(u);
  // frontal lobe slightly larger, occipital tapered
  const frontBack = Math.sin(u);
  x *= 1 + 0.06 * frontBack;
  // central longitudinal fissure: pinch near the top midline (z≈0)
  const midline = Math.exp(-(z * z) / 0.0006);
  y -= b * 0.10 * midline * Math.max(0, Math.sin(v * Math.PI / 2));
  // gyri-like surface noise
  const n = jitter * (Math.sin(u * 7 + v * 5) + Math.cos(u * 4 - v * 9)) * 0.5;
  const len = Math.hypot(x, y, z) || 1;
  x += (x / len) * n; y += (y / len) * n; z += (z / len) * n;
  return new THREE.Vector3(x, y, z);
}

function init(box) {
  const rnd = mulberry32(20251101); // seeded for reproducibility

  const W = box.clientWidth || 420;
  const H = box.clientHeight || W;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  box.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.001, 5);
  camera.position.set(0, 0.01, 0.34);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.9;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI * 0.25;
  controls.maxPolarAngle = Math.PI * 0.75;

  // ---- generate procedural tracts as CatmullRom curves over the surface ----
  const mobile = W < 480;
  const curves = [];

  // Family 1 — longitudinal "gyri": sweep elevation front-to-back over the top,
  // with a gentle azimuth wander. These give the folded cerebrum look.
  const N_LONG = mobile ? 26 : 44;
  for (let t = 0; t < N_LONG; t++) {
    const baseU = (t / N_LONG) * Math.PI * 2;          // spread around the head
    const wob = 0.18 + rnd() * 0.22;                    // azimuth waviness
    const freq = 2 + Math.floor(rnd() * 3);
    const phase = rnd() * Math.PI * 2;
    const radial = 0.99 + rnd() * 0.03;
    const pts = [];
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const vv = -0.92 + f * 1.84;                       // bottom → top → ... arc
      const uu = baseU + Math.sin(f * Math.PI * freq + phase) * wob;
      pts.push(brainSurface(uu, vv, 0.012, rnd).multiplyScalar(radial));
    }
    curves.push(new THREE.CatmullRomCurve3(pts));
  }

  // Family 2 — lateral bands: sweep azimuth at a fixed-ish elevation, wavy.
  const N_LAT = mobile ? 12 : 22;
  for (let t = 0; t < N_LAT; t++) {
    const baseV = -0.55 + (t / N_LAT) * 1.25;            // stacked rings up the head
    const span = Math.PI * (0.7 + rnd() * 0.8);
    const u0 = rnd() * Math.PI * 2;
    const freq = 3 + Math.floor(rnd() * 4);
    const radial = 0.99 + rnd() * 0.03;
    const pts = [];
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const uu = u0 + f * span;
      const vv = THREE.MathUtils.clamp(baseV + Math.sin(f * Math.PI * freq) * 0.12, -1, 1);
      pts.push(brainSurface(uu, vv, 0.012, rnd).multiplyScalar(radial));
    }
    curves.push(new THREE.CatmullRomCurve3(pts));
  }

  // Family 3 — brain stem: a few short tracts descending from the base center.
  const N_STEM = mobile ? 3 : 5;
  for (let t = 0; t < N_STEM; t++) {
    const pts = [];
    const uu = Math.PI * 1.5 + (rnd() - 0.5) * 0.5;      // underside, toward front-down
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const vv = -0.55 - f * 0.7;                        // dip below the ellipsoid
      const p = brainSurface(uu + Math.sin(f * 4) * 0.05, Math.max(vv, -1), 0.006, rnd);
      p.y -= f * 0.035;                                  // extend the stem downward
      p.z += f * 0.015;
      pts.push(p);
    }
    curves.push(new THREE.CatmullRomCurve3(pts));
  }

  // ---- glow tube shader (additive, flowing pulse along length) ----
  const tubeMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      colorA: { value: new THREE.Color(0x3b82f6) }, // blue
      colorB: { value: new THREE.Color(0x14b8a6) }, // teal
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 colorA;
      uniform vec3 colorB;
      varying vec2 vUv;
      void main() {
        float pulse = smoothstep(-1.0, 1.0, sin(vUv.x * 10.0 - time * 2.5));
        float endFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        vec3 col = mix(colorA, colorB, vUv.x);
        col = mix(col * 0.35, col * 1.4, pulse);
        gl_FragColor = vec4(col, endFade * 0.9);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const tubeRadial = mobile ? 2 : 3;
  const tubeSegs = mobile ? 40 : 64;
  curves.forEach((curve) => {
    const geo = new THREE.TubeGeometry(curve, tubeSegs, 0.0011, tubeRadial, false);
    scene.add(new THREE.Mesh(geo, tubeMat));
  });

  // ---- flowing particle nodes along the tracts ----
  const DENSITY = mobile ? 5 : 9;
  const total = DENSITY * curves.length;
  const positions = new Float32Array(total * 3);
  const randoms = new Float32Array(total);
  const pdata = [];
  for (let i = 0; i < curves.length; i++) {
    for (let j = 0; j < DENSITY; j++) {
      const idx = i * DENSITY + j;
      randoms[idx] = 0.4 + rnd() * 0.9;
      pdata.push({ curve: curves[i], pos: rnd(), speed: 0.0015 + rnd() * 0.004 });
    }
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('randoms', new THREE.BufferAttribute(randoms, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      attribute float randoms;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = randoms * 3.0 * (0.02 / -mv.z);
      }
    `,
    fragmentShader: `
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.35, d);
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), a * 0.8);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  // ---- hover label (raycast tracts → show a benchmark term) ----
  const LABELS = [
    'MRI', 'CT', 'PET', 'fMRI', 'DWI', 'SWI', 'MRA',
    'Anatomical Assessment', 'Imaging Assessment', 'Risk Stratification',
    'Preoperative Reasoning', 'Therapeutic Cycle', '15 Modalities',
    '15 Clinical Tasks', '9,527 VQA Pairs', 'Lesion Quantification',
    'Clinical Sign Prediction', 'Prognostic Analysis',
  ];
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 0.01 };
  const ndc = new THREE.Vector2();
  const tip = document.getElementById('brainTip');
  let hoverTimer = 0;
  const meshes = scene.children.filter((o) => o.isMesh);

  function onMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(meshes, false);
    if (hit.length && tip) {
      const i = Math.floor((hit[0].faceIndex || 0)) % LABELS.length;
      tip.textContent = LABELS[Math.abs(i) % LABELS.length];
      tip.style.left = (e.clientX - r.left) + 'px';
      tip.style.top = (e.clientY - r.top) + 'px';
      tip.classList.add('show');
      controls.autoRotate = false;
      hoverTimer = 0;
    } else if (tip) {
      tip.classList.remove('show');
    }
  }
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', () => {
    if (tip) tip.classList.remove('show');
  });

  // ---- resize ----
  function onResize() {
    const w = box.clientWidth || 420;
    const h = box.clientHeight || w;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  // ---- pause when offscreen ----
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; }, { threshold: 0 })
      .observe(box);
  }

  // ---- animate ----
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  function animate() {
    requestAnimationFrame(animate);
    if (!visible) return;
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    tubeMat.uniforms.time.value = t;

    // advance particles along their curves
    for (let i = 0; i < pdata.length; i++) {
      const d = pdata[i];
      d.pos = (d.pos + d.speed) % 1;
      d.curve.getPointAt(d.pos, tmp);
      positions[i * 3] = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
    }
    pGeo.attributes.position.needsUpdate = true;

    // resume auto-rotate shortly after the pointer stops hovering
    hoverTimer += dt;
    if (!controls.autoRotate && hoverTimer > 1.2) controls.autoRotate = true;

    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}
