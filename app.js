/* ============================================================
 * 山水安康 · 可交互三维全景（Three.js r128）
 * 低多边形艺术沙盘：滚轮缩放 / 拖拽旋转 / 点击飞行 / 三时切换
 * ============================================================ */
'use strict';

/* ---------------- 全局 ---------------- */
var scene, camera, renderer, controls, raycaster, clock;
var world, lakeWater, skyMesh, sunSprite, moonSprite, starPoints;
var hemiLight, sunLight, ambLight;
var mats = {}, pal;
var hillDefs = [];
var spotsById = {};
var landmarks = [];        // {spot, group, anchor, radius}
var clickables = [];
var labels = [];
var boats = [], ripples = [], birds = [], jets = [];
var waterMats = [], lanternSprites = [], buildingMats = [];
var pagodaBronzeWall, pagodaBronzeRoof, pagodaBronzeEave, pagodaWoodWall;
var themedMats = [];   // {mat, day, sunset, night, emDay, emNight}
var inst = { cone: [], blob: [], tea: [], lotus: [] };
var instMeshes = [];
var now = 0;
var autoTour = false, tourSeq = [], tourWait = 0;
var fly = null;
var pointerDown = null, pointerMoved = false;
var mouseNDC = new THREE.Vector2(-2, -2);
var hoverId = null;
var currentTheme = 'day';
var uiHidden = false;

/* 米 → 世界单位（按安康纬度近似） */
var MX = 0.00957, MZ = 0.00827;

/* ============================================================
 * 主题色板
 * ============================================================ */
var PALETTES = {
  day: {
    skyTop: '#cfe4e0', skyBottom: '#f3f1e4',
    fog: '#e9eee6', fogNear: 200, fogFar: 700,
    hemiSky: '#dcece8', hemiGround: '#cfc79e', hemiI: 0.72,
    sun: '#fff4dd', sunI: 0.9, amb: '#ffffff', ambI: 0.24,
    sunPos: [70, 95, 40],
    water: 0x3b8ac9, waterEm: 0x246096,
    ground: 0xe9e5cb, beach: 0xe5ddba,
    grassA: 0x86bd6c, grassB: 0x9ccc7e, rock: 0x8f9b80,
    trunk: 0x8d7a52, path: 0xd9d0ad,
    city1: 0xf2f1e9, city2: 0xdde3d8, city3: 0x6fa09c,
    emissive: 0.0, star: 0.0, sunVisible: 1, moonVisible: 0, lantern: 0,
    labelBg: 'rgba(255,255,255,0.92)', labelTx: '#3a4742', labelBorder: 'rgba(60,80,72,0.14)',
    sunColor: '#fff0d0'
  },
  sunset: {
    skyTop: '#e9c7a6', skyBottom: '#f7e3c6',
    fog: '#f1ddc4', fogNear: 190, fogFar: 660,
    hemiSky: '#f3d9bd', hemiGround: '#c9b385', hemiI: 0.72,
    sun: '#ffb977', sunI: 1.0, amb: '#ffe6cc', ambI: 0.3,
    sunPos: [-90, 34, 60],
    water: 0x4f86bf, waterEm: 0xa06a3e,
    ground: 0xe7dabb, beach: 0xe2cf9f,
    grassA: 0x8fae66, grassB: 0xa6bf76, rock: 0x98907a,
    trunk: 0x8d7250, path: 0xdcc79a,
    city1: 0xf0e6d4, city2: 0xdcd4c0, city3: 0x7d9f96,
    emissive: 0.25, star: 0.1, sunVisible: 1, moonVisible: 0, lantern: 0.5,
    labelBg: 'rgba(255,250,242,0.92)', labelTx: '#4a3f33', labelBorder: 'rgba(120,90,50,0.18)',
    sunColor: '#ffb066'
  },
  night: {
    skyTop: '#0b1526', skyBottom: '#1c2f49',
    fog: '#101d30', fogNear: 180, fogFar: 640,
    hemiSky: '#2a4060', hemiGround: '#1a2a26', hemiI: 0.55,
    sun: '#9fc0ff', sunI: 0.4, amb: '#33507a', ambI: 0.36,
    sunPos: [-60, 80, -50],
    water: 0x123a5e, waterEm: 0x1d4d7a,
    ground: 0x2b3128, beach: 0x3a3a28,
    grassA: 0x2e4a30, grassB: 0x3c5a3a, rock: 0x445048,
    trunk: 0x3a3326, path: 0x55503c,
    city1: 0x3a4450, city2: 0x353f4c, city3: 0x2f5f63,
    emissive: 1.0, star: 0.95, sunVisible: 0, moonVisible: 1, lantern: 1,
    labelBg: 'rgba(16,28,44,0.82)', labelTx: '#dbe7ef', labelBorder: 'rgba(150,190,220,0.25)',
    sunColor: '#dfeeff'
  }
};

/* ============================================================
 * 初始化
 * ============================================================ */
function init() {
  pal = PALETTES.day;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 1400);
  // 开场：安康居中，相机在城区正南方，方位角 0 → 北上南下、左西右东
  var _sx = 0, _sz = 0;
  SPOTS.forEach(function (s) { var w = XY(s.lon, s.lat); _sx += w[0]; _sz += w[1]; });
  var lc0 = [_sx / SPOTS.length, _sz / SPOTS.length];
  OVERVIEW_TARGET = new THREE.Vector3(lc0[0], 3, lc0[1]);
  // 正南方近距陡瞰（约 30° 倾角 2.5D 视角）：越过汉江，整片安康居中占满画面，方位角 0（北上南下）
  OVERVIEW_POS = new THREE.Vector3(lc0[0], 74, lc0[1] + 50);
  camera.position.copy(OVERVIEW_POS);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.getElementById('canvas-wrap').appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.copy(OVERVIEW_TARGET);
  controls.minDistance = 4;
  controls.maxDistance = 400;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.45;
  controls.autoRotateSpeed = 0.55;

  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();
  world = new THREE.Group();
  scene.add(world);

  buildLights();
  buildSky();
  buildMaterials();
  buildTerrain();
  buildWater();
  buildCausewaysAndIslands();
  buildHills();
  buildCity();
  buildVegetation();
  buildRoads();
  buildAllLandmarks();
  buildMetro();
  buildAmbientLife();
  buildLabels();
  finalizeInstances();
  bindEvents();
  buildSpotList();
  updateMinimap();

  setTheme('day');
  onResize();
  animate();
}

function buildLights() {
  ambLight = new THREE.AmbientLight(0xffffff, 0.32);
  scene.add(ambLight);
  hemiLight = new THREE.HemisphereLight(0xdcece8, 0xcfc79e, 0.95);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xfff4dd, 1.05);
  sunLight.position.set(70, 95, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  var s = 120, sh = sunLight.shadow.camera;
  sh.left = -s; sh.right = s; sh.top = s; sh.bottom = -s; sh.near = 10; sh.far = 320;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
}

function buildSky() {
  var geo = new THREE.SphereGeometry(520, 32, 16);
  var mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  skyMesh = new THREE.Mesh(geo, mat);
  scene.add(skyMesh);

  function disc(texColor, size, opacity) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, texColor);
    grad.addColorStop(0.35, texColor);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, opacity: opacity,
      depthWrite: false, fog: false
    }));
    sp.scale.set(size, size, 1);
    scene.add(sp);
    return sp;
  }
  sunSprite = disc('#fff3d0', 60, 1);
  sunSprite.position.set(180, 240, 110);
  moonSprite = disc('#e8f0ff', 42, 0);
  moonSprite.position.set(-160, 210, -120);

  // 星空
  var n = 700, pos = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    var v = new THREE.Vector3().randomDirection ? new THREE.Vector3().randomDirection() : randDir();
    v.multiplyScalar(480);
    if (v.y < 40) v.y = Math.abs(v.y) + 40;
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starPoints = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false
  }));
  scene.add(starPoints);
  function randDir() {
    var v = new THREE.Vector3(THREE.MathUtils.randFloatSpread(2), Math.random(), THREE.MathUtils.randFloatSpread(2));
    return v.normalize();
  }
}

function reg(mat, day, sunset, night) {
  themedMats.push({ mat: mat, day: day, sunset: sunset, night: night });
  return mat;
}
var autoMats = [];
function regAuto(mat) { mat.userData.dayColor = mat.color.clone(); autoMats.push(mat); return mat; }
function buildMaterials() {
  mats.ground = reg(new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 1, flatShading: true }),
    pal.ground, PALETTES.sunset.ground, PALETTES.night.ground);
  mats.terrain = reg(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true }),
    0xffffff, 0xd9cfb8, 0x46524a);
  mats.beach = reg(new THREE.MeshStandardMaterial({ color: pal.beach, roughness: 1, flatShading: true }),
    pal.beach, PALETTES.sunset.beach, PALETTES.night.beach);
  mats.path = reg(new THREE.MeshStandardMaterial({ color: pal.path, roughness: 1, flatShading: true }),
    pal.path, PALETTES.sunset.path, PALETTES.night.path);
  mats.meadow = reg(new THREE.MeshStandardMaterial({ color: pal.grassB, roughness: 1, flatShading: true, transparent: true, opacity: .92 }),
    pal.grassB, PALETTES.sunset.grassB, PALETTES.night.grassB);
  mats.water = new THREE.MeshStandardMaterial({
    color: pal.water, roughness: .55, metalness: 0,
    emissive: pal.waterEm, emissiveIntensity: .08
  });
  mats.stone = reg(new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: .9, flatShading: true }),
    0xd8d2bd, 0xcfc2a4, 0x494e52);
  mats.stoneDark = reg(new THREE.MeshStandardMaterial({ color: 0xb9b4a2, roughness: .9, flatShading: true }),
    0xb9b4a2, 0xb0a384, 0x3a3f44);
  mats.wallCream = reg(new THREE.MeshStandardMaterial({ color: 0xf0e4cd, roughness: .85, flatShading: true }),
    0xf0e4cd, 0xe8d6b4, 0x58534a);
  mats.wallOchre = reg(new THREE.MeshStandardMaterial({ color: 0xd8b573, roughness: .85, flatShading: true }),
    0xd8b573, 0xcfa565, 0x4c4230);
  mats.red = reg(new THREE.MeshStandardMaterial({ color: 0x9c4a38, roughness: .7, flatShading: true }),
    0x9c4a38, 0xa4553d, 0x572d25);
  mats.roof = reg(new THREE.MeshStandardMaterial({ color: 0x3c5a50, roughness: .65, flatShading: true }),
    0x3c5a50, 0x40594e, 0x1b2e2a);
  mats.roofDark = reg(new THREE.MeshStandardMaterial({ color: 0x314039, roughness: .65, flatShading: true }),
    0x314039, 0x364640, 0x14211d);
  mats.gold = new THREE.MeshStandardMaterial({ color: 0xd9b04f, roughness: .35, metalness: .55, flatShading: true });
  mats.bronze = reg(new THREE.MeshStandardMaterial({ color: 0x6b5838, roughness: .5, metalness: .4, flatShading: true }),
    0x6b5838, 0x6b5236, 0x3a3225);
  mats.white = reg(new THREE.MeshStandardMaterial({ color: 0xf4f2e8, roughness: .7, flatShading: true }),
    0xf4f2e8, 0xefe4d2, 0x3a4750);
  mats.wood = reg(new THREE.MeshStandardMaterial({ color: 0x8a6742, roughness: .8, flatShading: true }),
    0x8a6742, 0x805f3e, 0x483724);
  mats.rock = reg(new THREE.MeshStandardMaterial({ color: 0x8b977c, roughness: 1, flatShading: true }),
    0x8b977c, 0x8f876f, 0x3f4a42);
  mats.teal = reg(new THREE.MeshStandardMaterial({ color: 0x3d8b82, roughness: .55, metalness: .1, flatShading: true }),
    0x3d8b82, 0x3d857d, 0x1e4d4f);
  mats.goldBall = new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: .25, metalness: .7 });
  // 铜构塔身（塔型变体 C）
  pagodaBronzeWall = reg(new THREE.MeshStandardMaterial({ color: 0xc9924f, roughness: .5, metalness: .35, flatShading: true }),
    0xc9924f, 0xbf8544, 0x4a3c28);
  pagodaBronzeRoof = reg(new THREE.MeshStandardMaterial({ color: 0x8f6635, roughness: .45, metalness: .4, flatShading: true }),
    0x8f6635, 0x855f31, 0x33281c);
  pagodaBronzeEave = reg(new THREE.MeshStandardMaterial({ color: 0x7c562b, roughness: .5, metalness: .4, flatShading: true }),
    0x7c562b, 0x73502a, 0x2c2218);
  // 木构塔身（塔型变体 B）
  pagodaWoodWall = reg(new THREE.MeshStandardMaterial({ color: 0xcfa86f, roughness: .8, flatShading: true }),
    0xcfa86f, 0xc29a60, 0x4a3e2c);
  waterMats.push(mats.water);
}

/* ============================================================
 * 几何辅助
 * ============================================================ */
function v3(lon, lat, y) { var p = P(lon, lat, y); return new THREE.Vector3(p[0], p[1], p[2]); }
function xy(lon, lat) { return XY(lon, lat); }

