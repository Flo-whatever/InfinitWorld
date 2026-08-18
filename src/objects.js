// === objects.js — arbres/rochers + pickups (herbes/coffres)
// Version réécrite :
//  - Spawn BIOME-aware (Forest/Hills/Mountains/Beach)
//  - Pickups RARES et max 1 par chunk (herbe + coffre) — pas de doublons aux bordures
//  - Collisions simples via userData.isObstacle + colliderRadius
//  - Placement déterministe par (cx,cz) + seed
//  - Surfaces « plates » pour les pickups (tolérance de pente)

// ───────────────────────────────────────────────────────────────────────────────
// Utils déterministes
function hash2d(ix, iz, seed){
  let n = ix*374761393 + iz*668265263 + (seed|0)*1442695041;
  n = (n ^ (n>>13)) * 1274126177;
  n = (n ^ (n>>16)) >>> 0;
  return (n % 1_000_000) / 1_000_000; // 0..1
}
function jittered(seed, x, z, amp=1.2){
  const jx = (hash2d(Math.floor(x)+17, Math.floor(z)+11, seed)-0.5)*amp;
  const jz = (hash2d(Math.floor(x)+23, Math.floor(z)+29, seed)-0.5)*amp;
  return [x + jx, z + jz];
}
function seededRange(seed, x, z, a, b){
  const r = hash2d(Math.floor(x)*11+7, Math.floor(z)*13+19, seed);
  return a + (b-a)*r;
}

// Slope helper : retourne une mesure simple de pente autour (x,z)
function estimateSlope(x, z, sample=0.6){
  const h  = window.worldHeightAt(x, z);
  const hx = window.worldHeightAt(x+sample, z);
  const hz = window.worldHeightAt(x, z+sample);
  return Math.max(Math.abs(hx-h), Math.abs(hz-h)); // ≈ max pente locale
}

function isFlatEnough(x, z, tol=1.2){
  return estimateSlope(x, z) < tol;
}

// ───────────────────────────────────────────────────────────────────────────────
// Assets procéduraux
function createTree(){
  // Tronc
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0x8b4513 })
  );
  trunk.position.y = 1;
  trunk.userData.isObstacle = true;
  trunk.userData.colliderRadius = 0.9;
  trunk.castShadow = true;

  // Feuillage (3 sphères)
  const foliage = new THREE.Group();
  for (let i=0;i<3;i++){
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(5 - i*0.15, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x0e380e, flatShading:true })
    );
    leaf.position.y = 12 + i*0.35;
    leaf.castShadow = true;
    foliage.add(leaf);
  }

  const tree = new THREE.Group();
  tree.add(trunk, foliage);
  tree.traverse(o=>{ if (o.isMesh){ o.castShadow = true; o.receiveShadow = false; }});
  return tree;
}

function createRock(scale=1){
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.4, 0),
    new THREE.MeshStandardMaterial({ color: 0x888888, flatShading:true })
  );
  rock.castShadow = true;
  rock.userData.isObstacle = true;
  rock.userData.colliderRadius = 0.45 * scale;
  rock.scale.set(scale, scale, scale);
  return rock;
}

// ── PICKUPS ───────────────────────────────────────────────────────────────────
function _catalogName(id, fallback){
  try{ return (window.InventoryCatalog && InventoryCatalog[id] && InventoryCatalog[id].name) || fallback; }catch{ return fallback; }
}

// Herbes médicinales => 1 petite potion
function createHerbPatch(){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x38b66b, flatShading:true, emissive:0x0, metalness:0, roughness:1 });
  for (let i=0;i<5;i++){
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.8, 6), mat);
    blade.position.set((Math.random()-0.5)*0.6, 0.4, (Math.random()-0.5)*0.6);
    blade.rotation.y = Math.random()*Math.PI*2;
    g.add(blade);
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.5, 16),
    new THREE.MeshBasicMaterial({ color:0x6cff9a, transparent:true, opacity:0.65, side:THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI/2;
  g.add(ring);

  g.userData.isPickup = true;
  g.userData.pickup = { id:'potion_small', qty:1, label: _catalogName('potion_small','Petite potion') };
  return g;
}

// Coffre => 1 potion moyenne
function createChest(){
  const chest = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.9,0.5,0.6),
    new THREE.MeshStandardMaterial({ color:0x7b4a1e, metalness:0.1, roughness:0.8 })
  );
  base.position.y = 0.25;
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.92,0.08,0.62),
    new THREE.MeshStandardMaterial({ color:0xd4b36a, metalness:0.6, roughness:0.4 })
  );
  band.position.y = 0.36;
  chest.add(base, band);

  chest.userData.isPickup = true;
  chest.userData.pickup = { id:'potion_medium', qty:1, label: _catalogName('potion_medium','Potion moyenne') };
  return chest;
}

