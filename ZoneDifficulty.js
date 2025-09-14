// ZoneDifficulty.js — anneaux de difficulté + bonus par biome
// API: ZoneDifficulty.regionAt(x,z) -> { minLevel, maxLevel, name, distance }

(function(){
  const rings = [
    // r = distance minimale (en unités monde) depuis (0,0)
    { r:    0, range:[ 1,  1], name:"Safe" },
    { r:  900, range:[ 2,  5], name:"Very easy" },
    { r: 1800, range:[ 5, 10], name:"Easy" },
    { r: 2700, range:[10, 15], name:"Middle difficulty" },
    { r: 3600, range:[15, 20], name:"Hard difficulty" },
    { r: 4500, range:[20, 25], name:"Experimented difficulty" },
    { r: 5400, range:[25, 30], name:"PEX begins" },
  ];

  // Petit bonus/malus selon biome dominant (optionnel)
  const biomeBonus = { Forest: 0, Hills: +1, Mountains: +2, Beach: -1 };

  function regionAt(x, z){
    const d = Math.hypot(x, z);
    let seg = rings[0];
    for (const r of rings){ if (d >= r.r) seg = r; else break; }

    let [minL, maxL] = seg.range;
    let label = seg.name;

    // Ajustement léger selon biome — désactivé dans l’anneau "Safe"
    if (window.BIOME && BIOME.biomeParamsAt){
      const b = BIOME.biomeParamsAt(x, z).name;
      const k = biomeBonus[b] || 0;

      // 👉 Solution A : pas de bonus de biome si on est dans l'anneau Safe (r === 0)
      const isSafeRing = seg.r === 0;
      const kEff = isSafeRing ? 0 : k;

      minL = Math.max(1, minL + kEff);
      maxL = Math.max(minL, maxL + kEff);
      label = `${seg.name} (${b})`;
    }

    return { minLevel:minL, maxLevel:maxL, name:label, distance:Math.floor(d) };
  }

  window.ZoneDifficulty = { regionAt, config:{ rings, biomeBonus } };
})();
