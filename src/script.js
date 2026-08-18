// script.js — Seamless Infinite World (HUD + Biomes GUI + Pickups, Option A)

console.log("Seamless Infinite World – boot (HUD + Biomes GUI + Pickups, Option A)");

// ===== Seed & Noise =====
const rndSeed = Math.floor(Math.random() * 1_000_000);
console.log("Seed :", rndSeed);

const noise = new perlinNoise3d();
noise.noiseSeed(rndSeed);
window.__NOISE__ = noise;

// ===== Textures (4) =====
const loader = new THREE.TextureLoader();
const grassTex = loader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
const sandTex  = loader.load('https://upload.wikimedia.org/wikipedia/commons/5/5a/Sand.jpg');
const dirtTex  = loader.load('https://upload.wikimedia.org/wikipedia/commons/b/ba/Dirt.jpg');
const rockTex  = loader.load('https://upload.wikimedia.org/wikipedia/commons/8/8f/Small_stones.jpg');

[grassTex, sandTex, dirtTex, rockTex].forEach(tex => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
});
window.__TEX__ = { grassTex, sandTex, dirtTex, rockTex };

// ===== Scene / Renderer / Camera =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0d0ff);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 2000);
camera.position.set(0, 60, 100);

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

initThirdPersonControls(renderer.domElement);

// ===== HUD (chunk + position + biome) =====
const hud = document.createElement('div');
hud.style.position = 'fixed';
hud.style.top = '8px';
hud.style.left = '8px';
hud.style.zIndex = '9999';
hud.style.padding = '8px 10px';
hud.style.borderRadius = '8px';
hud.style.background = 'rgba(0,0,0,0.45)';
hud.style.color = '#fff';
hud.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
hud.style.fontSize = '12px';
hud.style.lineHeight = '1.25';
hud.style.whiteSpace = 'pre';
hud.textContent = 'Chunk: ?, ?\nPos:   ?, ?, ?\nBiome: ?';
document.body.appendChild(hud);

// ===== Controls (Orbit pour debug) =====
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ===== Lumières =====
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x444422, 0.4));

const skyRig = new THREE.Group();
skyRig.name = "skyRig";
scene.add(skyRig);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
dirLight.castShadow = true;
const SHADOW_HALF = 160;
dirLight.shadow.mapSize.width  = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far  = 600;
dirLight.shadow.camera.left   = -SHADOW_HALF;
dirLight.shadow.camera.right  =  SHADOW_HALF;
dirLight.shadow.camera.top    =  SHADOW_HALF;
dirLight.shadow.camera.bottom = -SHADOW_HALF;
dirLight.shadow.bias = -0.0005;
skyRig.add(dirLight.target);
dirLight.target.position.set(0, 0, 0);
skyRig.add(dirLight);

// ===== Soleil visible =====
const sunRadius = 120;
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(5,16,16),
  new THREE.MeshBasicMaterial({ color:0xffdd66, depthWrite:false })
);
sun.name = "sun";
skyRig.add(sun);

// ===== Dôme d'étoiles =====
function createStarDome(count = 1500, radius = 1800) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.random() * Math.PI * 0.5;
    const r     = radius * (0.98 + Math.random() * 0.04);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);
    const i3 = i * 3;
    positions[i3] = x; positions[i3+1] = y; positions[i3+2] = z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.computeBoundingSphere();
  geom.frustumCulled = false;
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.2, sizeAttenuation: false,
    transparent: true, opacity: 1.0, depthWrite: false, depthTest: true, fog: false
  });
  return new THREE.Points(geom, mat);
}
const starDome = createStarDome(1800, 1800);
skyRig.add(starDome);

// ===== Terrain & Water (global bands) =====
const DEFAULT_WATER_LEVEL = -20;

const terrainParams = {
  amplitude: 8,
  frequency: 5,
  seed: rndSeed,

  chunkSize: 120,
  chunkSegments: 96,
  viewRadius: 2,
  uvScale: 1/12,

  bands: {
    waterLevel: DEFAULT_WATER_LEVEL,
    sandMax: DEFAULT_WATER_LEVEL + 5,
    grassMax: DEFAULT_WATER_LEVEL + 22,
    dirtMax:  DEFAULT_WATER_LEVEL + 23
  },

  regenerate: () => { __NOISE__.noiseSeed(terrainParams.seed); resetAndRebuildChunks(); }
};
window.terrainParams = terrainParams;