function roundedRectShape(w, h, r) {
  var s = new THREE.Shape();
  var x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// 开放/闭合条带
function ribbonGeo(pts, width, closed) {
  var n = pts.length, half = width / 2;
  var normals = [];
  for (var i = 0; i < n; i++) {
    var pPrev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    var pNext = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    var dx = pNext[0] - pPrev[0], dz = pNext[1] - pPrev[1];
    var len = Math.hypot(dx, dz) || 1;
    normals.push([-dz / len, dx / len]);
  }
  var positions = [], indices = [];
  for (i = 0; i < n; i++) {
    positions.push(pts[i][0] + normals[i][0] * half, 0, pts[i][1] + normals[i][1] * half);
    positions.push(pts[i][0] - normals[i][0] * half, 0, pts[i][1] - normals[i][1] * half);
  }
  var segs = closed ? n : n - 1;
  for (i = 0; i < segs; i++) {
    var a = i * 2, b = ((i + 1) % n) * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// 两环之间的环形带（湖岸沙滩）
function ringGeo(outer, inner) {
  var n = Math.min(outer.length, inner.length);
  var pos = [], idx = [];
  for (var i = 0; i < n; i++) {
    pos.push(outer[i][0], 0, outer[i][1], inner[i][0], 0, inner[i][1]);
  }
  for (i = 0; i < n; i++) {
    var a = i * 2, b = ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function shapeFromXy(poly) {
  var s = new THREE.Shape();
  poly.forEach(function (q, i) {
    var p = XY(q[0], q[1]);
    if (i === 0) s.moveTo(p[0], -p[1]); else s.lineTo(p[0], -p[1]);
  });
  return s;
}
// 直接用世界点（x,z）
function shapeFromWorld(points) {
  var s = new THREE.Shape();
  points.forEach(function (p, i) {
    if (i === 0) s.moveTo(p[0], -p[1]); else s.lineTo(p[0], -p[1]);
  });
  return s;
}
function flatShapeGeo(points, y) {
  var g = new THREE.ShapeGeometry(shapeFromWorld(points));
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  return g;
}
function extrudeGeo(points, depth, bevel) {
  var g = new THREE.ExtrudeGeometry(shapeFromWorld(points), {
    depth: depth, bevelEnabled: !!bevel, bevelThickness: .25, bevelSize: .35, bevelSegments: 2
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

function polyCentroid(poly) {
  var a = 0, cx = 0, cz = 0;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var p = XY(poly[i][0], poly[i][1]), q = XY(poly[j][0], poly[j][1]);
    var f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f;
  }
  a *= 0.5;
  return [cx / (6 * a), cz / (6 * a)];
}
function expandPoly(poly, d) {
  var c = polyCentroid(poly);
  return poly.map(function (q) {
    var p = XY(q[0], q[1]);
    var dx = p[0] - c[0], dz = p[1] - c[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] + dx / l * d, p[1] + dz / l * d];
  });
}
function pointInPoly(x, z, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var pi = XY(poly[i][0], poly[i][1]), pj = XY(poly[j][0], poly[j][1]);
    if (((pi[1] > z) !== (pj[1] > z)) &&
        (x < (pj[0] - pi[0]) * (z - pi[1]) / (pj[1] - pi[1]) + pi[0])) inside = !inside;
  }
  return inside;
}
function dist2(lon1, lat1, lon2, lat2) {
  var a = XY(lon1, lat1), b = XY(lon2, lat2);
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/* 连续地表高度：高斯山峦叠加，台地处压平（供落位、造林、避让） */
function gaussSum(wx, wz) {
  var y = 0;
  hillDefs.forEach(function (h) {
    var c = XY(h.lon, h.lat);
    var dx = wx - c[0], dz = wz - c[1];
    y += h.h * Math.exp(-0.5 * ((dx * dx) / (h.rx * h.rx) + (dz * dz) / (h.rz * h.rz)));
  });
  return y;
}
function smooth01(t) { return t * t * (3 - 2 * t); }
function terrainY(wx, wz) {
  var raw = gaussSum(wx, wz), y = raw;
  (typeof HILL_TERRACES !== 'undefined' ? HILL_TERRACES : []).forEach(function (t) {
    var c = XY(t.lon, t.lat);
    var d = Math.hypot(wx - c[0], wz - c[1]);
    if (d < t.r) {
      var blend = smooth01(THREE.MathUtils.clamp((d / t.r - 0.78) / 0.22, 0, 1));
      y = Math.min(y, t.y + (raw - t.y) * blend);
    }
  });
  return Math.max(0, y);
}
function hillHeight(wx, wz) { return terrainY(wx, wz); }

var LAKE_WORLD = null, INNER_WORLD = null;
function inLake(x, z) {
  if (!LAKE_WORLD) {
    LAKE_WORLD = LAKE_SHORE.map(function (q) { return XY(q[0], q[1]); });
    INNER_WORLD = INNER_LAKE.map(function (q) { return XY(q[0], q[1]); });
  }
  return pointInWorldPoly(x, z, LAKE_WORLD) || pointInWorldPoly(x, z, INNER_WORLD);
}

/* ============================================================
 * 大地：圆角奶油色沙盘底板
 * ============================================================ */
function buildTerrain() {
  var slabShape = roundedRectShape(240, 180, 10);
  var slabGeo = new THREE.ExtrudeGeometry(slabShape, {
    depth: 3, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 3.0, bevelSegments: 4
  });
  slabGeo.rotateX(-Math.PI / 2);
  // 顶面（含倒角最高点）落在 y≈-0.05，低于地面(0.02)与水面(0.12)，不遮湖；整体保持圆润矮台
  slabGeo.translate(0, -5.35, 0);
  var slabMat = new THREE.MeshStandardMaterial({ color: 0xe7e2c4, roughness: .95, flatShading: true });
  var slab = new THREE.Mesh(slabGeo, slabMat);
  slab.receiveShadow = true;
  world.add(slab);

  var topGeo = new THREE.ShapeGeometry(roundedRectShape(236, 176, 8));
  topGeo.rotateX(-Math.PI / 2); topGeo.translate(0, 0.02, 0);
  var top = new THREE.Mesh(topGeo, mats.ground);
  top.receiveShadow = true;
  world.add(top);

  // 草地色块：瀛湖湖畔、汉江滨江与周边山谷
  var meadows = [
    [108.90, 32.585, 6.5], [108.855, 32.600, 4.5], [108.940, 32.600, 4.2],
    [109.000, 32.685, 5.5], [109.050, 32.640, 5.0], [108.820, 32.345, 6.0],
    [108.500, 32.500, 7.0], [108.700, 32.400, 6.0], [109.100, 32.720, 4.5],
    [108.950, 32.700, 5.0], [108.300, 32.900, 6.5], [108.200, 33.000, 6.0]
  ];
  meadows.forEach(function (m) {
    var c = XY(m[0], m[1]);
    var pts = [];
    var seg = 22;
    for (var i = 0; i < seg; i++) {
      var a = i / seg * Math.PI * 2;
      var rr = m[2] * (0.82 + 0.28 * Math.sin(a * 3 + m[0] * 40) + 0.12 * Math.cos(a * 5 + m[1] * 30));
      pts.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
    }
    var mat = mats.meadow.clone();
    mat.color.setHSL(0.27 + Math.random() * 0.04, 0.4, 0.62 + Math.random() * 0.08);
    regAuto(mat);
    var mesh = new THREE.Mesh(flatShapeGeo(pts, 0.045), mat);
    mesh.receiveShadow = true;
    world.add(mesh);
  });
}

/* ============================================================
 * 水面
 * ============================================================ */
function buildWater() {
  function addWater(poly, y, opacity) {
    var m = mats.water.clone();
    if (opacity !== undefined) { m.transparent = true; m.opacity = opacity; }
    waterMats.push(m);
    var mesh = new THREE.Mesh(flatShapeGeo(poly.map(function (q) { return XY(q[0], q[1]); }), y), m);
    mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  }
  lakeWater = addWater(LAKE_SHORE, 0.12);
  addWater(INNER_LAKE, 0.12);

  // 瀛湖湖心小潭（翠屏岛旁）
  var c = XY(108.915, 32.618), pond = [];
  for (var i = 0; i < 14; i++) {
    var a = i / 14 * Math.PI * 2;
    pond.push([c[0] + Math.cos(a) * 1.1, c[1] + Math.sin(a) * 0.9]);
  }
  addWater(pond, 0.5, 0.92);

  // 安康城区水网（原型从略）

  // 汉江
  var riverPts = RIVER.pts.map(function (q) { return XY(q[0], q[1]); });
  var rg = ribbonGeo(riverPts, RIVER.width, false);
  var rm2 = new THREE.Mesh(rg, mats.water);
  rm2.position.y = 0.1; rm2.receiveShadow = true; world.add(rm2);
}

/* ============================================================
 * 堤坝与岛屿
 * ============================================================ */
function buildCausewaysAndIslands() {
  // 湖岸浅滩环
  var shoreWorld = LAKE_SHORE.map(function (q) { return XY(q[0], q[1]); });
  var beach = new THREE.Mesh(ringGeo(expandPoly(LAKE_SHORE, 1.5), shoreWorld), mats.beach);
  beach.position.y = 0.08; beach.receiveShadow = true;
  world.add(beach);

  CAUSEWAYS.forEach(function (cw) {
    var pts = cw.pts.map(function (q) { return XY(q[0], q[1]); });
    var fringe = new THREE.Mesh(ribbonGeo(pts, cw.width + 2.0, false), mats.meadow);
    fringe.position.y = 0.15; fringe.receiveShadow = true;
    fringe.userData.causeway = cw.name;
    world.add(fringe);
    var path = new THREE.Mesh(ribbonGeo(pts, cw.width * 0.55, false), mats.path);
    path.position.y = 0.3; path.receiveShadow = true;
    world.add(path);

    // 烟柳
    var n = Math.floor(polylineLength(pts) / 1.7);
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      var pp = samplePolyline(pts, t);
      var tan = polylineTangent(pts, t);
      var side = (i % 2 === 0) ? 1 : -1;
      var ox = -tan[1] * side * (cw.width / 2 + 1.1);
      var oz = tan[0] * side * (cw.width / 2 + 1.1);
      inst.blob.push(instance(
        new THREE.Vector3(pp[0] + ox, 0.34, pp[1] + oz),
        new THREE.Quaternion(),
        new THREE.Vector3(1.15 + Math.random() * .4, .8 + Math.random() * .3, 1.15 + Math.random() * .4),
        willowColor()
      ));
    }
    // 跨江桥（石拱）：按桥长均匀布点
    [0.25, 0.5, 0.75].forEach(function (t) {
      var pp = samplePolyline(pts, t), tan = polylineTangent(pts, t);
      addArchBridge(pp[0], pp[1], Math.atan2(tan[0], tan[1]), 3.4, mats.stone);
    });
  });

  // 岛屿
  ISLANDS.forEach(function (isl) {
    var pts = isl.pts.map(function (q) { return XY(q[0], q[1]); });
    var body = new THREE.Mesh(extrudeGeo(isl.pts.map(function (q) { return XY(q[0], q[1]); }), .42, true), mats.meadow);
    body.position.y = 0.1; body.receiveShadow = true; body.castShadow = true;
    world.add(body);
    // 岛上树木
    var c = polyCentroid(isl.pts);
    var trees = 8;
    for (var i = 0; i < trees; i++) {
      var a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.9;
      var p = [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
      if (!pointInWorldPoly(p[0], p[1], pts)) continue;
      addTreeAt(p[0], p[1], 0.5, Math.random() < .4);
    }
    if (isl.name === '翠屏岛') addPlumTrees(c[0] + 0.6, c[1] + 0.3, 5, 0.55);
  });
}
function pointInWorldPoly(x, z, pts) {
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
function polylineLength(pts) {
  var l = 0; for (var i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l;
}
function samplePolyline(pts, t) {
  var total = polylineLength(pts), acc = t * total;
  for (var i = 1; i < pts.length; i++) {
    var seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc <= seg) {
      var k = acc / seg;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    acc -= seg;
  }
  return pts[pts.length - 1].slice();
}
function polylineTangent(pts, t) {
  var p1 = samplePolyline(pts, Math.max(0, t - 0.01)), p2 = samplePolyline(pts, Math.min(1, t + 0.01));
  var dx = p2[0] - p1[0], dz = p2[1] - p1[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

/* 石拱桥（沿 +z 方向跨度）；返回已放入世界的组 */
function addArchBridge(x, z, rotY, span, mat) {
  var g = makeArchBridge(rotY, span, mat);
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}
function makeArchBridge(rotY, span, mat) {
  span = span || 4; mat = mat || mats.stone;
  var g = new THREE.Group();
  var R = span / 2;
  var arch = new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 7, 18, Math.PI), mat);
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 0.35;
  g.add(arch);
  var deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, span + 0.6), mats.stoneDark);
  deck.position.y = R + 0.4; deck.rotation.x = 0;
  g.add(deck);
  // 栏板
  for (var i = -2; i <= 2; i++) {
    var post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), mats.stone);
    post.position.set(0, R + 0.75, i * R / 2.2);
    g.add(post);
  }
  g.rotation.y = rotY;
  g.traverse(function (o) { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

/* ============================================================
 * 低多边形山峦
 * ============================================================ */
HILLS.forEach(function (h) { hillDefs.push(h); });
// 远景围山（氛围，秦巴山地环绕）：[lon, lat, rx, rz, h]
var FAR_HILLS = [
  [108.45, 32.280, 8, 5, 8], [108.950, 32.220, 9, 5, 7],
  [109.320, 32.400, 7, 5, 8], [109.340, 32.780, 7, 4, 7],
  [109.100, 33.060, 8, 5, 9], [108.700, 33.070, 7, 4, 8],
  [108.400, 32.960, 7, 4, 7], [108.140, 32.650, 8, 5, 9]
];

function buildHillMesh(def) {
  var c = XY(def.lon, def.lat);
  var R = Math.max(def.rx, def.rz) * 1.42;
  var rings = 8, seg = 30;
  var seed = def.lon * 1000 + def.lat * 100;
  var positions = [], colors = [], indices = [];
  var cA = new THREE.Color(pal.grassA), cB = new THREE.Color(pal.grassB), cR = new THREE.Color(pal.rock);

  positions.push(0, def.h, 0);
  var topCol = (def.peak || def.rock) ? cR.clone().lerp(cB, .3) : cB.clone();
  colors.push(topCol.r, topCol.g, topCol.b);

  function noise(x, z) {
    return (Math.sin(x * 0.9 + seed) * Math.cos(z * 1.1 + seed * 1.7) +
      Math.sin(x * 2.3 + seed * 0.6) * 0.5) * 0.5;
  }
  for (var i = 1; i <= rings; i++) {
    var r = i / rings;
    for (var j = 0; j < seg; j++) {
      var a = j / seg * Math.PI * 2;
      var edge = R * r * (1 + (i === rings ? noise(Math.cos(a) * 6, Math.sin(a) * 6) * 0.10 : 0));
      var x = Math.cos(a) * edge, z = Math.sin(a) * edge;
      var wx = c[0] + x, wz = c[1] + z;
      var gx = def.h * Math.exp(-0.5 * ((x / def.rx) * (x / def.rx) + (z / def.rz) * (z / def.rz)));
      var rough = (def.peak ? 1.4 : 0.9) * (0.25 + gx / def.h);
      var y = Math.max(0, terrainY(wx, wz) + noise(x, z) * rough * r);
      if (inLake(wx, wz)) y = 0;   // 山体不漫入湖面
      positions.push(x, y, z);
      var t = Math.min(1, gx / def.h);
      var col = cA.clone().lerp(cB, t * 0.8);
      var rocky = (t > .62 && (def.peak || def.rock || Math.random() < t * .5)) ? 0.6 : 0;
      if (rocky) col.lerp(cR, rocky);
      var shade = 0.92 + noise(x * 1.3, z * 1.3) * 0.08;
      colors.push(Math.min(1, col.r * shade), Math.min(1, col.g * shade), Math.min(1, col.b * shade));
    }
  }
  for (j = 0; j < seg; j++) {
    indices.push(0, 1 + j, 1 + ((j + 1) % seg));
  }
  for (i = 1; i < rings; i++) {
    var r0 = 1 + (i - 1) * seg, r1 = 1 + i * seg;
    for (j = 0; j < seg; j++) {
      var a0 = r0 + j, a1 = r0 + ((j + 1) % seg), b0 = r1 + j, b1 = r1 + ((j + 1) % seg);
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  var mesh = new THREE.Mesh(geo, mats.terrain);
  mesh.position.set(c[0], 0, c[1]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  world.add(mesh);

  // 植栽
  scatterHillTrees(def, c);
  // 裸露岩石
  if (def.rock || def.peak) {
    var rocks = def.peak ? 10 : 5;
    for (var k = 0; k < rocks; k++) {
      var rr = R * (0.15 + Math.random() * 0.55), ang = Math.random() * Math.PI * 2;
      var rx = c[0] + Math.cos(ang) * rr, rz = c[1] + Math.sin(ang) * rr * (def.rz / def.rx);
      if (nearLandmark(rx, rz, 6.5)) continue;
      var ry = hillHeight(rx, rz);
      if (ry < 1) continue;
      var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 1.3, 0), mats.rock);
      rock.position.set(rx, ry + 0.2, rz);
      rock.rotation.set(Math.random(), Math.random() * 3, Math.random());
      rock.scale.y = 0.7 + Math.random() * 0.8;
      rock.castShadow = true;
      world.add(rock);
    }
  }
}

function scatterHillTrees(def, c) {
  var count = def.tree || 20;
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var rr = Math.sqrt(Math.random()) * Math.max(def.rx, def.rz) * 1.25;
    var x = c[0] + Math.cos(a) * rr, z = c[1] + Math.sin(a) * rr * (def.rz / Math.max(def.rx, .01));
    var y = hillHeight(x, z);
    if (y < 0.7) continue;
    if (inLake(x, z)) continue;
    if (nearLandmark(x, z, 8.5)) continue;
    var onTerrace = HILL_TERRACES.some(function (t) {
      var tc = XY(t.lon, t.lat);
      return Math.hypot(x - tc[0], z - tc[1]) < t.r * .95;
    });
    if (onTerrace) continue;
    var cone = Math.random() < (def.peak ? .65 : .45);
    var sc = 0.75 + Math.random() * 0.8 + Math.min(y / def.h, 1) * 0.3;
    pushTree(x, z, y - 0.1, cone, sc);
  }
}

function buildHills() {
  hillDefs.forEach(buildHillMesh);
  // 远山中，树更少更整
  FAR_HILLS.forEach(function (f) {
    buildHillMesh({ lon: f[0], lat: f[1], rx: f[2], rz: f[3], h: f[4], tree: 5 });
  });

  // 环湖沿岸行道树（桃柳间植）
  var shore = LAKE_SHORE.map(function (q) { return XY(q[0], q[1]); });
  var cent = polyCentroid(LAKE_SHORE);
  shore.forEach(function (p, i) {
    if (i % 2 !== 0) return;
    var dx = p[0] - cent[0], dz = p[1] - cent[1], l = Math.hypot(dx, dz) || 1;
    var x = p[0] + dx / l * 3.0, z = p[1] + dz / l * 3.0;
    if (hillHeight(x, z) > 1.2) return;
    var willow = Math.random() < .6;
    pushTree(x, z, 0.05, !willow, 1.0 + Math.random() * .6);
    if (!willow && Math.random() < .35) pushBlossom(x + (Math.random() - .5), z + (Math.random() - .5), 0.05, .8);
  });
}

/* ============================================================
 * 植被实例
 * ============================================================ */
function treeColor(cone) {
  var c = new THREE.Color();
  if (cone) c.setHSL(0.30 + Math.random() * 0.05, 0.42 + Math.random() * .18, 0.26 + Math.random() * 0.12);
  else c.setHSL(0.27 + Math.random() * 0.06, 0.4 + Math.random() * .2, 0.3 + Math.random() * 0.13);
  return c;
}
var TREE_SCALE = 0.62;
// 各地标的额外清空半径（避免树木长进建筑基座）
var CLEAR_R = { bowuguan: 9, longzhou: 8, anlan: 7, nangong: 7, shuanglong: 6.5, yinghu: 6 };
function nearLandmark(x, z, r) {
  r = r || 5.5;
  for (var i = 0; i < SPOTS.length; i++) {
    var s = SPOTS[i];
    var rr = Math.max(r, CLEAR_R[s.id] || 0);
    var p = XY(s.lon, s.lat);
    if (Math.hypot(x - p[0], z - p[1]) < rr) return true;
  }
  return false;
}
function willowColor() {
  return new THREE.Color().setHSL(0.25 + Math.random() * .03, .42, .42 + Math.random() * .1);
}
function blossomColor() {
  return new THREE.Color().setHSL(0.97 + Math.random() * .02, .5, .78 + Math.random() * .1);
}
function instance(pos, quat, scale, color) {
  var m = new THREE.Matrix4(); m.compose(pos, quat, scale);
  return { m: m, c: color };
}
function pushTree(x, z, y, cone, sc) {
  sc *= TREE_SCALE;
  var arr = cone ? inst.cone : inst.blob;
  arr.push(instance(
    new THREE.Vector3(x, y + (cone ? sc * .95 : sc * .75), z),
    new THREE.Quaternion(),
    new THREE.Vector3(sc * (cone ? .8 : 1.05), sc * (cone ? 1.9 : .95), sc * (cone ? .8 : 1.05)),
    treeColor(cone)
  ));
}
function addTreeAt(x, z, y, cone) { pushTree(x, z, y, cone, 0.8 + Math.random() * .7); }
function pushBlossom(x, z, y, sc) {
  inst.blob.push(instance(
    new THREE.Vector3(x, y + sc * .8, z), new THREE.Quaternion(),
    new THREE.Vector3(sc * 1.1, sc, sc * 1.1), blossomColor()));
}
function addPlumTrees(cx, cz, n, y) {
  for (var i = 0; i < n; i++) pushBlossom(cx + (Math.random() - .5) * 3, cz + (Math.random() - .5) * 3, y, .7 + Math.random() * .5);
}

/* 茶园条垄 */
function addTeaField(lon, lat, rows, spacing, ang) {
  var c = XY(lon, lat);
  for (var r = 0; r < rows; r++) {
    for (var s = -rows; s <= rows; s++) {
      var u = s * spacing, v = r * spacing - rows * spacing / 2;
      var x = c[0] + u * Math.cos(ang) - v * Math.sin(ang);
      var z = c[1] + u * Math.sin(ang) + v * Math.cos(ang);
      var y = hillHeight(x, z) + 0.15;
      if (y < 0.5) continue;
      var col = new THREE.Color().setHSL(.29 + Math.random() * .03, .42, .3 + Math.random() * .1);
      inst.tea.push(instance(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, 0)),
        new THREE.Vector3(0.9, 0.4, 0.42), col));
    }
  }
}

function buildVegetation() {
  // 公园区散点树
  var zones = [
    [109.020, 32.680, 40], [108.990, 32.660, 28], [109.030, 32.670, 24],
    [109.000, 32.650, 22], [108.970, 32.690, 22], [109.050, 32.665, 14],
    [108.900, 32.630, 30]
  ];
  zones.forEach(function (zn) {
    var c = XY(zn[0], zn[1]);
    for (var i = 0; i < zn[2]; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 6.5;
      var x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r;
      if (pointInPoly(zn[0] + (x - c[0]) / SCALE, zn[1] - (z - c[1]) / SCALE, LAKE_SHORE)) continue;
      if (nearLandmark(x, z, 6.0)) continue;
      var y = hillHeight(x, z);
      if (y > 14) continue;
      pushTree(x, z, y - .05, Math.random() < .5, .9 + Math.random() * .9);
    }
  });

  // 茶园：紫阳富硒茶 & 平利富硒茶
  addTeaField(108.50, 32.50, 10, 1.05, -0.5);
  addTeaField(109.30, 32.40, 8, 1.0, 0.35);

  // 安康原型：以水景与茶园为主，荷花图略
}
function lotusPads(lon, lat, n, r) {
  var c = XY(lon, lat);
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
    var x = c[0] + Math.cos(a) * rr, z = c[1] + Math.sin(a) * rr;
    var pink = Math.random() < .18;
    inst.lotus.push(instance(
      new THREE.Vector3(x, 0.16, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI),
      new THREE.Vector3(0.5 + Math.random() * .5, 1, 0.5 + Math.random() * .5),
      pink ? new THREE.Color(0xf2a6c0) : new THREE.Color().setHSL(.33, .45, .3 + Math.random() * .15)));
  }
}

function finalizeInstances() {
  function build(arr, geo, mat) {
    if (!arr.length) return;
    var im = new THREE.InstancedMesh(geo, mat, arr.length);
    arr.forEach(function (it, i) {
      im.setMatrixAt(i, it.m);
      im.setColorAt(i, it.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    world.add(im);
    instMeshes.push(im);
    return im;
  }
  build(inst.cone, new THREE.ConeGeometry(1, 2, 7),
    new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }));
  build(inst.blob, new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true }));
  build(inst.tea, new THREE.SphereGeometry(1, 8, 5),
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }));
  var lotusMat = new THREE.MeshStandardMaterial({ roughness: .8, flatShading: true });
  var pads = inst.lotus.filter(function (p) { return p.c.getHex() !== 0xf2a6c0; });
  var flowers = inst.lotus.filter(function (p) { return p.c.getHex() === 0xf2a6c0; });
  var pg = new THREE.CircleGeometry(1, 9); pg.rotateX(-Math.PI / 2);
  build(pads, pg, lotusMat);
  var fm = build(flowers, new THREE.SphereGeometry(0.55, 7, 5),
    new THREE.MeshStandardMaterial({ color: 0xf2a6c0, roughness: .8, flatShading: true }));
  if (fm) fm.userData.noTheme = true;
}

/* ============================================================
 * 城郭：东侧低多边形城区 + 钱江 CBD 意象
 * ============================================================ */
function buildingTextures(base, win) {
  // 日间贴图
  var c = document.createElement('canvas'); c.width = 64; c.height = 128;
  var g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  // 夜景发光贴图（黑底 + 暖色窗格）
  var e = document.createElement('canvas'); e.width = 64; e.height = 128;
  var eg = e.getContext('2d');
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 64, 128);
  for (var y = 8; y < 124; y += 14) {
    for (var x = 6; x < 60; x += 12) {
      var lit = Math.random() < .32;
      g.fillStyle = lit ? 'rgba(120,140,135,0.6)' : win;
      g.fillRect(x, y, 7, 8);
      if (lit) {
        eg.fillStyle = Math.random() < .8 ? 'rgba(255,214,140,1)' : 'rgba(190,224,255,1)';
        eg.fillRect(x, y, 7, 8);
      }
    }
  }
  return { map: new THREE.CanvasTexture(c), emap: new THREE.CanvasTexture(e) };
}