// ── Bouche de grotte ─────────────────────────────────────────────────────────
// Anneau de rochers autour du bord de l'entonnoir (donne l'impression d'un
// surplomb qui encadre l'entrée), une lueur chaude qui remonte du fond, et un
// coffre garanti tout en bas pour récompenser la descente.
function spawnCaveEntrance(cave, group, obstacleBucket){
  const cfg = (window.BIOME && BIOME.caveConfig) || { radius: 9, depth: 34 };
  const rockCount = 7 + Math.floor(Math.random()*3);
  for (let i=0;i<rockCount;i++){
    const a = (i/rockCount) * Math.PI*2 + (Math.random()-0.5)*0.3;
    const r = cfg.radius * (0.85 + Math.random()*0.35);
    const px = cave.x + Math.cos(a)*r;
    const pz = cave.z + Math.sin(a)*r;
    const ph = window.worldHeightAt(px, pz);
    const rock = createRock(1.1 + Math.random()*1.1);
    rock.position.set(px, ph + 0.1, pz);
    rock.rotation.y = Math.random()*Math.PI*2;
    group.add(rock);
    if (obstacleBucket) obstacleBucket.push(rock);
  }

  const floorY = window.worldHeightAt(cave.x, cave.z);

  // Lueur chaude qui remonte du fond — lisible de loin, fidèle au lore
  // (essence de rêve condensée par les Tisserands, voir catalog.js).
  const glow = new THREE.PointLight(0xffaa55, 1.4, 45, 2);
  glow.position.set(cave.x, floorY + 5, cave.z);
  group.add(glow);

  const chest = createChest();
  chest.position.set(cave.x, floorY + 0.01, cave.z);
  chest.rotation.y = Math.random()*Math.PI*2;
  group.add(chest);
  if (typeof window.__registerPickup === 'function') window.__registerPickup(chest);
}

// ───────────────────────────────────────────────────────────────────────────────
// Réglages spawn (probabilités par CHUNK + quotas)
const SPAWN = {
  // Chances par CHUNK d’autoriser le spawn d’un type de pickup
  herbChunkChance: 0.15,    // ≈15% des chunks peuvent contenir 1 herbe max
  chestChunkChance: 0.025,  // ≈2.5% des chunks peuvent contenir 1 coffre max
  maxHerbsPerChunk: 1,
  maxChestsPerChunk: 1
};

// Pondérations par biome (pour arbres/rochers + affinités pickups)
const BIOME_WEIGHTS = {
  trees:      { Forest:0.50, Hills:0.15, Mountains:0.10, Beach:0.05, default:0.7 },
  rocks:      { Forest:0.70, Hills:0.90, Mountains:1.40, Beach:0.40, default:0.8 },
  herbFavor:  { Forest:1.00, Hills:0.90, Mountains:0.30, Beach:0.20, default:0.7 },
  chestFavor: { Forest:0.70, Hills:0.80, Mountains:1.10, Beach:1.20, default:0.8 }
};

function biomeNameAt(x,z){
  try{
    if (window.BIOME && BIOME.biomeParamsAt){
      const bp = BIOME.biomeParamsAt(x,z); return bp.name||'default';
    }
  }catch{}
  return 'default';
}
function weightFor(kind, name){
  const table = BIOME_WEIGHTS[kind] || {};
  return table[name] ?? table.default ?? 1;
}

