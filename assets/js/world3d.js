// Altercom21 · "Món 3D": recorregut de càmera controlat pel scroll.
// Inspirat en la idea de scroll-world (github.com/oso95/scroll-world): el scroll
// només mou el temps i la càmera vola sense talls d'una escena a la següent.
// Aquí el món es genera en temps real amb Three.js (sense vídeos pregenerats).
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const section = document.querySelector("#mon");
const canvas = document.querySelector("#world-canvas");
const captions = [...document.querySelectorAll(".world-caption")];
const dots = [...document.querySelectorAll(".world-nav button")];
const bar = document.querySelector(".world-progress span");
const hint = document.querySelector(".world-hint");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function fallback() {
  section.classList.add("world-static");
}

let renderer;
try {
  if (reduceMotion) throw new Error("reduced motion");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
  fallback();
}

if (renderer) {
  // ---------------------------------------------------------------- escena base
  const COLORS = {
    bg: 0x0a1628, ground: 0x0f2036, block: 0x1b3352, blockLight: 0x274873,
    accent: 0x2dd4bf, blue: 0x60a5fa, red: 0xef4444, amber: 0xf59e0b, white: 0xe2e8f0
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 30, 95);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

  scene.add(new THREE.HemisphereLight(0x9ec5ff, 0x0a1628, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-30, 50, 25);
  scene.add(sun);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .75, metalness: .1, ...extra });
  const glow = (color, intensity = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .4 });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  // Terra + graella "cyber"
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(COLORS.ground));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(400, 160, 0x1e4b6b, 0x14304a);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = .55;
  scene.add(grid);

  // Elements animats (s'actualitzen cada frame)
  const animated = [];

  // Plataforma on s'assenta cada escena
  function platform(x, z, w = 16, d = 16) {
    const g = new THREE.Group();
    const base = box(w, .6, d, mat(0x132a45));
    base.position.y = .3;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w + .3, .12, d + .3), glow(COLORS.accent, .5));
    edge.position.y = .02;
    g.add(edge, base);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- escenes
  const SCENES = [
    { center: new THREE.Vector3(0, 0, 0) },
    { center: new THREE.Vector3(38, 0, -22) },
    { center: new THREE.Vector3(80, 0, 4) },
    { center: new THREE.Vector3(118, 0, -26), lookY: 8, inY: 9 },
    { center: new THREE.Vector3(160, 0, 0) }
  ];

  // 0 · Reconeixement: oficina del client + radar que escaneja
  (() => {
    const { x, z } = SCENES[0].center;
    const p = platform(x, z);
    const tower = box(5, 9, 5, mat(COLORS.block));
    tower.position.set(-2, 5.1, -1);
    const annex = box(6, 4, 4, mat(COLORS.blockLight));
    annex.position.set(3, 2.6, 2);
    p.add(tower, annex);
    // Finestres
    const winMat = glow(0x93c5fd, .9);
    for (let fy = 0; fy < 6; fy++) for (let fx = 0; fx < 3; fx++) {
      const w = box(.8, .6, .05, winMat);
      w.position.set(-3.4 + fx * 1.4, 2 + fy * 1.3, 1.53);
      p.add(w);
    }
    // Radar
    const mast = box(.3, 3, .3, mat(COLORS.white));
    mast.position.set(-2, 11, -1);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(1.4, .8, 16, 1, true), mat(COLORS.white, { side: THREE.DoubleSide }));
    dish.rotation.x = Math.PI;
    const dishPivot = new THREE.Group();
    dishPivot.position.set(-2, 12.6, -1);
    dish.rotation.z = .6;
    dishPivot.add(dish);
    p.add(mast, dishPivot);
    animated.push(t => { dishPivot.rotation.y = t * 1.2; });
    // Ones d'escaneig
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.15, 48), new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .65;
      p.add(ring);
      animated.push(t => {
        const k = ((t * .35 + i / 3) % 1);
        ring.scale.setScalar(1 + k * 9);
        ring.material.opacity = (1 - k) * .7;
      });
    }
  })();

  // 1 · Xarxa: nodes connectats i paquets de dades
  (() => {
    const { x, z } = SCENES[1].center;
    const p = platform(x, z);
    const nodes = [[-5, -4], [0, -5], [5, -3], [-4, 2], [1, 1], [5, 4], [-1, 5]].map(([nx, nz], i) => {
      const post = box(.3, 2 + (i % 3), .3, mat(COLORS.blockLight));
      post.position.set(nx, (2 + (i % 3)) / 2 + .6, nz);
      const node = new THREE.Mesh(new THREE.IcosahedronGeometry(.75, 0), glow(i === 4 ? COLORS.accent : COLORS.blue, 1.1));
      node.position.set(nx, 2.6 + (i % 3), nz);
      p.add(post, node);
      animated.push(t => { node.rotation.y = t + i; node.rotation.x = t * .5; });
      return node.position.clone();
    });
    const links = [[0, 1], [1, 2], [0, 3], [3, 4], [1, 4], [4, 5], [2, 5], [3, 6], [6, 5]];
    const lineMat = new THREE.LineBasicMaterial({ color: COLORS.accent, transparent: true, opacity: .6 });
    links.forEach(([a, b], i) => {
      p.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([nodes[a], nodes[b]]), lineMat));
      const packet = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 8), glow(i === 6 ? COLORS.red : COLORS.white, 2));
      p.add(packet);
      animated.push(t => { packet.position.lerpVectors(nodes[a], nodes[b], (t * .45 + i * .13) % 1); });
    });
    // Tallafocs
    const fw = box(12, 2.2, .5, glow(0xf97316, .35));
    fw.material.transparent = true;
    fw.material.opacity = .45;
    fw.position.set(0, 1.7, -7);
    p.add(fw);
  })();

  // 2 · Servidors: CPD amb racks i una vulnerabilitat que es tanca
  let vulnMarker;
  (() => {
    const { x, z } = SCENES[2].center;
    const p = platform(x, z);
    const ledColors = [COLORS.accent, COLORS.blue, COLORS.accent, COLORS.amber];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const rack = box(1.8, 5, 1.6, mat(0x14263f));
      rack.position.set(-4.5 + i * 3, 3.1, -4.5 + row * 4.5);
      p.add(rack);
      for (let l = 0; l < 6; l++) {
        const led = box(.25, .12, .05, glow(ledColors[(i + l + row) % 4], 1.5));
        led.position.set(rack.position.x - .5 + (l % 2) * .4, 1.4 + l * .65, rack.position.z + .82);
        p.add(led);
        const phase = Math.random() * 6;
        animated.push(t => { led.material.emissiveIntensity = Math.sin(t * 4 + phase) > .2 ? 1.8 : .2; });
      }
    }
    // Marcador de vulnerabilitat: vermell → verd en arribar-hi la càmera
    vulnMarker = new THREE.Mesh(new THREE.OctahedronGeometry(.5, 0), glow(COLORS.red, 1.8));
    vulnMarker.position.set(1.5, 7.4, 0);
    p.add(vulnMarker);
    animated.push(t => { vulnMarker.rotation.y = t * 1.5; vulnMarker.position.y = 7.4 + Math.sin(t * 2) * .3; });
  })();

  // 3 · Núvol: plataforma flotant amb núvols i dades
  (() => {
    const { x, z } = SCENES[3].center;
    const p = platform(x, z, 14, 14);
    const cloud = new THREE.Group();
    const cMat = mat(0xcbd5e1, { roughness: 1 });
    [[0, 0, 0, 2.6], [2.4, -.3, .4, 2], [-2.4, -.4, -.2, 2.1], [1, .9, -.6, 1.9], [-1.1, .8, .7, 1.7]].forEach(([cx, cy, cz, r]) => {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cMat);
      s.position.set(cx, cy, cz);
      cloud.add(s);
    });
    cloud.position.set(0, 11, 0);
    p.add(cloud);
    animated.push(t => { cloud.position.y = 11 + Math.sin(t * .8) * .5; cloud.rotation.y = t * .1; });
    // Cables cap al núvol i cubs de dades que hi pugen
    [[-4, -3], [4, -2], [0, 4]].forEach(([bx, bz], i) => {
      const base = box(2.2, 1.4, 2.2, mat(COLORS.blockLight));
      base.position.set(bx, 1.3, bz);
      p.add(base);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(bx, 2, bz), new THREE.Vector3(bx * .2, 9, bz * .2)]),
        new THREE.LineDashedMaterial({ color: COLORS.accent, dashSize: .4, gapSize: .3 }));
      line.computeLineDistances();
      p.add(line);
      const cube = box(.5, .5, .5, glow(COLORS.accent, 1.4));
      p.add(cube);
      animated.push(t => {
        const k = (t * .3 + i / 3) % 1;
        cube.position.set(bx + (bx * .2 - bx) * k, 2 + 7 * k, bz + (bz * .2 - bz) * k);
        cube.rotation.set(t, t, 0);
      });
    });
  })();

  // 4 · Protecció: cúpula de seguretat sobre tot l'entorn
  (() => {
    const { x, z } = SCENES[4].center;
    const p = platform(x, z, 18, 18);
    [[-4, -3, 3, 6], [3, -4, 4, 4], [-3, 4, 4, 3], [4, 3, 3, 7]].forEach(([bx, bz, w, h]) => {
      const b = box(w, h, w, mat(COLORS.block));
      b.position.set(bx, h / 2 + .6, bz);
      p.add(b);
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORS.accent, wireframe: true, transparent: true, opacity: .35 }));
    dome.position.y = .6;
    p.add(dome);
    animated.push(t => { dome.rotation.y = t * .08; dome.material.opacity = .25 + Math.sin(t * 1.5) * .08; });
    // Escut central
    const shield = new THREE.Shape();
    shield.moveTo(0, 2.2); shield.lineTo(1.8, 1.5); shield.lineTo(1.6, -.4);
    shield.quadraticCurveTo(1.2, -1.8, 0, -2.4); shield.quadraticCurveTo(-1.2, -1.8, -1.6, -.4);
    shield.lineTo(-1.8, 1.5); shield.lineTo(0, 2.2);
    const shieldMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: .4, bevelEnabled: false }), glow(COLORS.accent, .9));
    shieldMesh.position.set(0, 13, 0);
    p.add(shieldMesh);
    animated.push(t => { shieldMesh.rotation.y = Math.sin(t * .6) * .6; });
  })();

  // Partícules flotants (atmosfera)
  (() => {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 220 - 30;
      pos[i * 3 + 1] = Math.random() * 30 + 2;
      pos[i * 3 + 2] = Math.random() * 90 - 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: COLORS.accent, size: .18, transparent: true, opacity: .55 }));
    scene.add(pts);
    animated.push(t => { pts.position.y = Math.sin(t * .3) * .8; });
  })();

  // ---------------------------------------------------------------- trajectòria
  // Per a cada escena: punt exterior (vista isomètrica) → punt interior (immersió).
  const camKeys = [], lookKeys = [];
  SCENES.forEach(({ center: c, lookY = 5, inY = 6.5 }, i) => {
    const side = i % 2 ? -1 : 1;
    camKeys.push(c.clone().add(new THREE.Vector3(-20, 22, 26 * side)));
    lookKeys.push(c.clone().add(new THREE.Vector3(0, Math.max(3, lookY - 2), 0)));
    camKeys.push(c.clone().add(new THREE.Vector3(-7, inY, 9 * side)));
    lookKeys.push(c.clone().add(new THREE.Vector3(1, lookY, 0)));
  });
  camKeys.push(SCENES[4].center.clone().add(new THREE.Vector3(-26, 34, 30)));
  lookKeys.push(SCENES[4].center.clone().add(new THREE.Vector3(0, 4, 0)));
  const camPath = new THREE.CatmullRomCurve3(camKeys, false, "centripetal");
  const lookPath = new THREE.CatmullRomCurve3(lookKeys, false, "centripetal");
  const SEGMENTS = camKeys.length - 1;

  // ---------------------------------------------------------------- scroll
  const N = SCENES.length;
  let target = 0, current = 0, visible = false, active = -1;

  function readScroll() {
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - innerHeight;
    target = Math.min(1, Math.max(0, -r.top / total));
  }

  // "linger": la càmera s'atura una mica dins de cada escena, on hi ha el text.
  function remap(p) {
    const s = p * SEGMENTS;
    const i = Math.min(Math.floor(s), SEGMENTS - 1);
    const f = s - i;
    const eased = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    return (i + (eased * .75 + f * .25)) / SEGMENTS;
  }

  function updateUI(p) {
    bar.style.transform = `scaleX(${p})`;
    hint.classList.toggle("gone", p > .02);
    const idx = Math.min(N - 1, Math.floor(p * N * .999));
    const local = p * N - idx;
    if (idx !== active) {
      active = idx;
      dots.forEach((d, i) => d.setAttribute("aria-current", String(i === idx)));
    }
    captions.forEach((c, i) => {
      const on = i === idx && (local > .12 || i === 0) && (local < .94 || i === N - 1);
      c.classList.toggle("on", on);
    });
    if (vulnMarker) {
      const fixed = p > 2.55 / N;
      vulnMarker.material.color.setHex(fixed ? COLORS.accent : COLORS.red);
      vulnMarker.material.emissive.setHex(fixed ? COLORS.accent : COLORS.red);
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 700 ? 60 : 45;
    camera.updateProjectionMatrix();
  }

  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  function frame() {
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), .25);
    const t = clock.elapsedTime;
    current += (target - current) * (1 - Math.exp(-dt * 5));
    if (Math.abs(target - current) < .0005) current = target;
    const u = remap(current);
    camera.position.copy(camPath.getPoint(u));
    lookPath.getPoint(u, look);
    camera.lookAt(look);
    animated.forEach(fn => fn(t));
    updateUI(current);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was) { readScroll(); requestAnimationFrame(frame); }
  }, { rootMargin: "100px" }).observe(section);

  addEventListener("scroll", readScroll, { passive: true });
  addEventListener("resize", () => { resize(); readScroll(); });
  resize();
  readScroll();
  current = target;

  // Navegació per punts: salta a l'escena
  dots.forEach((d, i) => d.addEventListener("click", () => {
    const total = section.offsetHeight - innerHeight;
    scrollTo({ top: section.offsetTop + total * ((i + .5) / N), behavior: "smooth" });
  }));

  section.classList.add("world-ready");
}