// Eau plane (globale)
const water = new THREE.Water(new THREE.PlaneGeometry(4000,4000), {
  color: 0x3399ff,
  scale: 1,
  flowDirection: new THREE.Vector2(0,0),
  textureWidth: 1024,
  textureHeight: 1024,
  normalMap0: loader.load("https://threejs.org/examples/textures/water/Water_1_M_Normal.jpg"),
  normalMap1: loader.load("https://threejs.org/examples/textures/water/Water_1_M_Normal.jpg")
});
water.rotation.x = -Math.PI/2;
water.position.y = terrainParams.bands.waterLevel;
scene.add(water);

// ===== Chunks root =====
const chunkRoot = new THREE.Group();
scene.add(chunkRoot);
const chunks = new Map();
const key = (cx,cz)=>`${cx},${cz}`;

// =====================================================================
// ========== PICKUPS (Option A): définir AVANT buildChunksAround =======
// =====================================================================
let __pickups = []; // références Mesh/Group marqués isPickup
window.__registerPickup = function(mesh){
  if (!mesh) return;
  __pickups.push(mesh);
};

// Prompt [E]
const pickupPrompt = document.createElement('div');
pickupPrompt.style.position='fixed';
pickupPrompt.style.left='50%';
pickupPrompt.style.bottom='14%';
pickupPrompt.style.transform='translateX(-50%)';
pickupPrompt.style.padding='8px 12px';
pickupPrompt.style.borderRadius='10px';
pickupPrompt.style.background='rgba(15,22,55,.9)';
pickupPrompt.style.border='1px solid rgba(90,120,220,.35)';
pickupPrompt.style.color='#fff';
pickupPrompt.style.font='14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
pickupPrompt.style.textShadow='0 1px 2px rgba(0,0,0,.6)';
pickupPrompt.style.display='none';
pickupPrompt.style.zIndex='10000';
document.body.appendChild(pickupPrompt);

// Toast
function showToast(msg, ms=1500){
  const el = document.createElement('div');
  el.style.position='fixed';
  el.style.left='50%';
  el.style.bottom='10%';
  el.style.transform='translateX(-50%)';
  el.style.padding='10px 14px';
  el.style.borderRadius='12px';
  el.style.background='rgba(20,30,70,.9)';
  el.style.border='1px solid rgba(70,100,200,.35)';
  el.style.color='#fff';
  el.style.font='14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  el.style.opacity='0'; el.style.transition='opacity 180ms ease, transform 220ms ease';
  el.textContent = msg;
  el.style.zIndex='10001';
  document.body.appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(-4px)'; });
  setTimeout(()=>{ el.style.opacity='0'; el.addEventListener('transitionend', ()=> el.remove(), { once:true }); }, ms);
}

let nearestPickup = null;
const PICKUP_RADIUS = 2.2;

function updatePickupPrompt(){
  // épure les références mortes
  __pickups = __pickups.filter(p => p && p.parent);
  nearestPickup = null;
  let bestD = Infinity;
  for (const p of __pickups){
    const dx = p.position.x - player.position.x;
    const dz = p.position.z - player.position.z;
    const d = Math.hypot(dx, dz);
    if (d < PICKUP_RADIUS && d < bestD){
      bestD = d; nearestPickup = p;
    }
  }
  if (nearestPickup){
    const label = nearestPickup.userData?.pickup?.label || 'Objet';
    pickupPrompt.textContent = `Prendre ${label}  [E]`;
    pickupPrompt.style.display='block';
  } else {
    pickupPrompt.style.display='none';
  }
}

// Ramassage au clavier (E)
addEventListener('keydown', (e)=>{
  if (e.repeat) return;
  if (e.key === 'e' || e.key === 'E'){
    if (!nearestPickup) return;
    const info = nearestPickup.userData?.pickup;
    if (!info) return;
    if (window.Inventory){
      Inventory.addItem(info.id, info.qty||1);
      showToast(`+${info.qty||1} ${info.label || info.id}`);
      window.SFX?.pickup();
    }
    // retire du monde & de la liste
    const parent = nearestPickup.parent;
    if (parent) parent.remove(nearestPickup);
    __pickups = __pickups.filter(p => p !== nearestPickup);
    nearestPickup = null;
    pickupPrompt.style.display='none';
  }
});
// =====================================================================

// ===== Player =====
const player = createPlayer(scene, getTerrainHeightAt);

// === SAVE: init + load ===
if (window.SAVE){
  SAVE.init({ getPlayerRef: () => player });
  const loaded = SAVE.load({ applyPosition: true });
  if (loaded) {
    // Si la position a été restaurée, on reconstruit les chunks autour
    resetAndRebuildChunks();
  }
}




// ===== Première génération de chunks (les pickups seront bien enregistrés) =====
buildChunksAround(player.position.x, player.position.z, true);

// ===== dat.GUI =====
const gui = new dat.GUI();