function inCityForbidden(x, z) {
  if (pointInWorldPoly(x, z, LAKE_SHORE.map(function (q) { return XY(q[0], q[1]); }))) return true;
  // 山体避让
  for (var i = 0; i < hillDefs.length; i++) {
    var h = hillDefs[i], c = XY(h.lon, h.lat);
    var ax = h.rx * 1.05, az = h.rz * 1.05;
    if ((x - c[0]) * (x - c[0]) / (ax * ax) + (z - c[1]) * (z - c[1]) / (az * az) < 1) return true;
  }
  // 地标与湖岸公园避让
  for (i = 0; i < SPOTS.length; i++) {
    var sc = XY(SPOTS[i].lon, SPOTS[i].lat);
    if (Math.hypot(x - sc[0], z - sc[1]) < 4.6) return true;
  }
  // 汉江
  for (i = 0; i < RIVER.pts.length - 1; i++) {
    var a = XY(RIVER.pts[i][0], RIVER.pts[i][1]), b = XY(RIVER.pts[i + 1][0], RIVER.pts[i + 1][1]);
    var dx = b[0] - a[0], dz = b[1] - a[1];
    var t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    var px = a[0] + dx * t, pz = a[1] + dz * t;
    if (Math.hypot(x - px, z - pz) < RIVER.width / 2 + 1.5) return true;
  }
  return false;
}