// ───────────────────────────────────────────────────────────────────────────────
// Placement d’objets par chunk (arbres, rochers, pickups)
function addDeterministicObjectsForChunk(cx, cz, group, size, segs){
  const { seed } = window.terrainParams;
  const step = Math.max(3, size/32); // pas trop dense

  const startX = cx*size - size/2;
  const startZ = cz*size - size/2;

  // Registre des obstacles par chunk (voir ThirdPersonControls.js) : évite de
  // parcourir toute la scène à chaque frame pour tester les collisions —
  // on ne teste que les obstacles des chunks proches du joueur.
  window.__obstaclesByChunk = window.__obstaclesByChunk || new Map();
  const obstacleBucket = [];
  window.__obstaclesByChunk.set(`${cx},${cz}`, obstacleBucket);

  // Bouches de grottes dont le centre tombe dans ce chunk (voir biome.fixed.js
  // — la dépression elle-même est déjà dans le terrain via worldHeightAt,
  // ici on ne fait que la décorer et y déposer un butin garanti).
  if (window.BIOME && BIOME.caveCentersInBounds){
    const caves = BIOME.caveCentersInBounds(startX, startX+size, startZ, startZ+size);
    for (const cave of caves) spawnCaveEntrance(cave, group, obstacleBucket);
  }

  // Tirages « par chunk » pour autoriser (ou non) le spawn de pickups
  const herbRoll  = hash2d(cx*928371 + cz*123457,  7, seed);
  const chestRoll = hash2d(cx*192837 + cz*765431, 11, seed);
  const allowHerb  = (herbRoll  < SPAWN.herbChunkChance);
  const allowChest = (chestRoll < SPAWN.chestChunkChance);
  let herbCount = 0, chestCount = 0;

  for (let z=0; z < size; z+=step){       // < size  => évite doublons aux bordures
    for (let x=0; x < size; x+=step){
      const wx = startX + x;
      const wz = startZ + z;

      const h = window.worldHeightAt(wx, wz);
      const WL = window.localWaterLevelAt(wx, wz);
      if (h <= WL) continue; // rien sous l’eau

      // bande de bruit large pour diversité « régionale »
      const band = window.__NOISE__ ? window.__NOISE__.get(wx/100*5, wz/100*5, 0) : 0;

      // r local déterministe
      const r = hash2d(Math.floor(wx), Math.floor(wz), seed);

      // biome dominant
      const bName = biomeNameAt(wx, wz);

      // ── Arbres (plutôt Forest/Hills)
      // base ~11%, pondéré par biome; réduit un peu en zones très rocheuses (band>0.4)
      const treeBase = 0.11 * weightFor('trees', bName) * (band>0.4 ? 0.6 : 1);
      if (r < treeBase && Math.abs(band) < 0.35){
        const [px, pz] = jittered(seed, wx, wz, 1.4);
        const ph = window.worldHeightAt(px, pz);
        const t = createTree();
        // variation de taille légère et déterministe
        const s = 0.9 + seededRange(seed, px, pz, 0, 0.25);
        t.scale.setScalar(s);
        t.position.set(px, ph, pz);
        group.add(t);
        obstacleBucket.push(t);
      }

      // ── Rochers (pentes/hauteurs, surtout Mountains)
      const rockBase = 0.02 * weightFor('rocks', bName) * (band>=0.25 ? 1 : 0.6);
      if (r > 0.6 && r < 0.6 + rockBase){
        const [px, pz] = jittered(seed, wx, wz, 1.2);
        const ph = window.worldHeightAt(px, pz);
        const slope = estimateSlope(px, pz, 0.8);
        // rocher plus gros sur fortes pentes
        const s = 0.35 + Math.min(0.65, slope*0.6) + seededRange(seed, px+77, pz+33, 0, 0.2);
        const rock = createRock(s);
        rock.position.set(px, ph+0.05, pz);
        group.add(rock);
        obstacleBucket.push(rock);
      }

      // ── PICKUPS : Herbes médicinales (RARES, 0–1/chunk)
      if (allowHerb && herbCount < SPAWN.maxHerbsPerChunk){
        // fenêtre étroite sur r pour garantir rareté, favorisée par biome
        const favor = weightFor('herbFavor', bName);
        const pMin = 0.735, pMax = 0.739 + (favor-1)*0.002; // léger élargissement si favorisé
        if (Math.abs(band) < 0.35 && r > pMin && r < pMax){
          const [px, pz] = jittered(seed+901, wx, wz, 1.0);
          if (isFlatEnough(px, pz, 1.2)){
            const ph = window.worldHeightAt(px, pz);
            const herb = createHerbPatch();
            herb.position.set(px, ph+0.02, pz);
            group.add(herb);
            herbCount++;
            if (typeof window.__registerPickup === 'function') window.__registerPickup(herb);
          }
        }
      }

      // ── PICKUPS : Coffres (TRÈS RARES, 0–1/chunk)
      if (allowChest && chestCount < SPAWN.maxChestsPerChunk){
        const favor = weightFor('chestFavor', bName);
        // prop un chouïa plus élevée sur plages & montagnes
        const pMin = 0.885, pMax = 0.887 + (favor-1)*0.0025;
        if ((band < -0.55 || band > 0.55) && r > pMin && r < pMax){
          const [px, pz] = jittered(seed+1403, wx, wz, 1.6);
          if (isFlatEnough(px, pz, 1.0)){
            const ph = window.worldHeightAt(px, pz);
            const chest = createChest();
            chest.position.set(px, ph+0.01, pz);
            chest.rotation.y = (hash2d(Math.floor(wx)+77, Math.floor(wz)+33, seed) * Math.PI*2);
            group.add(chest);
            chestCount++;
            if (typeof window.__registerPickup === 'function') window.__registerPickup(chest);
          }
        }
      }

      // NB: on ne « break » pas la boucle pour garder la déco (arbres/rochers)
    }
  }
}

// Expose API globale (utilisé par terrain.js)
window.addDeterministicObjectsForChunk = addDeterministicObjectsForChunk;
window.createTree = createTree;
