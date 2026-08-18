(function(){
  // ===== Prérequis =====
  if (!window.Inventory) console.warn('[GameMenu] Inventory (inventory.js) non trouvé. Le volet Inventaire sera partiel.');
  if (!window.BIOME) console.warn('[GameMenu] BIOME (biome.fixed.js) non trouvé. La carte utilisera des couleurs par défaut.');

  // ===== Helpers joueur =====
  function getPlayer(){ return window.__PLAYER__ || null; }
  function waitForPlayer(timeoutMs=10000){
    return new Promise((resolve,reject)=>{
      const p0 = getPlayer();
      if (p0) return resolve(p0);
      let done=false;
      const onReady = ()=>{ if(done) return; done=true; window.removeEventListener('player:ready', onReady); resolve(getPlayer()); };
      window.addEventListener('player:ready', onReady, { once:true });
      setTimeout(()=>{
        if(done) return;
        done=true;
        window.removeEventListener('player:ready', onReady);
        const p1 = getPlayer();
        if (p1) resolve(p1); else reject(new Error('player timeout'));
      }, timeoutMs);
    });
  }

  // ===== Persistance équipement =====
  const EQ_KEY = 'rpg.equipment.v1'; // { outfit, weapon, armor }
  function loadEq(){ try { return JSON.parse(localStorage.getItem(EQ_KEY)) || { outfit:null, weapon:null, armor:null }; } catch { return { outfit:null, weapon:null, armor:null }; } }
  function saveEq(eq){ try { localStorage.setItem(EQ_KEY, JSON.stringify(eq)); } catch {} }

  // ===== CSS =====
  const css = `
  .gmMenu { position:fixed; inset: 10% 12% 10% 12%; background: rgba(10,14,30,.95); border: 1px solid #273158; border-radius:16px; box-shadow: 0 10px 40px rgba(0,0,0,.5); color:#e8e8ea; z-index:100002; display:none; backdrop-filter: blur(2px); }
  .gmMenu.open { display:block; }
  .gmHeader{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #273158; background: linear-gradient(180deg, rgba(30,38,75,.9), rgba(20,26,56,.9)); border-radius: 16px 16px 0 0; }
  .gmTabs { display:flex; gap:8px; }
  .gmTabBtn { padding:8px 12px; border-radius:10px; border:1px solid #33406d; background:#1a2350; color:#e8e8ea; cursor:pointer; font-weight:600; }
  .gmTabBtn.active { background:#223077; }
  .gmClose { padding:6px 10px; border-radius:8px; border:1px solid #33406d; background:#1a2350; color:#e8e8ea; cursor:pointer; }

  .gmBody{ display:grid; grid-template-columns: 1fr; height: calc(100% - 48px); }
  .gmPanel{ display:none; padding:12px; overflow:auto; }
  .gmPanel.active{ display:block; }

  /* Inventaire */
  .gmInvGold{ display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .gmCoin{ width:16px; height:16px; border-radius:50%; background:radial-gradient(circle at 30% 30%, #ffd65a, #d4a11e); box-shadow:inset 0 0 0 1px rgba(0,0,0,.25); }
  .gmInvList{ display:grid; gap:8px; }
  .gmInvItem{ display:grid; grid-template-columns: 1fr auto auto; gap:8px; align-items:center; border:1px solid #273158; background:#111936; border-radius:10px; padding:8px 10px; }
  .gmBtn{ padding:6px 10px; border-radius:10px; border:1px solid #33406d; background:#1a2350; color:#e8e8ea; cursor:pointer; }
  .gmBtn:disabled{ opacity:.5; cursor:default; }

  /* Joueur */
  .gmGrid2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
  .gmCard{ border:1px solid #273158; background:#0f1530; border-radius:12px; padding:12px; }
  .gmTitle{ font-weight:700; margin-bottom:8px; }
  .gmBar{ height:8px; border-radius:6px; background:#222; margin:6px 0 10px 0; position:relative; }
  .gmFill{ position:absolute; left:0; top:0; bottom:0; width:0%; background:#2ecc71; border-radius:6px; }
  .gmRow{ display:flex; justify-content:space-between; margin:4px 0; }
  .gmEquipSlots{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; }
  .gmSlot{ border:1px dashed #3a4678; border-radius:10px; padding:8px; min-height:60px; }
  .gmSlotName{ opacity:.7; font-size:12px; margin-bottom:4px; }
  .gmSlotItem{ font-weight:600; margin-bottom:6px; }
  .gmSlotBtns{ display:flex; gap:6px; }

  /* Carte */
  .gmMapTop{
    display:flex; gap:8px; margin-bottom:8px; align-items:center;
    justify-content:center;            /* centre la barre d’outils */
  }
  /* Spécifique au panneau Carte : centre le contenu (canvas) */
  #gmPanel-map.gmPanel.active{
    display:flex;                       /* seulement pour ce panneau */
    flex-direction:column;
    align-items:center;                 /* centre horizontalement */
    justify-content:center;             /* centre verticalement */
    min-height: calc(100% - 8px);
  }
  .gmMapCanvas{
    display:block;
    width:auto;                         /* pas de width:100% */
    height:auto;                        /* pas de height:60vh */
    flex:0 0 auto;                      /* ne pas s’étirer */
    margin:8px auto 0;                  /* centre + petit espace avec la barre */
    border:1px solid #273158; border-radius:12px; background:#0b0f1f;
    image-rendering: pixelated;
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ===== DOM principal =====
  const menu = document.createElement('div');
  menu.className = 'gmMenu';
  menu.innerHTML = `
    <div class="gmHeader">
      <div class="gmTabs">
        <button class="gmTabBtn" data-tab="inv">Inventaire</button>
        <button class="gmTabBtn" data-tab="player">Joueur</button>
        <button class="gmTabBtn" data-tab="map">Carte</button>
      </div>
      <button class="gmClose">Fermer [I]</button>
    </div>
    <div class="gmBody">
      <div class="gmPanel" id="gmPanel-inv">
        <div class="gmInvGold"><div class="gmCoin"></div><div><span class="gmGold">0</span> or</div></div>
        <div class="gmInvList"></div>
      </div>
      <div class="gmPanel" id="gmPanel-player">
        <div class="gmGrid2">
          <div class="gmCard">
            <div class="gmTitle">Statistiques</div>
            <div class="gmRow"><div>Niveau</div><div class="gmLvl">—</div></div>
            <div>XP <span class="gmXPText">—/—</span></div>
            <div class="gmBar"><div class="gmFill gmXP"></div></div>
            <div>PV <span class="gmHPText">—/—</span></div>
            <div class="gmBar"><div class="gmFill gmHP"></div></div>
            <div class="gmRow"><div>STR</div><div class="gmSTR">—</div></div>
            <div class="gmBar"><div class="gmFill gmSTRf"></div></div>
            <div class="gmRow"><div>DEF</div><div class="gmDEF">—</div></div>
            <div class="gmBar"><div class="gmFill gmDEFf"></div></div>
            <div class="gmRow"><div>AGI</div><div class="gmAGI">—</div></div>
            <div class="gmBar"><div class="gmFill gmAGIf"></div></div>
          </div>
          <div class="gmCard">
            <div class="gmTitle">Équipement</div>
            <div class="gmEquipSlots">
              <div class="gmSlot" data-slot="outfit">
                <div class="gmSlotName">Tenue</div>
                <div class="gmSlotItem gmSlotItem-outfit">—</div>
                <div class="gmSlotBtns"><button class="gmBtn gmUnequip" data-slot="outfit">Déséquiper</button></div>
              </div>
              <div class="gmSlot" data-slot="weapon">
                <div class="gmSlotName">Arme</div>
                <div class="gmSlotItem gmSlotItem-weapon">—</div>
                <div class="gmSlotBtns"><button class="gmBtn gmUnequip" data-slot="weapon">Déséquiper</button></div>
              </div>
              <div class="gmSlot" data-slot="armor">
                <div class="gmSlotName">Protection</div>
                <div class="gmSlotItem gmSlotItem-armor">—</div>
                <div class="gmSlotBtns"><button class="gmBtn gmUnequip" data-slot="armor">Déséquiper</button></div>
              </div>
            </div>
          </div>
        </div>        
      </div>
      <div class="gmPanel" id="gmPanel-map">
        <div class="gmMapTop">
          <button class="gmBtn gmFollow">Suivre: ON</button>
          <button class="gmBtn gmZoomIn">Zoom +</button>
          <button class="gmBtn gmZoomOut">Zoom −</button>
          <span style="opacity:.7">Molette = zoom, glisser = pan</span>
        </div>
        <canvas class="gmMapCanvas" width="800" height="600"></canvas>
      </div>
    </div>
  `;
  document.body.appendChild(menu);

  // === Refs globales menu ===
  const tabBtns = menu.querySelectorAll('.gmTabBtn');
  const panels = {
    inv: menu.querySelector('#gmPanel-inv'),
    player: menu.querySelector('#gmPanel-player'),
    map: menu.querySelector('#gmPanel-map'),
  };
  let open = false;
  let activeTab = 'inv';

  // ===== INVENTAIRE =====
  const elGold = menu.querySelector('.gmGold');
  const elInvList = menu.querySelector('.gmInvList');

  function displayNameFor(id, meta){
    const cat = window.InventoryCatalog || {};
    const def = cat[id];
    const base = def?.name || id;
    if (meta && meta.quality) return `${base} (${meta.quality})`;
    return base;
  }
  function slotFor(id){
    const def = (window.InventoryCatalog||{})[id];
    return def?.slot || null; // 'weapon' | 'armor' | 'outfit' | null
  }
  function bonusesFor(id){
    const def = (window.InventoryCatalog||{})[id];
    return def?.bonuses || {}; // { str, def, agi, maxHP }
  }

  let equipment = loadEq(); // { outfit, weapon, armor }

  function renderInv(){
    if (!window.Inventory){ elInvList.innerHTML = '<div style="opacity:.7">Inventory non chargé</div>'; return; }
    const inv = Inventory.get();
    elGold.textContent = inv.gold|0;
    elInvList.innerHTML = '';
    if (!inv.items.length){
      const empty = document.createElement('div');
      empty.style.opacity='.7'; empty.textContent='Inventaire vide.';
      elInvList.appendChild(empty);
      return;
    }
    for (const it of inv.items){
      const row = document.createElement('div');
      row.className='gmInvItem';
      const name = displayNameFor(it.id, it.meta);
      const slot = slotFor(it.id);

      const nameEl = document.createElement('div');
      nameEl.textContent = name;
      const qtyEl = document.createElement('div');
      qtyEl.textContent = 'x'+it.qty;
      const btn = document.createElement('button');
      btn.className='gmBtn';
      if (slot) {
        btn.textContent = 'Équiper';
        btn.onclick = ()=> equipItemFromInventory(it);
      } else if ((window.InventoryCatalog||{})[it.id]?.consumable) {
        btn.textContent = 'Utiliser';
        btn.onclick = ()=> useConsumable(it);
      } else {
        btn.textContent = '—';
        btn.disabled = true;
      }

      row.appendChild(nameEl);
      row.appendChild(qtyEl);
      row.appendChild(btn);
      elInvList.appendChild(row);
    }
  }

  function equipItemFromInventory(item){
    const p = getPlayer(); if (!p) return;
    const slot = slotFor(item.id);
    if (!slot) return;
    const removed = Inventory.removeItem(item.id, 1, item.meta);
    if (!removed) return;

    const prev = equipment[slot];
    if (prev) Inventory.addItem(prev.id, 1, prev.meta);

    equipment[slot] = { id:item.id, meta: item.meta && typeof item.meta==='object' ? {...item.meta} : undefined };
    saveEq(equipment);

    applyEquipmentBonuses();
    renderPlayer();
    renderInv();
  }

  function unequip(slot){
    const p = getPlayer(); if (!p) return;
    const cur = equipment[slot];
    if (!cur) return;
    Inventory.addItem(cur.id, 1, cur.meta);
    equipment[slot] = null;
    saveEq(equipment);

    applyEquipmentBonuses();
    renderPlayer();
    renderInv();
  }

  function useConsumable(item){
    const def = (window.InventoryCatalog||{})[item.id];
    if (!def || !def.consumable) return;

    // Effets
    if (def.effect?.heal){
      const p = getPlayer();
      if (p && typeof p.heal === 'function') p.heal(def.effect.heal);
      else if (p?.userData?.stats){
        const maxHP = p.getMaxHP ? p.getMaxHP() : (p.userData.stats.base?.maxHP ?? 30);
        p.userData.stats.currentHP = Math.min(maxHP, (p.userData.stats.currentHP||maxHP) + def.effect.heal);
        window.dispatchEvent(new CustomEvent('player:hpChanged',{detail:{hp:p.userData.stats.currentHP,maxHP}}));
      }
    }

    // Retire 1 potion
    Inventory.removeItem(item.id, 1, item.meta);
    renderInv();
    renderPlayer();
  }

  // ===== JOUEUR =====
  const elLvl = menu.querySelector('.gmLvl');
  const xpFill = menu.querySelector('.gmXP');
  const xpText = menu.querySelector('.gmXPText');
  const hpFill = menu.querySelector('.gmHP');
  const hpText = menu.querySelector('.gmHPText');
  const elSTR = menu.querySelector('.gmSTR'), elDEF = menu.querySelector('.gmDEF'), elAGI = menu.querySelector('.gmAGI');
  const fSTR = menu.querySelector('.gmSTRf'), fDEF = menu.querySelector('.gmDEFf'), fAGI = menu.querySelector('.gmAGIf');

  const slotText = {
    outfit: menu.querySelector('.gmSlotItem-outfit'),
    weapon: menu.querySelector('.gmSlotItem-weapon'),
    armor:  menu.querySelector('.gmSlotItem-armor'),
  };
  menu.querySelectorAll('.gmUnequip').forEach(b=> b.addEventListener('click', ()=> unequip(b.dataset.slot)));

  function xpNeed(level){ return Math.max(20, Math.floor(50 * Math.pow(level, 1.5))); }

  function applyEquipmentBonuses(){
    const p = getPlayer(); if (!p) return;
    const stats = p.userData?.stats; if (!stats) return;
    const sum = { str:0, def:0, agi:0, maxHP:0 };
    for (const k of ['outfit','weapon','armor']){
      const eq = equipment[k];
      if (!eq) continue;
      const b = bonusesFor(eq.id);
      if (b.str) sum.str += b.str;
      if (b.def) sum.def += b.def;
      if (b.agi) sum.agi += b.agi;
      if (b.maxHP) sum.maxHP += b.maxHP;
    }
    stats.bonus.str = sum.str;
    stats.bonus.def = sum.def;
    stats.bonus.agi = sum.agi;
    stats.bonus.maxHP = sum.maxHP;

    const maxHP = p.getMaxHP ? p.getMaxHP() : (stats.base?.maxHP ?? 30);
    if (stats.currentHP > maxHP) stats.currentHP = maxHP;
    window.dispatchEvent(new CustomEvent('player:hpChanged',{ detail:{ hp: stats.currentHP, maxHP } }));
  }

  function renderPlayer(){
    const p = getPlayer();
    if (!p){
      elLvl.textContent = '—';
      xpText.textContent = '—/—'; xpFill.style.width = '0%';
      hpText.textContent = '—/—'; hpFill.style.width = '0%';
      elSTR.textContent = '—'; elDEF.textContent = '—'; elAGI.textContent = '—';
      fSTR.style.width='0%'; fDEF.style.width='0%'; fAGI.style.width='0%';
      return;
    }
    const stats = p.userData?.stats; if (!stats) return;

    // Équipement (labels)
    for (const k of ['outfit','weapon','armor']){
      const eq = equipment[k];
      slotText[k].textContent = eq ? (displayNameFor(eq.id, eq.meta)) : '—';
    }

    // Niv/XP
    elLvl.textContent = stats.level;
    const need = xpNeed(stats.level);
    xpText.textContent = `${stats.xp}/${need}`;
    xpFill.style.width = `${Math.min(100, (stats.xp/need)*100)}%`;

    // PV
    const maxHP = p.getMaxHP ? p.getMaxHP() : (stats.base?.maxHP ?? 30);
    hpText.textContent = `${Math.max(0, Math.floor(stats.currentHP))}/${maxHP}`;
    hpFill.style.width = `${Math.min(100, (stats.currentHP/maxHP)*100)}%`;

    // STR/DEF/AGI (base+bonus)
    const STR = (stats.base?.str||0) + (stats.bonus?.str||0);
    const DEF = (stats.base?.def||0) + (stats.bonus?.def||0);
    const AGI = (stats.base?.agi||0) + (stats.bonus?.agi||0);
    elSTR.textContent = STR; elDEF.textContent = DEF; elAGI.textContent = AGI;

    fSTR.style.width = `${Math.min(100, (STR/50)*100)}%`;
    fDEF.style.width = `${Math.min(100, (DEF/50)*100)}%`;
    fAGI.style.width = `${Math.min(100, (AGI/50)*100)}%`;
  }

  // ===== CARTE (optimisée) =====
  const mapCanvas = menu.querySelector('.gmMapCanvas');
  const ctx = mapCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Empêche tout étirement : CSS = taille pixel du canvas (centrage via CSS)
  mapCanvas.style.width  = mapCanvas.width + 'px';
  mapCanvas.style.height = mapCanvas.height + 'px';
  mapCanvas.style.flex   = '0 0 auto';

  // Offscreen cache pour la base
  let baseCanvas = document.createElement('canvas');
  let baseCtx = baseCanvas.getContext('2d');
  function resizeBaseCanvas(){
    const cw = mapCanvas.width, ch = mapCanvas.height;
    baseCanvas.width  = Math.max(160, Math.floor(cw / 3));
    baseCanvas.height = Math.max(120, Math.floor(ch / 3));
    baseCtx.imageSmoothingEnabled = false;
  }
  resizeBaseCanvas();

  let follow = true;
  let pxPerMeter = 2.0;             // zoom
  let center = { x:0, z:0 };        // centre monde
  const btnFollow = menu.querySelector('.gmFollow');
  const btnZoomIn = menu.querySelector('.gmZoomIn');
  const btnZoomOut = menu.querySelector('.gmZoomOut');

  btnFollow.addEventListener('click', ()=>{ 
    follow = !follow; 
    btnFollow.textContent = 'Suivre: ' + (follow?'ON':'OFF'); 
    if (follow) { markBaseDirty(); }
  });
  btnZoomIn.addEventListener('click', ()=> { pxPerMeter *= 1.2; markBaseDirty(true); });
  btnZoomOut.addEventListener('click', ()=> { pxPerMeter /= 1.2; markBaseDirty(true); });

  function worldToCanvas(wx, wz, wCenter, scale){
    const cw = mapCanvas.width, ch = mapCanvas.height;
    const x = cw/2 + (wx - wCenter.x) * scale;
    const y = ch/2 + (wz - wCenter.z) * scale;
    return { x, y };
  }

  // Pan / Zoom (souris)
  let dragging = false, last = null;
  mapCanvas.addEventListener('mousedown', (e)=>{ dragging=true; last={x:e.clientX,y:e.clientY}; follow=false; btnFollow.textContent='Suivre: OFF'; });
  window.addEventListener('mousemove', (e)=>{
    if (!dragging) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = {x:e.clientX,y:e.clientY};
    center.x -= dx / pxPerMeter;
    center.z -= dy / pxPerMeter;
    markBaseDirty();
  });
  window.addEventListener('mouseup', ()=> dragging=false);
  mapCanvas.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const old = pxPerMeter;
    pxPerMeter *= (e.deltaY<0 ? 1.1 : 0.9);
    if (pxPerMeter < 0.3) pxPerMeter = 0.3;
    if (pxPerMeter > 12)  pxPerMeter = 12;
    const rect = mapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wx = center.x + (mx - mapCanvas.width/2)/old;
    const wz = center.z + (my - mapCanvas.height/2)/old;
    center.x = wx - (mx - mapCanvas.width/2)/pxPerMeter;
    center.z = wz - (my - mapCanvas.height/2)/pxPerMeter;
    follow = false; btnFollow.textContent='Suivre: OFF';
    markBaseDirty(true);
  }, { passive:false });

  function colorForBiomeName(name){
    const n = (name||'').toLowerCase();
    if (n.includes('ocean') || n.includes('sea')) return [44,109,184];
    if (n.includes('beach') || n.includes('shore')) return [215,189,138];
    if (n.includes('forest')) return [59,125,59];
    if (n.includes('hills')) return [110,139,61];
    if (n.includes('mountain')) return [138,138,138];
    if (n.includes('desert')) return [224,192,110];
    return [74,154,74];
  }

  // === Overlay "zones de niveau" sur la mini-carte ===
  // remplace ta version
function __levelTintForRegion(reg){
  // Safe strict (1–1) ou "Safe" dans le nom => teinte spéciale
  const isSafe = ((reg?.minLevel|0) === 1 && (reg?.maxLevel|0) === 1)
              || (typeof reg?.name === 'string' && reg.name.toLowerCase().includes('safe'));
  if (isSafe) return [120, 200, 255];  // cyan lisible

  const mid = (((reg?.minLevel|0) + (reg?.maxLevel|0)) * 0.5) || 0;
  if (mid <= 5)   return [ 50,190,120];
  if (mid <= 10)  return [220,190, 70];
  if (mid <= 15)  return [240,130, 60];
  if (mid <= 20)  return [220, 70, 70];
  return [180, 80,200];
}

  function __blendRGB(base, tint, a){
    const ia = 1-a;
    return [
      Math.round(base[0]*ia + tint[0]*a),
      Math.round(base[1]*ia + tint[1]*a),
      Math.round(base[2]*ia + tint[2]*a),
    ];
  }

  // ——— Rendu base optimisé ———
  const SAMPLE_STEP = 2;
  const MOVE_THRESHOLD = 70;
  const SCALE_EPS = 0.06;
  const BASE_REPAINT_MAX_MS = 10_000;

  let baseDirty = true;
  let lastBaseCenter = { x: Infinity, z: Infinity };
  let lastScale = pxPerMeter;
  let lastBaseAt = 0;
  let mapRAF = 0;

  function markBaseDirty(force=false){ 
    baseDirty = true; 
    if (force) lastBaseAt = 0; 
  }

  function renderBase(centerX, centerZ, scale){
    const bw = baseCanvas.width, bh = baseCanvas.height;
    const halfWorldX = (mapCanvas.width  / scale) * 0.5;
    const halfWorldZ = (mapCanvas.height / scale) * 0.5;

    const startX = centerX - halfWorldX;
    const startZ = centerZ - halfWorldZ;

    const img = baseCtx.createImageData(bw, bh);
    const data = img.data;

    for (let py = 0; py < bh; py += SAMPLE_STEP){
      const wz = startZ + (py * (mapCanvas.height / bh)) * (1/scale);
      for (let px = 0; px < bw; px += SAMPLE_STEP){
        const wx = startX + (px * (mapCanvas.width  / bw)) * (1/scale);

        let rgb = [74,154,74];
        if (window.BIOME && BIOME.biomeParamsAt){
          const bp = BIOME.biomeParamsAt(wx, wz);
          rgb = colorForBiomeName(bp.name);
          // Overlay de difficulté
          if (window.ZoneDifficulty && ZoneDifficulty.regionAt){
            const reg = ZoneDifficulty.regionAt(wx, wz);
            const tint = __levelTintForRegion(reg);
            rgb = __blendRGB(rgb, tint, 0.28);
          }
        }
        for (let dy = 0; dy < SAMPLE_STEP && (py+dy) < bh; dy++){
          for (let dx = 0; dx < SAMPLE_STEP && (px+dx) < bw; dx++){
            const i = ((py+dy) * bw + (px+dx)) * 4;
            data[i]   = rgb[0];
            data[i+1] = rgb[1];
            data[i+2] = rgb[2];
            data[i+3] = 255;
          }
        }
      }
    }
    baseCtx.putImageData(img, 0, 0);
    lastBaseCenter = { x: centerX, z: centerZ };
    lastScale = scale;
    lastBaseAt = performance.now();
    baseDirty = false;
  }

  function blitBase(){
    ctx.clearRect(0,0,mapCanvas.width,mapCanvas.height);
    ctx.drawImage(baseCanvas, 0, 0, mapCanvas.width, mapCanvas.height);
  }

  function drawLevelLegend(){
    const x = mapCanvas.width - 132, y = 8, w = 124, h = 100;
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,30,0.85)';
    ctx.strokeStyle = 'rgba(51,64,109,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();

    const rows = [
	  { label:'Zone Safe',    col:[ 50,190,120] },
      { label:'2–5',    col:[ 74,154,74] },
      { label:'5–10',   col:[220,190, 70] },
      { label:'10–15',  col:[240,130, 60] },
      { label:'15–20',  col:[220, 70, 70] },
      { label:'20+',    col:[180, 80,200] },
    ];
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    let yy = y + 16;
    for (const r of rows){
      ctx.fillStyle = `rgb(${r.col[0]},${r.col[1]},${r.col[2]})`;
      ctx.fillRect(x+10, yy-6, 16, 12);
      ctx.fillStyle = '#e8e8ea';
      ctx.fillText(r.label, x+32, yy);
      yy += 14;
    }
    ctx.restore();
  }

  function drawPlayerMarker(){
  const p = getPlayer(); if (!p) return;
  const pos = worldToCanvas(p.position.x, p.position.z, center, pxPerMeter);

  // Angle de rotation : 0 = nord (triangle vers le haut)
  // Le yaw caméra représente la direction du regard ; on veut que
  // le triangle pointe "là où on regarde".
  const angle = (typeof window.cameraAngle === 'number') ? -window.cameraAngle : 0;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);

  // Triangle centré, pointe vers le haut dans son repère local
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -6);   // pointe
  ctx.lineTo(-4, 4);   // base gauche
  ctx.lineTo( 4, 4);   // base droite
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Cadre de la mini-carte (non affecté par la rotation)
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  ctx.strokeRect(0.5,0.5,mapCanvas.width-1,mapCanvas.height-1);
}


  function mapLoop(){
    if (!(open && activeTab==='map')) { mapRAF = 0; return; }

    const p = getPlayer();
    if (p){
      if (follow) {
        const dist = Math.hypot(p.position.x - center.x, p.position.z - center.z);
        if (dist > 0.001){ center.x = p.position.x; center.z = p.position.z; }
      }

      const moved = Math.hypot(center.x - lastBaseCenter.x, center.z - lastBaseCenter.z) > MOVE_THRESHOLD;
      const zoomDelta = Math.abs(pxPerMeter - lastScale) / Math.max(1e-6, lastScale) > SCALE_EPS;
      const expired = (performance.now() - lastBaseAt) > BASE_REPAINT_MAX_MS;

      if (baseDirty || moved || zoomDelta || expired){
        renderBase(center.x, center.z, pxPerMeter);
      }
    }

    blitBase();
    if (window.ZoneDifficulty && ZoneDifficulty.regionAt) drawLevelLegend();
    drawPlayerMarker();

    mapRAF = requestAnimationFrame(mapLoop);
  }

  // Adapter le cache lorsque la taille du canvas change (rare)
  const resizeObserver = new ResizeObserver(()=>{
    resizeBaseCanvas();
    markBaseDirty(true);
  });
  resizeObserver.observe(mapCanvas);

  // ===== OUVERTURE / TABS =====
  function selectTab(name){
    activeTab = name;
    tabBtns.forEach(b=> b.classList.toggle('active', b.dataset.tab===name));
    Object.entries(panels).forEach(([k,el])=> el.classList.toggle('active', k===name));
    if (!open) return;
    if (name==='inv') renderInv();
    if (name==='player') waitForPlayer().then(renderPlayer);
    if (name==='map') waitForPlayer().then(()=> { markBaseDirty(true); if (!mapRAF) mapLoop(); });
  }

  function setOpen(v){
    open = !!v;
    menu.classList.toggle('open', open);
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      selectTab(activeTab);
      waitForPlayer().then(()=>{
        renderInv();
        renderPlayer();
        markBaseDirty(true);
        if (activeTab==='map' && !mapRAF) mapLoop();
      }).catch(()=>{ renderInv(); });
    } else {
      if (mapRAF){ cancelAnimationFrame(mapRAF); mapRAF = 0; }
    }
  }

  const tabBtnsArr = Array.from(tabBtns);
  tabBtnsArr.forEach(b=> b.addEventListener('click', ()=> selectTab(b.dataset.tab)));
  menu.querySelector('.gmClose').addEventListener('click', ()=> setOpen(false));
  window.addEventListener('keydown', (e)=>{
    if (e.key==='i' || e.key==='I'){
      const ae = document.activeElement;
      if (e.repeat) return;
      if (ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable)) return;
      if (window.Combat && Combat.isActive && Combat.isActive()) return;
      setOpen(!open);
    }
  });

  // Re-render Joueur quand les events tombent
  window.addEventListener('player:ready', ()=> { if (open) { renderPlayer(); markBaseDirty(true); if (activeTab==='map' && !mapRAF) mapLoop(); }});
  window.addEventListener('player:levelUp', ()=> open && renderPlayer());
  window.addEventListener('player:hpChanged', ()=> open && renderPlayer());

  // MàJ Inventaire en live
  if (window.Inventory){
    Inventory.subscribe(({ type })=>{
      if (!open) return;
      if (type.startsWith('item:') || type==='import' || type==='clear' || type.startsWith('gold:')) {
        renderInv();
      }
    });
  }

  // Onglet par défaut
  selectTab('inv');

  // Appliquer bonus d'équipement au boot si déjà stocké
  waitForPlayer().then(applyEquipmentBonuses);

})();