function buildCity() {
  var variants = [
    { tex: buildingTextures('#efeee6', 'rgba(150,165,160,0.55)'), list: [] },
    { tex: buildingTextures('#dde3da', 'rgba(120,140,135,0.5)'), list: [] },
    { tex: buildingTextures('#cfd8d2', 'rgba(90,120,115,0.55)'), list: [] }
  ];
  var unitGeo = new THREE.BoxGeometry(1, 1, 1);
  unitGeo.translate(0, 0.5, 0);

  var cell = 3.2;
  for (var bx = -8; bx < 46; bx += cell) {
    for (var bz = -36; bz < -17; bz += cell) {
      var x = bx + (Math.random() - .5) * 1.1, z = bz + (Math.random() - .5) * 1.1;
      if (inCityForbidden(x, z)) continue;
      // 密度：越靠城区中心越密
      var density = .42 + Math.min((x + 8) / 54, 1) * .3;
      if (Math.random() > density) continue;
      var w = 1.2 + Math.random() * 1.0, d = 1.2 + Math.random() * 1.0;
      var cbdBand = (x > 2 && x < 26 && z > -30 && z < -20);
      // 安康城区天际线：汉江北岸，低层为主，江畔略高（艺术化比例）
      var hgt;
      if (cbdBand) hgt = 2.2 + Math.random() * 2.4;
      else hgt = 0.9 + Math.random() * 1.8;
      var vi = Math.random() < .18 ? 2 : (Math.random() < .45 ? 1 : 0);
      var m = new THREE.Matrix4();
      m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, hgt, d));
      variants[vi].list.push({ m: m });
    }
  }

  variants.forEach(function (v) {
    var mat = new THREE.MeshStandardMaterial({
      map: v.tex.map, emissiveMap: v.tex.emap, emissive: 0xffffff, emissiveIntensity: 0,
      roughness: .85, flatShading: true
    });
    mat.userData.isBuilding = true;
    buildingMats.push(mat);
    var im = new THREE.InstancedMesh(unitGeo, mat, v.list.length);
    v.list.forEach(function (b, i) { im.setMatrixAt(i, b.m); });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    world.add(im);
  });

  // 道路网格（浅色细线）
  var roadMat = new THREE.MeshStandardMaterial({ color: 0xd5d0b8, roughness: 1 });
  for (var rx = 2; rx < 60; rx += 12) {
    var g = ribbonGeo([[rx, -42], [rx, 24]], 1.1, false);
    var r = new THREE.Mesh(g, roadMat); r.position.y = 0.06; world.add(r);
  }
  for (var rz = -40; rz < 26; rz += 12) {
    var g2 = ribbonGeo([[-2, rz], [64, rz]], 1.1, false);
    var r2 = new THREE.Mesh(g2, roadMat); r2.position.y = 0.06; world.add(r2);
  }
  // 滨湖大道
  var shore = LAKE_SHORE.map(function (q) { return XY(q[0], q[1]); });
  var cent = polyCentroid(LAKE_SHORE);
  var ring = shore.filter(function (p) { return p[0] > cent[0]; }).map(function (p) {
    var dx = p[0] - cent[0], dz = p[1] - cent[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] + dx / l * 4.4, p[1] + dz / l * 4.4];
  });
  if (ring.length > 2) {
    var rg = ribbonGeo(ring, 1.6, false);
    var rroad = new THREE.Mesh(rg, roadMat); rroad.position.y = .07; world.add(rroad);
  }

  /* ---- 安康城区意象：江畔楼群 ---- */
  var cbd = new THREE.Group();
  world.add(cbd);
  var cityBlocks = [
    [6, 6.0, -22], [14, 5.0, -24], [-2, 7.5, -20], [22, 4.5, -26], [10, 5.5, -19], [-8, 6.5, -25]
  ];
  cityBlocks.forEach(function (b) {
    var bh = b[1];
    var tw = new THREE.Mesh(new THREE.BoxGeometry(2.4, bh, 2.4), mats.stone);
    tw.position.set(b[0], bh / 2, b[2]);
    tw.castShadow = true; tw.receiveShadow = true; cbd.add(tw);
    var roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, .4, 2.6), mats.roofDark);
    roof.position.set(b[0], bh + .2, b[2]); cbd.add(roof);
  });
}

function addCableBridge(x, z, ang) {
  var g = new THREE.Group();
  var deck = new THREE.Mesh(new THREE.BoxGeometry(3, .5, 22), mats.stone);
  deck.position.y = 1; g.add(deck);
  [-4.5, 4.5].forEach(function (px) {
    var pyl = new THREE.Mesh(new THREE.BoxGeometry(.7, 9, .7), mats.white);
    pyl.position.set(px, 5, 0); pyl.castShadow = true; g.add(pyl);
  });
  var cablePts = [];
  [-4.5, 4.5].forEach(function (px) {
    for (var i = -5; i <= 5; i++) {
      cablePts.push(px, 9.2, 0, px * .3, 1.3, i * 2);
    }
  });
  var cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xe8ece6 })));
  g.position.set(x, 0, z); g.rotation.y = ang;
  world.add(g);
}

/* ============================================================
 * 地标建筑（差异化建模）
 * ============================================================ */
function shadowize(o) {
  o.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return o;
}

// 多层楼阁式塔；scheme: default(黛瓦白墙) / bronze(铜构) / wood(木构)
function pagodaModel(tiers, R, bodyH, roofH, slender, scheme) {
  var g = new THREE.Group();
  var wallMat = mats.wallCream, roofMat = mats.roof, eaveMat = mats.roofDark, colMat = mats.red;
  if (scheme === 'bronze') { wallMat = pagodaBronzeWall; roofMat = pagodaBronzeRoof; eaveMat = pagodaBronzeEave; colMat = pagodaBronzeEave; }
  if (scheme === 'wood') { wallMat = pagodaWoodWall; roofMat = mats.roofDark; eaveMat = mats.roofDark; colMat = mats.red; }
  var terrace = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.7, R * 1.9, .7, 8), mats.stone);
  terrace.position.y = .35; g.add(terrace);
  var rail = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.75, R * 1.75, .25, 8, 1, true), mats.stoneDark);
  rail.position.y = .85; g.add(rail);
  var y = .7;
  for (var i = 0; i < tiers; i++) {
    var r = R * (slender ? 1 - i * .06 : 1 - i * .1);
    var body = new THREE.Mesh(new THREE.CylinderGeometry(r * .86, r, bodyH, 8), wallMat);
    body.position.y = y + bodyH / 2; g.add(body);
    // 廊柱
    for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2;
      var col = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, bodyH + .1, 6), colMat);
      col.position.set(Math.cos(a) * r * .82, y + bodyH / 2, Math.sin(a) * r * .82);
      g.add(col);
    }
    // 檐
    var eave = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.28, r * 1.34, .22, 8), eaveMat);
    eave.position.y = y + bodyH; g.add(eave);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.22, roofH, 8), roofMat);
    roof.position.y = y + bodyH + roofH / 2; g.add(roof);
    y += bodyH + roofH * .68;
  }
  // 塔刹
  var spire = new THREE.Mesh(new THREE.CylinderGeometry(.08, .14, 1.6, 6), mats.gold);
  spire.position.y = y + .8; g.add(spire);
  var pearl = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 6), mats.gold);
  pearl.position.y = y + 1.8; g.add(pearl);
  g.userData.height = y + 2.1;
  return shadowize(g);
}

// 宝顶攒尖亭
function pavilionModel(size, hex) {
  var g = new THREE.Group();
  var ns = hex ? 6 : 4;
  var base = new THREE.Mesh(hex ? new THREE.CylinderGeometry(size, size * 1.08, .5, ns) :
    new THREE.BoxGeometry(size * 2, .5, size * 2), mats.stone);
  base.position.y = .25; g.add(base);
  for (var i = 0; i < ns; i++) {
    var a = i / ns * Math.PI * 2 + Math.PI / ns;
    var pillar = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 2.1, 6), mats.red);
    pillar.position.set(Math.cos(a) * size * .78, 1.55, Math.sin(a) * size * .78);
    g.add(pillar);
  }
  var roof = new THREE.Mesh(new THREE.ConeGeometry(size * 1.35, 1.25, ns), mats.roof);
  roof.position.y = 3.0; g.add(roof);
  var tip = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), mats.gold);
  tip.position.y = 3.75; g.add(tip);
  g.userData.height = 4;
  return shadowize(g);
}

// 硬山大殿（含正脊）
function hallModel(w, d, h, wallMat) {
  var g = new THREE.Group();
  var ter = new THREE.Mesh(new THREE.BoxGeometry(w * 1.3, .6, d * 1.3), mats.stone);
  ter.position.y = .3; g.add(ter);
  var wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat || mats.wallOchre);
  wall.position.y = .6 + h / 2; g.add(wall);
  // 红柱廊
  for (var i = -2; i <= 2; i++) {
    var pc = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, h + .3, 6), mats.red);
    pc.position.set(i * w / 5, .6 + h / 2, d / 2 + .08); g.add(pc);
  }
  var door = new THREE.Mesh(new THREE.BoxGeometry(w * .28, h * .62, .12), mats.red);
  door.position.set(0, .6 + h * .35, d / 2 + .06); g.add(door);
  // 四阿顶（用 4 棱锥 + 正脊）
  var roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1.7, 4), mats.roofDark);
  roof.scale.set(w * .78, 1, d * .82);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = .6 + h + 1.05; g.add(roof);
  var ridge = new THREE.Mesh(new THREE.BoxGeometry(w * .55, .22, .22), mats.roof);
  ridge.position.y = .6 + h + 1.75; g.add(ridge);
  // 鸱吻
  [-1, 1].forEach(function (s) {
    var ek = new THREE.Mesh(new THREE.ConeGeometry(.22, .55, 4), mats.roof);
    ek.position.set(s * w * .28, .6 + h + 1.9, 0); g.add(ek);
  });
  g.userData.height = .6 + h + 2.2;
  return shadowize(g);
}

// 多层楼阁（安澜楼）
function towerModel(levels) {
  var g = new THREE.Group();
  var ter = new THREE.Mesh(new THREE.BoxGeometry(8, .8, 8), mats.stone);
  ter.position.y = .4; g.add(ter);
  var y = .8, s = 3.4;
  for (var i = 0; i < levels; i++) {
    var body = new THREE.Mesh(new THREE.BoxGeometry(s * 1.5, 2.1, s * 1.5), i % 2 ? mats.wallOchre : mats.wallCream);
    body.position.y = y + 1.05; g.add(body);
    for (var k = 0; k < 4; k++) {
      var a = k / 4 * Math.PI * 2 + Math.PI / 4;
      var pc = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 2.2, 6), mats.red);
      pc.position.set(Math.cos(a) * s * .78, y + 1.1, Math.sin(a) * s * .78); g.add(pc);
    }
    var balcony = new THREE.Mesh(new THREE.BoxGeometry(s * 1.85, .18, s * 1.85), mats.stoneDark);
    balcony.position.y = y; g.add(balcony);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1.4, 4), mats.roof);
    roof.rotation.y = Math.PI / 4; roof.scale.set(s * 1.15, 1, s * 1.15);
    roof.position.y = y + 2.8; g.add(roof);
    y += 3.1; s *= .82;
  }
  var fin = new THREE.Mesh(new THREE.ConeGeometry(.4, 1.4, 6), mats.gold);
  fin.position.y = y + .6; g.add(fin);
  g.userData.height = y + 1.4;
  return shadowize(g);
}

