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
      return h;
    }
  };

  // Expose
  window.BIOME = BIOME;
  window.localWaterLevelAt = (x,z)=>BIOME.localWaterLevelAt(x,z);
  window.worldHeightAt     = (x,z)=>BIOME.worldHeightAt(x,z);
})();