// --- Terrain (classique)
const fTerrain = gui.addFolder('Terrain');
fTerrain.add(terrainParams, 'amplitude', 1, 100).onChange(resetAndRebuildChunks);
fTerrain.add(terrainParams, 'frequency', 0.1, 20).onChange(resetAndRebuildChunks);
fTerrain.add(terrainParams, 'seed', 0, 999999).step(1).onFinishChange(terrainParams.regenerate);
fTerrain.add(terrainParams, 'chunkSize', 60, 300, 1).onFinishChange(resetAndRebuildChunks);
fTerrain.add(terrainParams, 'chunkSegments', 32, 256, 1).onFinishChange(resetAndRebuildChunks);
fTerrain.add(terrainParams, 'viewRadius', 1, 5, 1).onFinishChange(resetAndRebuildChunks);
fTerrain.add(terrainParams, 'uvScale', 1/40, 1/4).onFinishChange(resetAndRebuildChunks);
fTerrain.open();

// --- Bands (seuils globaux autour du niveau d’eau)
const fBands = gui.addFolder('Bands / Biome (relative to water)');
let prevWaterLevel = terrainParams.bands.waterLevel;
const ctrlSand  = fBands.add(terrainParams.bands, 'sandMax',  -20, 60, 0.05).name('sandMax').onChange(resetAndRebuildChunks);
const ctrlGrass = fBands.add(terrainParams.bands, 'grassMax', -20, 80, 0.05).name('grassMax').onChange(resetAndRebuildChunks);
const ctrlDirt  = fBands.add(terrainParams.bands, 'dirtMax',  -20, 120,0.05).name('dirtMax').onChange(resetAndRebuildChunks);
fBands.add(terrainParams.bands, 'waterLevel', -20, 40, 0.05).name('waterLevel').onChange((v)=>{
  const delta = v - prevWaterLevel;
  prevWaterLevel = v;
  terrainParams.bands.sandMax  += delta;
  terrainParams.bands.grassMax += delta;
  terrainParams.bands.dirtMax  += delta;
  water.position.y = v;
  ctrlSand.updateDisplay(); ctrlGrass.updateDisplay(); ctrlDirt.updateDisplay();
  resetAndRebuildChunks();
});
fBands.open();

// --- Biomes (GUI)
const BI = window.BIOME;
if (!BI) {
  console.warn("⚠️ biome.js non chargé : la GUI Biomes attend BIOME.config.");
}
const fBiomes = gui.addFolder('Biomes (world mix)');
if (BI && BI.config) {
  fBiomes.add(BI.config, 'scale', 100, 3000, 10).name('scale').onFinishChange(resetAndRebuildChunks);
  fBiomes.add(BI.config, 'blendWidth', 0.05, 0.8, 0.01).name('blendWidth').onFinishChange(resetAndRebuildChunks);
  const sets = BI.config.sets;
  for (let i=0; i<sets.length; i++){
    const s = sets[i];
    const fSet = fBiomes.addFolder(`Set ${i+1} – ${s.name}`);
    fSet.add(s, 'name').name('name');
    fSet.add(s, 'amplitude', 0, 60, 0.5).onFinishChange(resetAndRebuildChunks);
    fSet.add(s, 'frequency', 0.1, 20, 0.1).onFinishChange(resetAndRebuildChunks);
    fSet.add(s, 'waterOffset', -5, 5, 0.05).onFinishChange(resetAndRebuildChunks);
    fSet.add(s, 'oceanAmp', 0, 5, 0.05).name('oceanAmp').onFinishChange(resetAndRebuildChunks);
    fSet.add(s, 'oceanFreq', 0.1, 10, 0.1).name('oceanFreq').onFinishChange(resetAndRebuildChunks);
  }
}
fBiomes.open();