function buildAllLandmarks() {
  SPOTS.forEach(function (spot) {
    var q = XY(spot.lon, spot.lat);
    var x = q[0], z = q[1];
    var onIsland = ISLANDS.some(function (isl) { return pointInPoly(spot.lon, spot.lat, isl.pts); });
    var y;
    if (inLake(x, z)) y = onIsland ? 0.5 : 0.12;
    else y = hillHeight(x, z);
    var g = new THREE.Group();
    var h = 4;
    var rot = spot.rot || 0;

    switch (spot.kind) {
      case 'pagoda':   // 塔型变体（安康暂无 pagoda 类景点，保留供扩展；可用 spot.pagodaScheme 指定 brick|wood|bronze）
        if (spot.pagodaScheme === 'brick') {
          // 变体 A：秀挺密檐砖塔（约 45m ≈ 4.3 单位）
          var bt = pagodaModel(7, .5, 0.95, .7, true);
          bt.scale.setScalar(.38);
          g.add(bt); h = 5.0;
          // 蛤蟆岩（赭色小岩点缀）
          for (var r0 = 0; r0 < 5; r0++) {
            var rk = new THREE.Mesh(new THREE.DodecahedronGeometry(.35 + Math.random() * .4, 0), mats.rock);
            rk.position.set((Math.random() - .5) * 3.4, .2, 1.2 + (Math.random() - .5) * 2);
            rk.scale.y = .6; g.add(rk);
          }
        } else if (spot.pagodaScheme === 'wood') {
          // 变体 B：木构多层塔（约 60m ≈ 5.6 单位）
          var lh = pagodaModel(6, 1.5, 1.7, 1.0, false, 'wood');
          lh.scale.setScalar(.34);
          g.add(lh); h = 6.0;
        } else {
          // 变体 C：铜构楼阁塔（约 71m ≈ 6.6 单位）
          var lf = pagodaModel(5, 1.7, 1.6, 1.0, false, 'bronze');
          lf.scale.setScalar(.5);
          g.add(lf); h = 7.4;
        }
        g.rotation.y = 0.3;
        break;
      case 'pavilion':
        g.add(pavilionModel(2.1, false)); g.scale.setScalar(.45); h = 2.4;
        addDock(g, 2.1, 3.4);
        break;
      case 'academy': // 安康博物馆：石坊 + 小阁 + 梅
        var arch = pailouModel(); arch.position.z = 2.2; g.add(arch);
        var ge = pavilionModel(1.8, true); ge.position.z = -1.2; g.add(ge);
        addPlumTrees(2.2, -1.6, 3, 0.4);
        g.scale.setScalar(.55); h = 3.0;
        break;
      case 'garden':   // 园林变体（安康暂无 garden 类景点，保留供扩展）
        g.add(pavilionModel(1.9, Math.random() < .5));
        addZigzagBridge(g);
        g.scale.setScalar(.55);
        for (var f0 = 0; f0 < 18; f0++) {   // 花圃散布
          var fl = new THREE.Mesh(new THREE.SphereGeometry(.22, 6, 5),
            new THREE.MeshStandardMaterial({ color: [0xe88cae, 0xf4e3f4, 0xd96f8f][f0 % 3], flatShading: true, roughness: .8 }));
          var a0 = Math.random() * Math.PI * 2, rr0 = 2.2 + Math.random() * 1.4;
          fl.position.set(Math.cos(a0) * rr0, .5, Math.sin(a0) * rr0); g.add(fl);
        }
        h = 4;
        break;
      case 'bridge': // 石拱桥（安康暂无 bridge 类景点，保留供扩展）
        var br = new THREE.Group();
        var archTop = new THREE.Mesh(new THREE.TorusGeometry(3.2, .3, 8, 20, Math.PI), mats.stone);
        archTop.rotation.y = Math.PI / 2; archTop.position.y = .35; br.add(archTop);
        var deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, .25, 7.4), mats.stoneDark);
        deck.position.y = 3.45; br.add(deck);
        var stele = new THREE.Mesh(new THREE.BoxGeometry(.3, 1.6, .2), mats.stone);
        stele.position.set(1.2, 1.2, 0); br.add(stele);
        var cap = new THREE.Mesh(new THREE.BoxGeometry(.7, .25, .5), mats.roofDark);
        cap.position.set(1.2, 2.1, 0); br.add(cap);
        br.rotation.y = -0.6;
        br.scale.setScalar(.6);
        g.add(br);
        // 引桥
        var ap1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, .16, 2.4), mats.stoneDark);
        ap1.position.set(0, .18, 5.6); br.add(ap1);
        var ap2 = ap1.clone(); ap2.position.z = -5.6; br.add(ap2);
        h = 2.6;
        break;
      case 'island': // 岛屿：三座葫芦石塔（约 2m）+ 小亭（安康暂无 island 类景点，保留供扩展）
        var huting = pavilionModel(1.5, true); huting.scale.setScalar(.45); g.add(huting);
        [[-1.5, 1.0], [0.3, 1.4], [-0.4, -0.5]].forEach(function (pp) {
          var gourd = new THREE.Group();
          var base = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, .6, 8), mats.stone);
          base.position.y = .3; gourd.add(base);
          var b1 = new THREE.Mesh(new THREE.SphereGeometry(.42, 10, 8), mats.wallCream);
          b1.position.y = .85; gourd.add(b1);
          var b2 = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8), mats.wallCream);
          b2.position.y = 1.35; gourd.add(b2);
          var top = new THREE.Mesh(new THREE.ConeGeometry(.16, .45, 8), mats.stoneDark);
          top.position.y = 1.75; gourd.add(top);
          gourd.position.set(pp[0], -0.32, pp[1] - 2.2);
          gourd.scale.setScalar(.5);
          g.add(gourd);
        });
        h = 2.0;
        break;
      case 'water':
        if (spot.id === 'hanjiang') {
          // 汉江：江畔亭 + 石拱桥
          var bp = pavilionModel(1.5, false); bp.position.set(2.0, .28, 0); bp.scale.setScalar(.5); g.add(bp);
          var sb = makeArchBridge(0, 4.4, mats.stone); sb.position.set(-2.2, .18, 0); sb.scale.setScalar(.6); g.add(sb);
          h = 2.4;
        } else { // 瀛湖 / 千层河：草亭
          var xp = pavilionModel(2.0, true); xp.scale.setScalar(.5); g.add(xp); h = 2.2;
        }
        break;
      case 'temple':
        if (spot.id === 'nanxi') {
          // 香溪洞：三进道观 + 崖壁造像
          var gate = hallModel(5, 3.4, 2.2, mats.wallOchre); gate.position.set(0, 0, 9); g.add(gate);
          var h1 = hallModel(7.5, 5.5, 3.2, mats.wallOchre); h1.position.set(0, .5, 2.5); g.add(h1);
          var h2 = hallModel(9, 6.5, 4, mats.wallOchre); h2.position.set(0, 1.4, -5); g.add(h2);
          // 崖壁造像岩（散布于观宇西侧林坡）
          for (var ri = 0; ri < 11; ri++) {
            var a2 = -Math.PI / 2 + (ri - 5) * .18;
            var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.0, 0), mats.rock);
            rock.position.set(Math.cos(a2) * 9.5 + (Math.random() - .5) * 2, 1.2 + Math.random() * 2.2, Math.sin(a2) * 9.5 - 5);
            rock.scale.y = .8 + Math.random() * .8;
            g.add(rock);
          }
          // 香溪洞主殿（约 33m ≈ 3 单位）
          h = 4.0; g.rotation.y = -Math.PI / 2; g.scale.setScalar(.42);
        } else { // 南宫山 / 双龙溶洞：一般寺院（大殿约 20m ≈ 1.9 单位）
          var hall = hallModel(6.5, 4.5, 2.8, mats.wallOchre); g.add(hall);
          var bellP = pavilionModel(1.7, false); bellP.position.x = 4.6; g.add(bellP);
          var bell = new THREE.Mesh(new THREE.CylinderGeometry(.7, .9, 1.6, 12), mats.bronze);
          bell.position.set(4.6, 1.4, 0); g.add(bell);
          h = 3.0; g.rotation.y = -0.25; g.scale.setScalar(.45);
        }
        break;
      case 'tower':
        // 安澜楼（真实高约 40m ≈ 3.7 单位）
        g.add(towerModel(3)); g.scale.setScalar(.34); h = 4.4;
        g.rotation.y = .5;
        break;
      case 'tea':
        var teaP = pavilionModel(2.0, false); teaP.scale.setScalar(.55); g.add(teaP);
        // 茶炉小景
        var stove = new THREE.Mesh(new THREE.CylinderGeometry(.4, .5, .8, 8), mats.stoneDark);
        stove.position.set(2.6, .4, 1.4); g.add(stove);
        if (spot.id === 'chashi') {   // 紫阳富硒茶：加一口茶井
          var well = new THREE.Mesh(new THREE.CylinderGeometry(.8, .7, .7, 10), mats.stoneDark);
          well.position.set(-2.8, .35, 1.8); g.add(well);
          var wellW = mats.water.clone(); waterMats.push(wellW);
          var ww = new THREE.Mesh(new THREE.CircleGeometry(.62, 10), wellW);
          ww.rotation.x = -Math.PI / 2; ww.position.set(-2.8, .72, 1.8); g.add(ww);
        }
        h = 2.4;
        break;
      case 'city': // 城市广场与喷泉（安康暂无 city 类景点，保留供扩展）
        var rim = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, .4, 24), mats.stone);
        rim.position.set(0, .2, -2.6); g.add(rim);
        var ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.4, .12, 8, 30), mats.bronze);
        ring2.rotation.x = Math.PI / 2; ring2.position.set(0, .5, -2.6); g.add(ring2);
        var jetMat = new THREE.LineBasicMaterial({ color: 0xbfeee8, transparent: true, opacity: .8 });
        var jg = new THREE.BufferGeometry();
        var jpos = [];
        for (var ji = 0; ji < 18; ji++) {
          var ja = ji / 18 * Math.PI * 2;
          jpos.push(Math.cos(ja) * 2.4, .5, -2.6 + Math.sin(ja) * 2.4, Math.cos(ja) * 2.4, 3.2 + Math.random() * 2, -2.6 + Math.sin(ja) * 2.4);
        }
        jg.setAttribute('position', new THREE.Float32BufferAttribute(jpos, 3));
        var jetsLine = new THREE.LineSegments(jg, jetMat);
        jetsLine.userData.base = jpos.slice();
        jets.push(jetsLine);
        g.add(jetsLine);
        g.scale.setScalar(.5);
        h = 3.0;
        break;
    }

    g.position.set(x, y, z);
    g.userData.spotId = spot.id;
    g.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.userData.spotId = spot.id;
        clickables.push(o);
      }
    });
    world.add(g);

    // 夜景灯笼
    [ [-1.6, 0, 1.4], [1.6, 0, 1.4] ].forEach(function (lp) {
      var sp = makeLantern();
      sp.position.set(lp[0], 2.6, lp[1]);
      g.add(sp);
    });

    var anchor = new THREE.Vector3(x, y + h + 3.2, z);
    landmarks.push({ spot: spot, group: g, anchor: anchor, height: h });
    spotsById[spot.id] = spot;
  });
}

function addDock(g, w, len) {
  var dock = new THREE.Mesh(new THREE.BoxGeometry(w, .18, len), mats.wood);
  dock.position.set(0, .12, (len) / 2 + 1.2); g.add(dock);
  for (var i = 0; i < 4; i++) {
    var p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .8, 5), mats.wood);
    p.position.set((i % 2 ? .8 : -.8), .4, 1.5 + Math.floor(i / 2) * len / 2); g.add(p);
  }
}
function addZigzagBridge(g) {
  var segs = 4;
  for (var i = 0; i < segs; i++) {
    var s = new THREE.Mesh(new THREE.BoxGeometry(1.7, .14, 1.5), mats.wood);
    s.position.set((i % 2 ? .8 : -.8) * (i % 2 ? 1 : 0.8) - 1.2, .12, 2.6 + i * 1.3);
    s.rotation.y = (i % 2 ? .5 : -.5);
    g.add(s);
  }
}
function pailouModel() {
  var g = new THREE.Group();
  [-2, 0, 2].forEach(function (x, i) {
    var p = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, 3.2, 6), mats.red);
    p.position.set(x, 1.6, 0); g.add(p);
  });
  var l1 = new THREE.Mesh(new THREE.BoxGeometry(5.4, .4, .4), mats.red); l1.position.y = 2.6; g.add(l1);
  var r1 = new THREE.Mesh(new THREE.BoxGeometry(4.8, .3, .34), mats.roofDark); r1.position.y = 3.1; g.add(r1);
  var r2 = new THREE.Mesh(new THREE.ConeGeometry(.9, .7, 4), mats.roof);
  r2.rotation.y = Math.PI / 4; r2.scale.set(2.6, 1, .5); r2.position.y = 3.55; g.add(r2);
  return g;
}
function makeLantern() {
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var ctx = c.getContext('2d');
  var grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,196,120,1)');
  grad.addColorStop(.4, 'rgba(255,150,70,.8)');
  grad.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sp.scale.set(2.4, 2.4, 1);
  lanternSprites.push(sp);
  return sp;
}

/* ============================================================
 * 城市主要道路 + 轨道交通
 * ============================================================ */
var roadLabelSprites = [], stationBadges = [], stationNames = [], metroGroup = null;

function roadTextTexture(text) {
  var fs = 34, pad = 12;
  var tmp = document.createElement('canvas').getContext('2d');
  tmp.font = '600 ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  var tw = tmp.measureText(text).width;
  var w = Math.ceil(tw + pad * 2), h = fs + pad * 2;
  var c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  var g = c.getContext('2d'); g.scale(2, 2);
  g.font = '600 ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  roundRect(g, .5, .5, w - 1, h - 1, h / 2);
  g.fillStyle = 'rgba(252,250,242,.82)'; g.fill();
  g.strokeStyle = 'rgba(120,104,72,.35)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#7a6a48'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, w / 2, h / 2 + 1);
  var tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  return { tex: tex, aspect: w / h };
}

