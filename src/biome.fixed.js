// ===== biome.js =====
// Biomes à grande échelle + hauteur monde + niveau d'eau local.
// Équilibrage de la fréquence : distance cyclique + weights par biome.
//
// Expose :
//   BIOME.biomeParamsAt(x,z)
//   BIOME.localWaterLevelAt(x,z)
//   BIOME.worldHeightAt(x,z)
// Et assigne :
//   window.localWaterLevelAt, window.worldHeightAt

(function(){
  function cyclicDistance(v, c){
    // v, c ∈ [-1, 1] avec wrap autour de -1/1 (périmètre = 2)
    const d = Math.abs(v - c);
    return Math.min(d, 2 - d);
  }

  // Utilitaire : normaliser un bruit supposé 0..1 en -1..1
  function nrm01to11(x){ return (x * 2) - 1; }

  // ───────────────────────────────────────────────────────────────────────
  // Poches de grottes — dépression profonde en entonnoir, greffée sur le
  // heightmap existant (un terrain à une seule hauteur par colonne ne peut
  // pas représenter un vrai surplomb/tunnel, mais un entonnoir profond +
  // une "bouche" rocheuse décorative en surface donne une vraie sensation
  // de descente sous terre sans toucher au moteur de terrain).
  //
  // Placement déterministe sur une grille grossière indépendante des chunks
  // (même principe que hash2d dans objects.js, dupliqué ici pour que
  // biome.fixed.js reste autonome).
  const CAVE_GRID   = 220;  // taille de cellule (grottes rares, bien espacées)
  const CAVE_CHANCE = 0.35; // proportion de cellules candidates qui ont une grotte
  const CAVE_RADIUS = 9;    // rayon de l'entonnoir en surface
  const CAVE_DEPTH  = 34;   // profondeur du fond par rapport au terrain naturel
  // La nappe d'eau globale du jeu est un plan unique (à terrainParams.bands.
  // waterLevel) qui suit le joueur partout, sans connaître les dépressions du
  // terrain. Cette marge garantit que même le point le plus bas d'une grotte
  // reste au-dessus de ce plan (sinon le fond semblerait inondé) : on exige
  // un terrain naturel à CAVE_DEPTH + une marge au-dessus du niveau de l'eau.
  const CAVE_MIN_SURFACE_ABOVE_WATER = CAVE_DEPTH + 8;

  function hashCave(a, b, seed){
    let n = a*374761393 + b*668265263 + (seed|0)*1442695041;
    n = (n ^ (n>>13)) * 1274126177;
    n = (n ^ (n>>16)) >>> 0;
    return (n % 1_000_000) / 1_000_000;
  }

  // Renvoie {x,z} si la cellule de grille (gx,gz) contient une grotte, sinon null.
  function caveCenterInCell(gx, gz, seed){
    const roll = hashCave(gx, gz, seed);
    if (roll >= CAVE_CHANCE) return null;
    const jx = hashCave(gx*7+3, gz*7+3, seed+1);
    const jz = hashCave(gx*11+5, gz*11+5, seed+2);
    return {
      x: (gx + 0.15 + jx*0.7) * CAVE_GRID,
      z: (gz + 0.15 + jz*0.7) * CAVE_GRID,
    };
  }

const BIOME = {
  config: {
    // Taille des régions (plus grand => biomes plus larges)
    scale: 900,
    // Douceur des transitions (0.05..0.6)
    blendWidth: 0.35,
    // Poids de prévalence par biome (1 = neutre)
    // ↓ Ajuste ceci pour réduire Beach/Mountains par ex. [1, 1, 0.9, 0.6]
    weights: [100, 1, 0.1, 100],
    // 4 familles de biomes
    sets: [
      { 
        name:'Forest',    
        amplitude:   8, 
        frequency:   1, 
        waterOffset: +5.0,   // << relevé largement au-dessus du plan global
        oceanAmp:    0.0,    // pas de relief sous-marin
        oceanFreq:   0.0 
      },
      { 
        name:'Hills',     
        amplitude:   15, 
        frequency:   1, 
        waterOffset: +3.0,   // idem : pas d’eau locale
        oceanAmp:    0.0,
        oceanFreq:   0.0 
      },
      { 
        name:'Mountains', 
        amplitude: 100, 
        frequency:   1, 
        waterOffset: -2.85,  // comme avant (peut générer des lacs/glaciers)
        oceanAmp:    0.4, 
        oceanFreq:   3.0 
      },
      { 
        name:'Beach',     
        amplitude:   60, 
        frequency:   1, 
        waterOffset:  10,   // plages au niveau global
        oceanAmp:    0.2, 
        oceanFreq:   1.5 
      }
    ]
  },


    biomeParamsAt(x, z){
      const c = this.config;
      const scale = Math.max(10, c.scale);
      const nx = (x + 10000) / scale;
      const nz = (z - 20000) / scale;

      const n  = window.__NOISE__;
      // Normaliser en [-1,1] car perlin-noise-3d renvoie 0..1
      const vraw = n ? n.get(nx, nz, 0) : 0; // 0..1
      const v    = nrm01to11(vraw);          // -1..1

      const C = [-0.75, -0.25, 0.25, 0.75];
      const width = Math.max(0.05, c.blendWidth);

      // Triangles centrés avec distance "cyclique" + poids de prévalence
      const raw = new Float32Array(4);
      for (let i=0;i<4;i++){
        const d = cyclicDistance(v, C[i]);                 // équilibrage bords
        const t = Math.max(0, 1 - d / width);
        raw[i] = (t * t) * (c.weights[i] || 1);            // pondération par biome
      }

      let sum = raw[0]+raw[1]+raw[2]+raw[3];
      if (sum <= 1e-5){ raw[1] = 1; sum = 1; }
      const w = new Float32Array(4);
      for (let i=0;i<4;i++) w[i] = raw[i] / sum;

      const S = c.sets;
      let amp=0, freq=0, woff=0, oamp=0, ofreq=0, mi=0, mw=-1;
      for (let i=0;i<4;i++){
        amp   += S[i].amplitude  * w[i];
        freq  += S[i].frequency  * w[i];
        woff  += S[i].waterOffset* w[i];
        oamp  += S[i].oceanAmp   * w[i];
        ofreq += S[i].oceanFreq  * w[i];
        if (w[i] > mw){ mw = w[i]; mi = i; }
      }
      return { name:S[mi].name, amplitude:amp, frequency:freq, waterOffset:woff, oceanAmp:oamp, oceanFreq:ofreq };
    },

    // Grotte la plus proche de (x,z), en cherchant dans la cellule courante
    // + les 8 voisines (une grotte peut déborder sur la cellule d'à côté).
    // Renvoie {x,z,dist} ou null.
    caveInfoNear(x, z){
      const seed = (window.terrainParams && window.terrainParams.seed) || 0;
      const gx = Math.floor(x / CAVE_GRID);
      const gz = Math.floor(z / CAVE_GRID);
      let best = null, bestDist = Infinity;
      for (let dz=-1; dz<=1; dz++){
        for (let dx=-1; dx<=1; dx++){
          const c = caveCenterInCell(gx+dx, gz+dz, seed);
          if (!c) continue;
          const d = Math.hypot(x-c.x, z-c.z);
          if (d < bestDist){ bestDist = d; best = c; }
        }
      }
      return best ? { x:best.x, z:best.z, dist:bestDist } : null;
    },

    // Centres de grottes dont le POINT CENTRAL tombe dans les bornes données
    // — utilisé par objects.js pour décorer chaque grotte une seule fois,
    // dans le chunk qui contient effectivement son centre.
    caveCentersInBounds(minX, maxX, minZ, maxZ){
      const seed = (window.terrainParams && window.terrainParams.seed) || 0;
      const gx0 = Math.floor(minX / CAVE_GRID) - 1;
      const gx1 = Math.floor(maxX / CAVE_GRID) + 1;
      const gz0 = Math.floor(minZ / CAVE_GRID) - 1;
      const gz1 = Math.floor(maxZ / CAVE_GRID) + 1;
      const found = [];
      for (let gz=gz0; gz<=gz1; gz++){
        for (let gx=gx0; gx<=gx1; gx++){
          const c = caveCenterInCell(gx, gz, seed);
          if (!c) continue;
          if (c.x >= minX && c.x < maxX && c.z >= minZ && c.z < maxZ) found.push(c);
        }
      }
      return found;
    },

    localWaterLevelAt(x, z){
      const base = (window.terrainParams && window.terrainParams.bands)
        ? window.terrainParams.bands.waterLevel
        : 1.8;
      const bp = this.biomeParamsAt(x, z);
      return base + bp.waterOffset;
    },

    worldHeightAt(x, z){
      const tp = window.terrainParams || { seed:0 };
      const bp = this.biomeParamsAt(x, z);

      const angle = Math.PI/6;
      const rx = x*Math.cos(angle) - z*Math.sin(angle);
      const rz = x*Math.sin(angle) + z*Math.cos(angle);

      const offsetX = (tp.seed % 1000);
      const offsetZ = ((tp.seed * 3) % 1000);

      const f1 = bp.frequency / 100;
      const f2 = (bp.frequency * 2) / 100;

      const n = window.__NOISE__;
      // Normaliser les octaves de hauteur aussi
      const r1 = n ? n.get((rx + offsetX) * f1, (rz + offsetZ) * f1, 0) : 0; // 0..1
      const r2 = n ? n.get((rx + offsetX) * f2, (rz + offsetZ) * f2, 0) : 0; // 0..1
      const n1 = nrm01to11(r1);
      const n2 = nrm01to11(r2);
      let h = ((n1 + 0.5 * n2) / 1.5) * bp.amplitude;

      // Relief sous-marin dédié
      const wl = this.localWaterLevelAt(x, z);
      if (h < wl){
        const fo = Math.max(0.01, bp.oceanFreq) / 100;
        const ro = n ? n.get((rx - 777) * fo, (rz + 333) * fo, 0) : 0; // 0..1
        const on = nrm01to11(ro);
        h += on * bp.oceanAmp;
      }

      // Poche de grotte : entonnoir profond, indépendant du bruit normal.
      // Seulement sur terrain confortablement au-dessus de l'eau, pour
      // éviter des gouffres bizarres près des plages/lacs.
      if (h > wl + CAVE_MIN_SURFACE_ABOVE_WATER){
        const cave = this.caveInfoNear(x, z);
        if (cave && cave.dist < CAVE_RADIUS){
          const t = 1 - (cave.dist / CAVE_RADIUS);   // 0 au bord, 1 au centre
          const smooth = t*t*(3-2*t);                // smoothstep
          h -= smooth * CAVE_DEPTH;
        }
      }

      return h;
    }
  };

  // Expose
  BIOME.caveConfig = { radius: CAVE_RADIUS, depth: CAVE_DEPTH };
  window.BIOME = BIOME;
  window.localWaterLevelAt = (x,z)=>BIOME.localWaterLevelAt(x,z);
  window.worldHeightAt     = (x,z)=>BIOME.worldHeightAt(x,z);
})();