// ===== Helpers =====
function resetAndRebuildChunks(){
  // purge pickups connus (ils seront ré-enregistrés lors du rebuild)
  __pickups = __pickups.filter(p => p && p.parent);
  for (const [,c] of chunks){
    chunkRoot.remove(c.group);
    c.group.traverse(o=>{
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
  }
  chunks.clear();
  window.__obstaclesByChunk?.clear();
  buildChunksAround(player.position.x, player.position.z, true);
}

function buildChunksAround(wx, wz){
  const {chunkSize, viewRadius} = terrainParams;
  const cx = Math.floor(wx / chunkSize);
  const cz = Math.floor(wz / chunkSize);

  const needed = new Set();
  for (let dz=-viewRadius; dz<=viewRadius; dz++){
    for (let dx=-viewRadius; dx<=viewRadius; dx++){
      const k = key(cx+dx, cz+dz);
      needed.add(k);
      if (!chunks.has(k)){
        const group = generateTerrainChunk(cx+dx, cz+dz);
        chunkRoot.add(group);
        chunks.set(k, {group, x: cx+dx, z: cz+dz});
      }
    }
  }
  for (const [k,c] of chunks){
    if (!needed.has(k)){
      // supprimer pickups orphelins de ce chunk
      c.group.traverse(o=>{
        if (o.userData && o.userData.isPickup){
          __pickups = __pickups.filter(p => p !== o);
        }
      });
      chunkRoot.remove(c.group);
      c.group.traverse(o=>{
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
      });
      chunks.delete(k);
      window.__obstaclesByChunk?.delete(k);
    }
  }
}

// === Déchargement des chunks (libère la mémoire pendant le combat) ===
function destroyWorld(){
  for (const [,c] of chunks){
    chunkRoot.remove(c.group);
    c.group.traverse(o=>{
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
  }
  chunks.clear();
}

// ===== Ciel (couleur) =====
function lerp(a,b,t){ return a + (b-a)*t; }
function updateSkyColor(sunY) {
  const sky = new THREE.Color();
  if (sunY > 50)       sky.setRGB(0.5,0.7,1);
  else if (sunY > 0)   { const t = sunY/50; sky.setRGB(lerp(1,0.5,t), lerp(0.5,0.7,t), lerp(0.2,1,t)); }
  else if (sunY>-50)   { const t=(sunY+50)/50; sky.setRGB(lerp(0.5,1,t), lerp(0.7,0.5,t), lerp(1,0.2,t)); }
  else                 sky.setRGB(0.05,0.05,0.2);
  scene.background = sky;
}

// ===== Combat – initialisation (si le script est chargé) =====
if (window.Combat){
  Combat.init({
    getRenderer: () => renderer,
    getWorld:    () => ({ scene, camera }),
    buildWorld:  () => { buildChunksAround(player.position.x, player.position.z, true); },
    destroyWorld: () => { destroyWorld(); },
    getPlayerRef: () => player,
    onMusicSwap: (state) => window.Music?.setState(state),
  });
} else {
  console.warn("CombatSystem non chargé : vérifie l'ordre des <script>…");
}

// ===== Animation Loop =====
const clock = new THREE.Clock();
const timeOffset = 30;

function animate(){
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // rencontres/combat
  if (window.EncounterHelpers && window.Combat){
    const dist = EncounterHelpers.trackPlayerDistance(player);
    if (dist > 0) Combat.notifyPlayerStep(dist);
    if (Combat.isActive()){
      Combat.tick(delta);
      return;
    }
  }

  const elapsed = clock.getElapsedTime() + timeOffset;
  const tday = (elapsed/600)%1;
  const ang = tday * Math.PI*2;
  const sunX = Math.cos(ang)*sunRadius;
  const sunY = Math.sin(ang)*sunRadius;

  skyRig.position.set(player.position.x, 0, player.position.z);
  sun.position.set(sunX, sunY, 0);
  dirLight.position.set(sunX, sunY, 0);
  dirLight.target.position.set(0, 0, 0);
  dirLight.intensity = Math.max(0.2, sunY / sunRadius);
  updateSkyColor(sunY);

  const night = sunY < -20;
  starDome.visible = night;
  if (night) {
    const tw = 0.85 + 0.15 * Math.sin(elapsed * 1.7);
    starDome.material.opacity = tw;
  }

  // contrôles + collisions
  updateThirdPersonControls(player, camera, getTerrainHeightAt, scene);
  buildChunksAround(player.position.x, player.position.z);

  // Eau suit en XZ
  water.position.x = player.position.x;
  water.position.z = player.position.z;

  // HUD world info
  const { chunkSize } = terrainParams;
  const cx = Math.floor(player.position.x / chunkSize);
  const cz = Math.floor(player.position.z / chunkSize);
  const px = player.position.x.toFixed(2);
  const py = player.position.y.toFixed(2);
  const pz = player.position.z.toFixed(2);

  let biomeName = 'N/A';
  if (window.BIOME && BIOME.biomeParamsAt) {
    const bp = BIOME.biomeParamsAt(player.position.x, player.position.z);
    biomeName = bp.name || 'N/A';
  }
  
  window.currentBiome = biomeName;
  hud.textContent = `Chunk: (${cx}, ${cz})\nPos:   (${px}, ${py}, ${pz})\nBiome: ${biomeName}`;

  // ➜ pickups (affiche le prompt si proche)
  updatePickupPrompt();

  renderer.render(scene, camera);
}
animate();

// ===== Resize =====
addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