function buildRoads() {
  var roadMat = new THREE.MeshStandardMaterial({ color: 0xbcb49e, roughness: .95, flatShading: true });
  themedMats.push({ mat: roadMat, day: 0xbcb49e, sunset: 0xb4a98e, night: 0x3d4248 });
  ROADS.forEach(function (rd) {
    var pts = rd.pts.map(function (q) { return XY(q[0], q[1]); });
    var geo = ribbonGeo(pts, rd.w, false);
    var mesh = new THREE.Mesh(geo, roadMat);
    mesh.position.y = 0.085;
    mesh.receiveShadow = true;
    world.add(mesh);
    // 路名
    var lp = XY(rd.label[0], rd.label[1]);
    var t = roadTextTexture(rd.name);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, transparent: true, depthTest: true, depthWrite: false }));
    sp.position.set(lp[0], 1.5, lp[1]);
    sp.scale.set(t.aspect * 1.5, 1.5, 1);
    sp.userData.aspect = t.aspect;
    sp.renderOrder = 50;
    world.add(sp);
    roadLabelSprites.push(sp);
  });
}

function stationBadgeTexture(color, transfer) {
  var S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  var g = c.getContext('2d');
  var col = '#' + new THREE.Color(color).getHexString();
  g.beginPath(); g.arc(S / 2, S / 2, 52, 0, Math.PI * 2);
  g.fillStyle = col; g.fill();
  if (transfer) { g.lineWidth = 9; g.strokeStyle = '#ffffff'; g.stroke(); }
  g.beginPath(); g.arc(S / 2, S / 2, 40, 0, Math.PI * 2);
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('M', S / 2, S / 2 + 3);
  var tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  return tex;
}
function stationNameTexture(text) {
  var fs = 28, pad = 10;
  var tmp = document.createElement('canvas').getContext('2d');
  tmp.font = '600 ' + fs + 'px "PingFang SC",sans-serif';
  var tw = tmp.measureText(text).width;
  var w = Math.ceil(tw + pad * 2), h = fs + pad * 2;
  var c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  var g = c.getContext('2d'); g.scale(2, 2);
  g.font = '600 ' + fs + 'px "PingFang SC",sans-serif';
  roundRect(g, .5, .5, w - 1, h - 1, h / 2);
  g.fillStyle = 'rgba(38,46,54,.78)'; g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  var tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  return { tex: tex, aspect: w / h };
}

function buildMetro() {
  metroGroup = new THREE.Group();
  world.add(metroGroup);
  var byName = {};
  METRO_STATIONS.forEach(function (s) {
    var p = XY(s.lon, s.lat);
    s._x = p[0]; s._z = p[1];
    byName[s.name] = s;
  });

  // 线路连接细管
  METRO_LINES.forEach(function (L) {
    var col = METRO_LINE_COLORS[L.line];
    var mat = new THREE.MeshStandardMaterial({ color: col, roughness: .5, metalness: .1, emissive: col, emissiveIntensity: .25 });
    var seq = L.seq;
    for (var i = 0; i < seq.length - 1; i++) {
      var a = byName[seq[i]], b = byName[seq[i + 1]];
      if (!a || !b) continue;
      var dx = b._x - a._x, dz = b._z - a._z, len = Math.hypot(dx, dz);
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, len, 8), mat);
      tube.position.set((a._x + b._x) / 2, .32, (a._z + b._z) / 2);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, 0, dz / len));
      metroGroup.add(tube);
    }
  });

  // 站标记
  METRO_STATIONS.forEach(function (s) {
    var col = METRO_LINE_COLORS[s.lines[0]];
    var badge = new THREE.Sprite(new THREE.SpriteMaterial({
      map: stationBadgeTexture(col, s.lines.length > 1), transparent: true, depthTest: false, depthWrite: false
    }));
    badge.position.set(s._x, 2.7, s._z);
    badge.scale.set(1.7, 1.7, 1);
    badge.renderOrder = 80;
    world.add(badge);
    stationBadges.push(badge);

    var nt = stationNameTexture(s.name + (s.lines.length > 1 ? ' ·换乘' : ''));
    var nm = new THREE.Sprite(new THREE.SpriteMaterial({ map: nt.tex, transparent: true, depthTest: false, depthWrite: false }));
    nm.position.set(s._x + 1.7, 2.55, s._z);
    nm.scale.set(nt.aspect * 1.1, 1.1, 1);
    nm.userData.aspect = nt.aspect;
    nm.renderOrder = 79;
    nm.userData.baseW = nt.aspect * 1.1;
    world.add(nm);
    stationNames.push(nm);
  });
}

/* ============================================================
 * 环境生灵：游船 / 涟漪 / 飞鸟
 * ============================================================ */
function buildAmbientLife() {
  // 瀛湖游船航线
  var paths = [
    [[108.870, 32.600], [108.900, 32.586], [108.930, 32.596], [108.910, 32.616]],
    [[108.850, 32.598], [108.880, 32.590], [108.900, 32.605]],
    [[108.890, 32.578], [108.920, 32.588], [108.940, 32.600]],
    [[108.860, 32.614], [108.890, 32.620], [108.920, 32.614]],
    [[108.880, 32.602], [108.910, 32.606], [108.930, 32.610]]
  ];
  paths.forEach(function (path, pi) {
    var boat = makeBoat(pi % 2 === 0);
    boat.userData.path = path.map(function (q) { return v3(q[0], q[1], 0); });
    boat.userData.t = Math.random();
    boat.userData.speed = 0.018 + Math.random() * 0.015;
    boat.userData.dir = Math.random() < .5 ? 1 : -1;
    boat.userData.ph = Math.random() * 10;
    boats.push(boat);
    world.add(boat);
  });

  // 涟漪环（初始随机散布湖面）
  var rippleMat = new THREE.MeshBasicMaterial({ color: 0xd8f4ee, transparent: true, opacity: 0, side: THREE.DoubleSide });
  for (var i = 0; i < 8; i++) {
    var ring = new THREE.Mesh(new THREE.RingGeometry(.95, 1, 28), rippleMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .16;
    var p = randomLakePoint();
    ring.position.x = p[0]; ring.position.z = p[1];
    ring.userData.life = Math.random();
    ripples.push(ring);
    world.add(ring);
  }

  // 飞鸟
  for (var b = 0; b < 5; b++) {
    var bird = makeBird();
    bird.userData.cx = -10 + Math.random() * 40;
    bird.userData.cz = -10 + Math.random() * 30;
    bird.userData.r = 30 + Math.random() * 25;
    bird.userData.ph = Math.random() * Math.PI * 2;
    bird.userData.y = 34 + Math.random() * 14;
    birds.push(bird);
    scene.add(bird);
  }
}

function randomLakePoint() {
  var c = polyCentroid(LAKE_SHORE);
  for (var i = 0; i < 40; i++) {
    var a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 11;
    var x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r;
    if (pointInWorldPoly(x, z, LAKE_SHORE.map(function (q) { return XY(q[0], q[1]); }))) return [x, z];
  }
  return c;
}

function makeBoat(withCabin) {
  var g = new THREE.Group();
  var hull = new THREE.Mesh(new THREE.CylinderGeometry(.45, .62, 2.6, 6), mats.wood);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, .55);
  hull.position.y = .35;
  g.add(hull);
  if (withCabin) {
    var cabin = new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, 1.0, 8, 1, false, 0, Math.PI), mats.white);
    cabin.position.y = .95; g.add(cabin);
  }
  var lamp = makeLantern();
  lamp.scale.set(1.2, 1.2, 1);
  lamp.position.set(0, 1.3, .7);
  g.add(lamp);
  shadowize(g);
  return g;
}
function makeBird() {
  var pts = [0, 0, 0, -.55, .25, 0, 0, 0, 0, .55, .25, 0];
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  var line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x5a6660, transparent: true, opacity: .75 }));
  var g = new THREE.Group();
  g.add(line); g.scale.setScalar(1.4);
  g.userData.wing = line;
  return g;
}

/* ============================================================
 * 标签（Canvas 胶囊 Sprite）
 * ============================================================ */
function labelTexture(text, active) {
  var pad = 18, fs = 30, dot = 18;
  var tmp = document.createElement('canvas').getContext('2d');
  tmp.font = '500 ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  var tw = tmp.measureText(text).width;
  var w = Math.ceil(tw + pad * 3 + dot), h = 56;
  var c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  var g = c.getContext('2d'); g.scale(2, 2);
  g.font = '500 ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  roundRect(g, 1, 1, w - 2, h - 2, h / 2);
  if (active) {
    g.fillStyle = '#2f8f7d'; g.fill();
    g.strokeStyle = '#2f8f7d';
  } else {
    g.fillStyle = pal.labelBg; g.fill();
    g.strokeStyle = pal.labelBorder; g.lineWidth = 1.2; g.stroke();
  }
  // 圆点
  g.beginPath(); g.arc(pad + dot / 2, h / 2, 5, 0, Math.PI * 2);
  g.fillStyle = active ? '#ffffff' : '#2f8f7d'; g.fill();
  g.fillStyle = active ? '#ffffff' : pal.labelTx;
  g.textBaseline = 'middle';
  g.fillText(text, pad + dot + 4, h / 2 + 1);
  var tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return { tex: tex, aspect: w / h };
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function buildLabels() {
  landmarks.forEach(function (lm) {
    var n = labelTexture(lm.spot.name, false);
    var a = labelTexture(lm.spot.name, true);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: n.tex, transparent: true, depthTest: false, depthWrite: false
    }));
    sp.renderOrder = 999;
    sp.userData.spotId = lm.spot.id;
    sp.userData.aspect = n.aspect;
    sp.userData.texN = n.tex;
    sp.userData.texA = a.tex;
    sp.position.copy(lm.anchor);
    sp.scale.set(n.aspect * 1.8, 1.8, 1);
    scene.add(sp);
    labels.push(sp);
    clickables.push(sp);
  });
}

/* ============================================================
 * 交互：点选 / 飞行
 * ============================================================ */
function bindEvents() {
  var dom = renderer.domElement;
  dom.addEventListener('pointerdown', function (e) {
    pointerDown = { x: e.clientX, y: e.clientY };
    pointerMoved = false;
  });
  dom.addEventListener('pointermove', function (e) {
    if (pointerDown && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) pointerMoved = true;
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
  dom.addEventListener('pointerup', function (e) {
    if (pointerMoved) return;
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    var id = pickSpot();
    if (id) selectSpot(id, true);
    else { closeCard(); }
  });

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'h' || e.key === 'H') flyOverview();
    if (e.key === 'u' || e.key === 'U') toggleUI();
    if (e.key === 'Escape') closeCard();
  });

  document.getElementById('zoom-in').addEventListener('click', function () { dolly(0.82); });
  document.getElementById('zoom-out').addEventListener('click', function () { dolly(1.22); });

  // 底部工具栏
  document.getElementById('tb-overview').addEventListener('click', flyOverview);
  document.getElementById('tb-orbit').addEventListener('click', function () {
    controls.autoRotate = !controls.autoRotate;
    this.classList.toggle('active', controls.autoRotate);
  });
  document.getElementById('tb-tour').addEventListener('click', toggleTour);
  document.getElementById('tb-top').addEventListener('click', flyTopDown);
  document.getElementById('tb-list').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('collapsed');
    this.classList.toggle('active');
  });
  document.getElementById('tb-photo').addEventListener('click', takePhoto);
  document.getElementById('tb-full').addEventListener('click', toggleFullscreen);

  // 主题
  ['day', 'sunset', 'night'].forEach(function (t) {
    var el = document.getElementById('theme-' + t);
    el.addEventListener('click', function () { setTheme(t); });
  });

  document.getElementById('card-close').addEventListener('click', closeCard);
  document.getElementById('card-photo').addEventListener('click', function () {
    var id = document.getElementById('card').dataset.id;
    var spot = spotsById[id];
    if (!spot) return;
    var lb = document.getElementById('lightbox');
    var img = document.getElementById('lightbox-img');
    setSpotPhoto(img, spot);
    img.alt = spot.name;
    document.getElementById('lightbox-caption').textContent = spot.name + '　' + spot.en;
    lb.classList.add('open');
  });
  function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', function (e) {
    if (e.target.id === 'lightbox') closeLightbox();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLightbox();
  });
  document.getElementById('card-closein').addEventListener('click', function () {
    var id = document.getElementById('card').dataset.id;
    if (id) flyToSpot(id, true);
  });
  document.getElementById('card-orbit').addEventListener('click', function () {
    var id = document.getElementById('card').dataset.id;
    if (id) { selectSpot(id, true); controls.autoRotate = true; }
  });

  document.getElementById('enter-btn').addEventListener('click', function () {
    document.getElementById('intro').classList.add('hidden');
    document.body.classList.add('started');
  });

  // 小地图点击飞行
  var mm = document.getElementById('minimap');
  mm.addEventListener('click', function (e) {
    var r = mm.getBoundingClientRect();
    var lon = MM_LON0 + (e.clientX - r.left) / r.width * (MM_LON1 - MM_LON0);
    var lat = MM_LAT1 - (e.clientY - r.top) / r.height * (MM_LAT1 - MM_LAT0);
    var p = XY(lon, lat);
    flyTo(new THREE.Vector3(p[0], hillHeight(p[0], p[1]) + 2, p[1]), null, 2.2, .9);
  });
}

function dolly(f) {
  var v = new THREE.Vector3().subVectors(camera.position, controls.target);
  v.multiplyScalar(f);
  v.clampLength(controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(v);
}

function pickSpot() {
  raycaster.setFromCamera(mouseNDC, camera);
  var hits = raycaster.intersectObjects(clickables, false);
  for (var i = 0; i < hits.length; i++) {
    var o = hits[i].object;
    if (o.isSprite && o.material.opacity < 0.2) continue;  // 被自动隐藏的标签不可点
    return o.userData.spotId || null;
  }
  return null;
}

function selectSpot(id, flyThere) {
  var lm = landmarks.filter(function (l) { return l.spot.id === id; })[0];
  if (!lm) return;
  labels.forEach(function (s) {
    s.material.map = (s.userData.spotId === id) ? s.userData.texA : s.userData.texN;
    s.material.needsUpdate = true;
  });
  document.querySelectorAll('.spot-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.id === id);
  });
  openCard(lm.spot);
  if (flyThere) flyToSpot(id, false);
}

function closeCard() {
  document.getElementById('card').classList.remove('open');
  labels.forEach(function (s) { s.material.map = s.userData.texN; s.material.needsUpdate = true; });
  document.querySelectorAll('.spot-item').forEach(function (el) { el.classList.remove('active'); });
}

function openCard(spot) {
  var card = document.getElementById('card');
  card.dataset.id = spot.id;
  document.getElementById('card-no').textContent = spot.no ? spot.no + ' / EXPLORE ANKANG' : 'EXPLORE ANKANG';
  document.getElementById('card-name').textContent = spot.name;
  document.getElementById('card-en').textContent = spot.en;
  document.getElementById('card-desc').textContent = spot.desc;
  document.getElementById('card-tag').textContent = spot.tag;
  var photoBox = document.getElementById('card-photo');
  var photoImg = document.getElementById('card-photo-img');
  setSpotPhoto(photoImg, spot);
  photoBox.style.display = '';   // 始终有图（实拍或占位图），不再因加载失败而隐藏
  var chips = document.getElementById('card-chips');
  chips.innerHTML = '';
  spot.chips.forEach(function (c) {
    var s = document.createElement('span'); s.className = 'chip'; s.textContent = c; chips.appendChild(s);
  });
  card.classList.add('open');
}

/* ---------------- 景点示意图（程序化占位，可替换为真实照片） ---------------- */
function spotPhoto(spot) {
  var c = document.createElement('canvas'); c.width = 480; c.height = 300;
  var x = c.getContext('2d');
  var g = x.createLinearGradient(0, 0, 480, 300);
  g.addColorStop(0, '#2f6f5e'); g.addColorStop(1, '#5b6b7a');
  x.fillStyle = g; x.fillRect(0, 0, 480, 300);
  x.fillStyle = 'rgba(255,255,255,.10)';
  x.beginPath(); x.arc(380, 70, 90, 0, Math.PI * 2); x.fill();
  x.textAlign = 'center';
  x.fillStyle = 'rgba(255,255,255,.94)';
  x.font = 'bold 34px "Microsoft YaHei", sans-serif';
  x.fillText(spot.name, 240, 146);
  x.fillStyle = 'rgba(255,255,255,.72)';
  x.font = '15px "Microsoft YaHei", sans-serif';
  x.fillText(spot.en || '', 240, 180);
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.font = '13px "Microsoft YaHei", sans-serif';
  x.fillText('安康 · 山水硒都 ｜ 示意占位图', 240, 258);
  return c.toDataURL();
}

/* ---------------- 景点真实照片：命名约定与装载 ---------------- */
/* 约定：assets/photos/<景点 id>.jpg —— 用 data.js 中的 id（全小写英数），不是中文名。
 * 例：安澜楼 → assets/photos/anlan.jpg ；紫阳富硒茶 → assets/photos/chashi.jpg
 * 放置即生效，无需改代码；文件缺失时自动回退到上面的程序化占位图。 */
var PHOTO_DIR = 'assets/photos/';
var photoMissed = {};   // 已确认缺失的景点 id，避免每次开卡片都重复请求 404

function spotPhotoFile(spot) { return PHOTO_DIR + spot.id + '.jpg'; }

function setSpotPhoto(imgEl, spot) {
  if (photoMissed[spot.id]) {          // 已知无实拍图，直接用占位图
    imgEl.onerror = null;
    imgEl.src = spotPhoto(spot);
    return;
  }
  imgEl.onerror = function () {        // 真实照片加载失败 → 回退占位图
    photoMissed[spot.id] = true;
    imgEl.onerror = null;              // 清掉回调，防止回退图自身失败造成死循环
    imgEl.src = spotPhoto(spot);
  };
  imgEl.src = spotPhotoFile(spot);
}

/* ---------------- 飞行 ---------------- */
function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function flyTo(target, camPos, duration, phiFixed) {
  controls.autoRotate = false;
  document.getElementById('tb-orbit').classList.remove('active');
  fly = {
    t0: target.clone(),
    t1: target.clone(),
    c0: camera.position.clone(),
    c1: null,
    start: clock.getElapsedTime(),
    dur: duration || 2.2
  };
  if (camPos) fly.c1 = camPos.clone();
  else {
    var spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
    spherical.phi = phiFixed || 1.02;
    spherical.radius = Math.max(spherical.radius * .9, 18);
    fly.c1 = target.clone().add(new THREE.Vector3().setFromSpherical(spherical));
  }
  // 弧线抬升中点
  var mid = fly.c0.clone().lerp(fly.c1, .5);
  mid.y += 10 + fly.c0.distanceTo(fly.c1) * .12;
  fly.mid = mid;
  controls.enabled = false;
}

// 水体中心（相机默认隔水看地标）—— 取汉江城区段（109.00°E, 32.670°N）投影坐标
var LAKE_FOCUS = new THREE.Vector3(22.5, 0, -10.5);
var OVERVIEW_TARGET, OVERVIEW_POS;
// 最佳观赏方位角（绕地标，0=南, π/2=东, π=北）；让镜头隔着汉江/湖面看地标，山作背景
var AZ_OVERRIDE = {
  anlan: 0.15,      // 隔汉江看安澜楼
  bowuguan: -0.1,   // 隔汉江看安康博物馆
  longzhou: 0.35,   // 江畔龙舟文化园
  nanxi: -0.7,      // 自西南望香溪洞，山为背景
  nangong: 0.9,     // 南宫山主峰侧望
  guigu: -1.1,      // 鬼谷岭云雾侧
  fenghuang: 0.6,   // 凤凰山茶园
  shuanglong: 1.2   // 双龙溶洞
};
// 特殊地标取景覆盖：[远观距离, 近看距离, 俯角phi]（phi 越接近 π/2 越平视）
var VIEW_TWEAK = {
  anlan: [16, 10, 1.24],
  bowuguan: [17, 11, 1.22],
  longzhou: [15, 10, 1.26],
  nangong: [19, 13, 1.18],
  shuanglong: [16, 10, 1.28]
};
function flyToSpot(id, closeIn) {
  var lm = landmarks.filter(function (l) { return l.spot.id === id; })[0];
  if (!lm) return;
  var baseY = lm.group.position.y;
  var onHill = baseY > 1.2;
  var tw = VIEW_TWEAK[id];
  var radius = tw ? (closeIn ? tw[1] : tw[0])
                  : (closeIn ? (onHill ? 13 : 8) : (lm.spot.view || (lm.height > 6 ? 18 : 13)));
  // 方位：优先取“地标 → 湖心”，让镜头隔着湖面看建筑；山体地标抬高俯角
  var dx = LAKE_FOCUS.x - lm.anchor.x, dz = LAKE_FOCUS.z - lm.anchor.z;
  var theta = Math.atan2(dx, dz);
  if (AZ_OVERRIDE[id] !== undefined) theta = AZ_OVERRIDE[id];
  var phi = tw ? tw[2] : (closeIn ? (onHill ? 1.28 : 1.32) : (onHill ? 1.2 : 1.12));
  var spherical = new THREE.Spherical(radius, phi, theta);
  var camPos = lm.anchor.clone().add(new THREE.Vector3().setFromSpherical(spherical));
  var look = new THREE.Vector3(lm.anchor.x, baseY + lm.height * .42, lm.anchor.z);
  flyTo(look, camPos, closeIn ? 1.8 : 2.4);
  selectSpot(id, false);
}

function flyOverview() {
  autoTour = false;
  document.getElementById('tb-tour').classList.remove('active');
  flyTo(OVERVIEW_TARGET.clone(), OVERVIEW_POS.clone(), 2.6);
}
function flyTopDown() {
  flyTo(controls.target.clone(), controls.target.clone().add(new THREE.Vector3(0.1, 95, 0.1)), 1.8);
}

function toggleTour() {
  autoTour = !autoTour;
  this.classList.toggle('active', autoTour);
  document.getElementById('tb-orbit').classList.remove('active');
  controls.autoRotate = false;
  if (autoTour) {
    // 漫游路线：瀛湖 → 汉江 → 城区 → 东线 → 南线 → 西线（覆盖全部 12 处景点）
    tourSeq = ['yinghu', 'hanjiang', 'anlan', 'longzhou', 'bowuguan', 'nanxi',
               'shuanglong', 'nangong', 'qianhe', 'chashi', 'fenghuang', 'guigu'];
    flyToSpot(tourSeq[0]);
  }
}

function updateFlight(elapsed) {
  if (!fly) return;
  var t = Math.min(1, (elapsed - fly.start) / fly.dur);
  var k = easeInOut(t);
  controls.target.lerpVectors(fly.t0, fly.t1, k);
  // 二次贝塞尔弧线
  camera.position.set(
    (1 - k) * (1 - k) * fly.c0.x + 2 * (1 - k) * k * fly.mid.x + k * k * fly.c1.x,
    (1 - k) * (1 - k) * fly.c0.y + 2 * (1 - k) * k * fly.mid.y + k * k * fly.c1.y,
    (1 - k) * (1 - k) * fly.c0.z + 2 * (1 - k) * k * fly.mid.z + k * k * fly.c1.z
  );
  camera.lookAt(controls.target);
  if (t >= 1) {
    fly = null;
    controls.enabled = true;
    controls.update();
    if (autoTour) tourWait = 3.6;
  }
}

/* ---------------- 拍照 / 全屏 / UI ---------------- */
function takePhoto() {
  renderer.render(scene, camera);
  var a = document.createElement('a');
  a.download = '山水安康-' + currentTheme + '.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
}
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
function toggleUI() {
  uiHidden = !uiHidden;
  document.getElementById('ui-root').classList.toggle('ui-hidden', uiHidden);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ============================================================
 * 左侧地点列表
 * ============================================================ */
var SECTIONS = [
  { title: '安康八景', ids: ['yinghu', 'hanjiang', 'nangong', 'nanxi', 'longzhou'] },
  { title: '富硒茶山', ids: ['chashi', 'fenghuang', 'guigu'] },
  { title: '峡谷溶洞', ids: ['qianhe', 'shuanglong'] },
  { title: '城市名片', ids: ['bowuguan', 'anlan'] }
];
function buildSpotList() {
  var root = document.getElementById('spot-list');
  SECTIONS.forEach(function (sec) {
    var h = document.createElement('div');
    h.className = 'sec-title'; h.textContent = sec.title;
    root.appendChild(h);
    sec.ids.forEach(function (id) {
      var s = spotsById[id];
      var item = document.createElement('div');
      item.className = 'spot-item';
      item.dataset.id = id;
      item.innerHTML =
        '<span class="no">' + (s.no || '·') + '</span>' +
        '<span class="nm"><b>' + s.name + '</b><i>' + s.en + '</i></span>' +
        '<span class="go">↗</span>';
      item.addEventListener('click', function () { selectSpot(id, true); });
      root.appendChild(item);
    });
  });
}

/* ============================================================
 * 小地图
 * ============================================================ */
var MM_LON0 = 108.15, MM_LON1 = 109.35, MM_LAT0 = 32.25, MM_LAT1 = 33.05;
function updateMinimap() {
  var c = document.getElementById('minimap');
  var ctx = c.getContext('2d');
  var W = c.width, H = c.height;
  function mx(lon) { return (lon - MM_LON0) / (MM_LON1 - MM_LON0) * W; }
  function my(lat) { return (MM_LAT1 - lat) / (MM_LAT1 - MM_LAT0) * H; }
  function path(poly) {
    ctx.beginPath();
    poly.forEach(function (q, i) {
      var X = mx(q[0]), Y = my(q[1]);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.closePath();
  }
  ctx.clearRect(0, 0, W, H);
  // 底
  ctx.fillStyle = currentTheme === 'night' ? 'rgba(20,34,50,.92)' : 'rgba(244,242,228,.94)';
  roundRect(ctx, 0, 0, W, H, 10); ctx.fill();
  // 江
  path(RIVER.pts); ctx.strokeStyle = currentTheme === 'night' ? '#2c5478' : '#8fc0e8';
  ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
  // 湖
  path(LAKE_SHORE);
  ctx.fillStyle = currentTheme === 'night' ? '#1d3f62' : '#5aa3dd'; ctx.fill();
  path(INNER_LAKE); ctx.fill();
  // 堤
  ctx.strokeStyle = currentTheme === 'night' ? '#8a9a86' : '#e8e0bd'; ctx.lineWidth = 2;
  CAUSEWAYS.forEach(function (cw) {
    ctx.beginPath();
    cw.pts.forEach(function (q, i) {
      if (i === 0) ctx.moveTo(mx(q[0]), my(q[1])); else ctx.lineTo(mx(q[0]), my(q[1]));
    });
    ctx.stroke();
  });
  // 岛
  ctx.fillStyle = currentTheme === 'night' ? '#41604a' : '#93c77f';
  ISLANDS.forEach(function (isl) {
    path(isl.pts); ctx.fill();
  });
  // 主要道路
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ROADS.forEach(function (rd) {
    ctx.beginPath();
    rd.pts.forEach(function (q, i) {
      if (i === 0) ctx.moveTo(mx(q[0]), my(q[1])); else ctx.lineTo(mx(q[0]), my(q[1]));
    });
    ctx.strokeStyle = currentTheme === 'night' ? 'rgba(180,186,196,.5)' : 'rgba(150,140,112,.7)';
    ctx.lineWidth = 2.2; ctx.stroke();
  });
  // 地铁线路
  var byNameMM = {}; METRO_STATIONS.forEach(function (s) { byNameMM[s.name] = s; });
  METRO_LINES.forEach(function (L) {
    ctx.beginPath();
    L.seq.forEach(function (nm, i) {
      var s = byNameMM[nm]; if (!s) return;
      if (i === 0) ctx.moveTo(mx(s.lon), my(s.lat)); else ctx.lineTo(mx(s.lon), my(s.lat));
    });
    ctx.strokeStyle = '#' + new THREE.Color(METRO_LINE_COLORS[L.line]).getHexString();
    ctx.lineWidth = 1.8; ctx.stroke();
  });
  // 地铁站
  METRO_STATIONS.forEach(function (s) {
    ctx.beginPath(); ctx.arc(mx(s.lon), my(s.lat), 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#' + new THREE.Color(METRO_LINE_COLORS[s.lines[0]]).getHexString();
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
  });
  // 景点点
  SPOTS.forEach(function (s) {
    ctx.beginPath(); ctx.arc(mx(s.lon), my(s.lat), 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#2f8f7d'; ctx.fill();
  });
  // 相机
  var targetLon = ORIGIN[0] + controls.target.x / SCALE;
  var targetLat = ORIGIN[1] - controls.target.z / SCALE;
  var camLon = ORIGIN[0] + camera.position.x / SCALE;
  var camLat = ORIGIN[1] - camera.position.z / SCALE;
  var ang = Math.atan2(my(targetLat) - my(camLat), mx(targetLon) - mx(camLon));
  ctx.save();
  ctx.translate(mx(camLon), my(camLat));
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath();
  ctx.fillStyle = '#e07a4a'; ctx.fill();
  ctx.restore();
  // 指北
  ctx.fillStyle = currentTheme === 'night' ? '#dfe9f2' : '#46564f';
  ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('N', W - 8, 16);
}

/* ============================================================
 * 主题切换
 * ============================================================ */
function setTheme(name) {
  currentTheme = name;
  pal = PALETTES[name];
  scene.fog.color.set(pal.fog);
  scene.fog.near = pal.fogNear; scene.fog.far = pal.fogFar;
  hemiLight.color.set(pal.hemiSky); hemiLight.groundColor.set(pal.hemiGround); hemiLight.intensity = pal.hemiI;
  sunLight.color.set(pal.sun); sunLight.intensity = pal.sunI;
  sunLight.position.set(pal.sunPos[0], pal.sunPos[1], pal.sunPos[2]);
  ambLight.color.set(pal.amb); ambLight.intensity = pal.ambI;

  // 天空渐变
  var c = document.createElement('canvas'); c.width = 4; c.height = 256;
  var g = c.getContext('2d');
  var grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, pal.skyTop); grad.addColorStop(1, pal.skyBottom);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  var tex = new THREE.CanvasTexture(c);
  skyMesh.material.map = tex; skyMesh.material.needsUpdate = true;

  starPoints.material.opacity = pal.star;
  sunSprite.material.opacity = pal.sunVisible;
  sunSprite.material.color.set(pal.sunColor);
  sunSprite.position.set(pal.sunPos[0] * 2.4, pal.sunPos[1] * 2.2, pal.sunPos[2] * 2);
  moonSprite.material.opacity = pal.moonVisible;

  waterMats.forEach(function (m) {
    m.color.set(pal.water);
    m.emissive.set(pal.waterEm);
    m.emissiveIntensity = name === 'night' ? .32 : (name === 'sunset' ? .26 : .22);
  });
  // 静态材质三时换色
  themedMats.forEach(function (r) { r.mat.color.set(r[name]); });
  autoMats.forEach(function (m) {
    m.color.copy(m.userData.dayColor);
    m.color.multiply(new THREE.Color(name === 'night' ? 0x46524a : (name === 'sunset' ? 0xd9cfb8 : 0xffffff)));
  });
  // 实例化植被整体压色（夜间）
  instMeshes.forEach(function (im) {
    if (im.userData.noTheme) return;
    im.material.color.set(name === 'night' ? 0x55604f : (name === 'sunset' ? 0xeadfca : 0xffffff));
  });
  // 城市窗灯
  buildingMats.forEach(function (m) {
    m.emissiveIntensity = name === 'night' ? 1.0 : (name === 'sunset' ? .35 : 0);
  });
  lanternSprites.forEach(function (s) {
    s.material.opacity = pal.lantern * (name === 'night' ? 1 : .55);
  });
  document.body.classList.toggle('night', name === 'night');

  // 标签重建
  labels.forEach(function (sp) {
    var id = sp.userData.spotId;
    var lm = landmarks.filter(function (l) { return l.spot.id === id; })[0];
    var n = labelTexture(lm.spot.name, false), a = labelTexture(lm.spot.name, true);
    sp.userData.texN = n.tex; sp.userData.texA = a.tex;
    var active = sp.material.map === sp.userData.texA || document.getElementById('card').dataset.id === id;
    sp.material.map = active ? a.tex : n.tex;
    sp.material.needsUpdate = true;
  });

  document.querySelectorAll('.theme-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.theme === name);
  });
  updateMinimap();
}

/* ============================================================
 * 动画循环
 * ============================================================ */
function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), .05);
  var elapsed = clock.elapsedTime;

  if (fly) updateFlight(elapsed);
  else controls.update();

  // 标签随距离缩放 & 悬停
  var hover = null;
  if (!fly && mouseNDC.x > -1.5) hover = pickSpot();
  if (hover !== hoverId) {
    hoverId = hover;
    renderer.domElement.style.cursor = hover ? 'pointer' : 'grab';
    labels.forEach(function (s) {
      var activeCard = document.getElementById('card').dataset.id === s.userData.spotId;
      s.material.map = (s.userData.spotId === hover || activeCard) ? s.userData.texA : s.userData.texN;
      s.material.needsUpdate = true;
    });
  }
  var cardId = document.getElementById('card').dataset.id;
  var selLm = cardId ? landmarks.filter(function (l) { return l.spot.id === cardId; })[0] : null;
  var projH = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  var v = new THREE.Vector3();

  // 1) 缩放 + 基础透明度
  labels.forEach(function (s) {
    var d = camera.position.distanceTo(s.position);
    var k = THREE.MathUtils.clamp(d * 0.022, .7, 2.0);
    var asp = s.userData.aspect;
    s.scale.set(asp * 1.8 * k, 1.8 * k, 1);
    var active = (s.userData.spotId === hoverId || s.userData.spotId === cardId);
    var op = 1;
    if (!active && d < 24) op = Math.min(op, 0.15 + 0.85 * THREE.MathUtils.clamp((d - 9) / 15, 0, 1));
    if (!active && selLm && s.position.distanceTo(selLm.anchor) < 9) {
      op = Math.min(op, 0.12 + 0.2 * THREE.MathUtils.clamp(s.position.distanceTo(selLm.anchor) / 9, 0, 1));
    }
    s.userData.baseOp = op;
  });

  // 2) 屏幕重叠自动避让（选中/悬停优先，其余近者优先）
  var rects = labels.map(function (s) {
    v.copy(s.position).project(camera);
    var d = camera.position.distanceTo(s.position);
    var hpx = s.scale.y * projH / d;
    var active = (s.userData.spotId === hoverId || s.userData.spotId === cardId);
    return {
      s: s, active: active,
      cx: (v.x * .5 + .5) * window.innerWidth,
      cy: (-v.y * .5 + .5) * window.innerHeight,
      w: hpx * s.userData.aspect, h: hpx,
      onScreen: v.z < 1 && v.z > -1
    };
  }).sort(function (a, b) { return (b.active - a.active) || (a.s.position.distanceTo(camera.position) - b.s.position.distanceTo(camera.position)); });

  var kept = [];
  rects.forEach(function (r) {
    var overlap = false;
    if (r.onScreen) {
      for (var i = 0; i < kept.length; i++) {
        var q = kept[i];
        var ox = Math.abs(r.cx - q.cx) < (r.w + q.w) * .36;
        var oy = Math.abs(r.cy - q.cy) < (r.h + q.h) * .42;
        if (ox && oy) { overlap = true; break; }
      }
    }
    if (!overlap && r.onScreen) {
      kept.push(r);
      r.s.material.opacity = r.s.userData.baseOp;
    } else {
      r.s.material.opacity = r.active ? r.s.userData.baseOp : 0;
    }
  });

  // 道路名 / 地铁站 随距离缩放
  roadLabelSprites.forEach(function (s) {
    var d = camera.position.distanceTo(s.position);
    var k = THREE.MathUtils.clamp(d * .028, .7, 1.5);
    s.scale.set(s.userData.aspect * 1.5 * k, 1.5 * k, 1);
    s.material.opacity = THREE.MathUtils.clamp((95 - d) / 40, 0, .92);
  });
  stationNames.forEach(function (s) {
    var d = camera.position.distanceTo(s.position);
    var k = THREE.MathUtils.clamp(d * .022, .6, 1.25);
    s.scale.set(s.userData.baseW * k, 1.1 * k, 1);
    // 远景时淡出站名，只保留 M 徽标
    s.material.opacity = THREE.MathUtils.clamp((78 - d) / 34, 0, 1);
  });
  stationBadges.forEach(function (s) {
    var d = camera.position.distanceTo(s.position);
    var k = THREE.MathUtils.clamp(d * .03, .6, 1.5);
    s.scale.set(1.7 * k, 1.7 * k, 1);
  });

  // 罗盘：相机方位角
  var bearing = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  var needle = document.getElementById('compass-needle');
  if (needle) needle.style.transform = 'rotate(' + (bearing * 180 / Math.PI) + 'deg)';

  // 游船沿折线往返
  boats.forEach(function (b) {
    var path = b.userData;
    path.t += path.dir * path.speed * dt;
    if (path.t > 1) { path.t = 1; path.dir = -1; }
    if (path.t < 0) { path.t = 0; path.dir = 1; }
    var segs = path.path.length - 1;
    var f = path.t * segs, i = Math.min(segs - 1, Math.floor(f)), k = f - i;
    var p0 = path.path[i], p1 = path.path[i + 1];
    b.position.lerpVectors(p0, p1, k);
    b.position.y = .12 + Math.sin(elapsed * 2 + path.ph) * .08;
    b.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z) + Math.PI;
  });

  // 涟漪
  ripples.forEach(function (r) {
    r.userData.life += dt * .22;
    if (r.userData.life > 1) {
      r.userData.life = 0;
      var p = randomLakePoint();
      r.position.x = p[0]; r.position.z = p[1];
    }
    var l = r.userData.life;
    r.scale.setScalar(.5 + l * 3.2);
    r.material.opacity = (1 - l) * .35;
  });

  // 飞鸟
  birds.forEach(function (b) {
    var ph = b.userData.ph + elapsed * .18;
    b.position.set(
      b.userData.cx + Math.cos(ph) * b.userData.r,
      b.userData.y + Math.sin(elapsed * .8 + b.userData.ph) * 1.2,
      b.userData.cz + Math.sin(ph) * b.userData.r
    );
    b.rotation.y = -ph + Math.PI / 2;
    b.userData.wing.scale.y = 1 + Math.sin(elapsed * 9 + b.userData.ph) * .35;
    b.visible = currentTheme !== 'night';
  });

  // 喷泉
  jets.forEach(function (j) {
    var base = j.userData.base;
    for (var i = 0; i < base.length; i += 6) {
      var pulse = .6 + Math.abs(Math.sin(elapsed * 2.2 + i)) * .8;
      j.geometry.attributes.position.array[i + 4] = 2 + pulse * 3.2;
    }
    j.geometry.attributes.position.needsUpdate = true;
  });

  // 自动漫游
  if (autoTour && !fly) {
    tourWait -= dt;
    if (tourWait <= 0) {
      var cur = document.getElementById('card').dataset.id;
      var idx = tourSeq.indexOf(cur);
      var next = tourSeq[(idx + 1) % tourSeq.length];
      flyToSpot(next);
    }
  }

  if (Math.floor(elapsed * 4) % 2 === 0) updateMinimapThrottled(elapsed);
  renderer.render(scene, camera);
}

var _lastMM = 0;
function updateMinimapThrottled(elapsed) {
  if (elapsed - _lastMM > .25) { _lastMM = elapsed; updateMinimap(); }
}

document.addEventListener('DOMContentLoaded', init);
