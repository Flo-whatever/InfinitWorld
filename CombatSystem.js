/*
  CombatSystem.js — rencontres + scène combat (fade doux) + cooldown + toast XP
  Réécriture complète avec GESTION ROBUSTE du nettoyage du clic extérieur
  du menu "Objet" (consommables) via un système de teardowns.

  + Intégration d'animatCombat.js :
    - Hitstop visuel court
    - Camera shake amorti
    - Lunge (dash) attaquant -> défenseur puis retour

  Points clés:
  - Le menu consommables s'ouvre AU-DESSUS du bouton "Objet", ancré au bouton.
  - Ordre des boutons: Attaquer, Défense, Objet, Fuir.
  - Les écouteurs (click document, resize, etc.) sont enregistrés via des
    fonctions "teardown" et correctement retirés en fin de combat.
*/

window.Combat = (function () {
  // ======= RÉGLAGES =======
  const ENCOUNTER_CHECK_EACH_METERS = 20;
  const ENCOUNTER_BASE_RATE         = 0.3;
  const RUN_SUCCESS_RATE            = 0.50;
  const COOLDOWN_MS                 = 45_000;

  // Tables d'ennemis simplifiées
  const ENCOUNTER_TABLES = {
    Forest:    [{ id:"goblin", name:"Gobelin", hp:20, atk:5, def:3, speed:1.1, xp:12 }],
    Hills:     [{ id:"wolf",   name:"Loup",    hp:18, atk:4, def:2, speed:1.0, xp: 9 }],
    Mountains: [{ id:"yeti",   name:"Yéti",    hp:28, atk:8, def:3, speed:0.7, xp:16 }],
    Beach:     [{ id:"crab",   name:"Crabe",   hp:16, atk:4, def:2, speed:0.9, xp: 8 }],
    default:   [{ id:"slime",  name:"Slime",   hp:12, atk:3, def:1, speed:0.6, xp: 5 }]
  };

  // ======= TRANSITION =======
  const Transition = (() => {
    let overlay = null, styleInjected = false;
    function ensure() {
      if (!styleInjected) {
        const st = document.createElement('style');
        st.textContent = `
          .combatFadeOverlay{position:fixed;inset:0;background:#000;pointer-events:none;opacity:0;transition:opacity 320ms ease;z-index:100000}
          .combatFadeOverlay.show{opacity:1}
        `;
        document.head.appendChild(st); styleInjected = true;
      }
      if (!overlay) { overlay = document.createElement('div'); overlay.className = 'combatFadeOverlay'; document.body.appendChild(overlay); }
    }
    function run(show, dur=320){
      ensure();
      return new Promise(res=>{
        let done=false;
        const end=()=>{ if(!done){done=true; overlay.removeEventListener('transitionend', end); res();}};
        overlay.addEventListener('transitionend', end);
        setTimeout(end, dur+60);
        requestAnimationFrame(()=> overlay.classList.toggle('show', show));
      });
    }
    return { fadeOut:(d)=>run(true,d), fadeIn:(d)=>run(false,d) };
  })();

  // ======= TOAST =======
  const Toast = (() => {
    let container, cssInjected=false;
    function ensure() {
      if (!cssInjected) {
        const style = document.createElement('style');
        style.textContent = `
          .combatToastContainer{position:fixed;left:50%;bottom:12%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:100001;pointer-events:none;}
          .combatToast{min-width:120px;max-width:60vw;padding:10px 14px;border-radius:12px;background:rgba(20,30,70,.9);border:1px solid rgba(70,100,200,.35);color:#fff;font:14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;opacity:0;transform:translateY(10px) scale(.98);transition:opacity 180ms ease, transform 220ms ease;text-align:center;box-shadow:0 6px 26px rgba(0,0,0,.35);}
          .combatToast.show{opacity:1;transform:translateY(0) scale(1);}
          .combatToast.hide{opacity:0;transform:translateY(-8px) scale(.98);transition:opacity 200ms ease, transform 200ms ease;}
        `;
        document.head.appendChild(style); cssInjected = true;
      }
      if (!container) { container = document.createElement('div'); container.className = 'combatToastContainer'; document.body.appendChild(container); }
    }
    function show(msg, { duration=1800 } = {}) {
      ensure();
      const el = document.createElement('div');
      el.className = 'combatToast';
      el.textContent = msg;
      container.appendChild(el);
      requestAnimationFrame(()=> el.classList.add('show'));
      setTimeout(()=>{ el.classList.add('hide'); el.addEventListener('transitionend', ()=> el.remove(), { once:true }); }, duration);
    }
    return { show };
  })();

  // ======= ÉTAT =======
  let getRenderer=null, buildWorld=null, destroyWorld=null, getPlayerRef=null, onMusicSwap=null;
  let metersSinceCheck = 0;
  let lastPlayerPos = null;
  let savedCameraAngle=null, savedCameraPitch=null;
  let active = false;
  let cooldownUntil = 0;

  // Liste de fonctions de nettoyage à exécuter lors du teardown combat
  let teardowns = [];

  let combat = {
    scene:null, camera:null, ui:null,
    player:null, enemy:null,
    turn:'player', over:false, result:null,
    _enemyTimer:null
  };

  // ======= UTILS =======
  const rand = Math.random;
  const clone = o => JSON.parse(JSON.stringify(o));
  const now = () => Date.now();
  const currentBiomeName = () => window.currentBiome || 'default';
  const pickEncounter = () => clone((ENCOUNTER_TABLES[currentBiomeName()] || ENCOUNTER_TABLES.default)[0]);

  function computeDamage(atk, def){
    const base = Math.max(1, atk - Math.floor(def/2));
    const variance = 0.8 + Math.random() * 0.4;
    return Math.max(1, Math.floor(base * variance));
  }
  // ======= XP dynamique (type + niveau) =======
// Utilise la valeur de base par type (enemy.xp) puis +15% par niveau au-dessus de 1.
// Exemple : gobelin (base 12) niv 7 -> 12 * (1 + 0.15*(7-1)) = ~23 XP.
	function xpForVictory(enemy){
  const L = Math.max(1, enemy?.level|0);
  const base = Math.max(1, enemy?.xp|0);     // déjà plus faible pour un crabe, plus forte pour un yéti
  const factor = 1 + 0.8 * (L - 1);         // ← pente (ajuste à ton goût : 0.10 = plus doux, 0.20 = plus rapide)
  return Math.max(base, Math.round(base * factor));
}

  // ======= Potions / consommables =======
  function getCatalog(){
    return (typeof window.InventoryCatalog === 'object' && window.InventoryCatalog) ? window.InventoryCatalog : null;
  }
  function isConsumableItem(it, catalog){
    if (!it || !it.id) return false;
    if (catalog && catalog[it.id] && catalog[it.id].consumable) return true;
    return it.id.startsWith('potion_'); // fallback
  }
  function healAmountFor(id, catalog){
    if (catalog && catalog[id] && catalog[id].effect && Number(catalog[id].effect.heal)) return Math.floor(catalog[id].effect.heal);
    if (id === 'potion_small')  return 10;
    if (id === 'potion_medium') return 25;
    return 0;
  }
  function listConsumablesGrouped(){
    const inv = (window.Inventory && Inventory.items && Inventory.items()) || [];
    const catalog = getCatalog();
    const map = new Map(); // id -> { id, name, heal, qty, metas: [meta...] }
    for (const it of inv){
      if (!isConsumableItem(it, catalog)) continue;
      const entry = map.get(it.id) || {
        id: it.id,
        name: (catalog && catalog[it.id]?.name) || it.id,
        heal: healAmountFor(it.id, catalog),
        qty: 0,
        metas: []
      };
      entry.qty += it.qty|0;
      if (it.meta){
        for (let i=0;i<it.qty;i++) entry.metas.push(it.meta);
      }
      map.set(it.id, entry);
    }
    return Array.from(map.values()).sort((a,b)=> (b.heal - a.heal) || a.name.localeCompare(b.name));
  }

  // ======= API =======
  function init(api){
    getRenderer  = api.getRenderer;
    buildWorld   = api.buildWorld;
    destroyWorld = api.destroyWorld;
    getPlayerRef = api.getPlayerRef;
    onMusicSwap  = api.onMusicSwap || function(){};
  }
  function isActive(){ return active; }

  function notifyPlayerStep(d){
    metersSinceCheck += d;
    if (active) return;
    if (now() < cooldownUntil) return;
    if (metersSinceCheck >= ENCOUNTER_CHECK_EACH_METERS){
      metersSinceCheck = 0;
      if (rand() < ENCOUNTER_BASE_RATE){
        startEncounter(pickEncounter());
      }
    }
  }

  // ======= Combat flow =======
  async function startEncounter(enemyTemplate){
    const playerRef = getPlayerRef && getPlayerRef();
    if (!playerRef) return;

    // Reset teardowns for a fresh session
    teardowns = [];

    if (playerRef.setInCombat) playerRef.setInCombat(true);

    lastPlayerPos = playerRef.position.clone ? playerRef.position.clone() : {x:playerRef.position.x,y:playerRef.position.y,z:playerRef.position.z};
    if (typeof window.cameraAngle==='number' && typeof window.cameraPitch==='number'){
      savedCameraAngle = window.cameraAngle; savedCameraPitch = window.cameraPitch;
    }

    if (document.pointerLockElement) document.exitPointerLock();

    await Transition.fadeOut(280);

    try{ destroyWorld && destroyWorld(); }catch(e){ console.warn('destroyWorld error', e); }

    const renderer = getRenderer && getRenderer();
    const THREE = window.THREE;
    combat.scene = new THREE.Scene();
    combat.camera = new THREE.PerspectiveCamera(60, renderer.domElement.width/renderer.domElement.height, 0.1, 1000);
    combat.camera.position.set(0,5,10); combat.camera.lookAt(0,0,0);

    // Resize handler + teardown
    const onResize = () => {
      const dom = renderer.domElement;
      combat.camera.aspect = dom.clientWidth / dom.clientHeight;
      combat.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    teardowns.push(()=> window.removeEventListener('resize', onResize));

    const d = new THREE.DirectionalLight(0xffffff,1);
    d.position.set(5,10,5);
    combat.scene.add(d, new THREE.AmbientLight(0xffffff,0.35));

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(20,20), new THREE.MeshStandardMaterial({ color:0x334433 }));
    plane.rotation.x = -Math.PI/2; combat.scene.add(plane);

    const pMesh = new THREE.Mesh(new THREE.SphereGeometry(1,16,16), new THREE.MeshStandardMaterial({ color:0xff4444 }));
    pMesh.position.set(-3,1,0); combat.scene.add(pMesh);

    const eMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,1.6,16), new THREE.MeshStandardMaterial({ color:0xff6666 }));
    eMesh.position.set(3,0.8,0); combat.scene.add(eMesh);

    const stats = playerRef.userData && playerRef.userData.stats;
    const hpNow = stats ? (stats.currentHP|0) : (playerRef.hp ?? 30);
    const hpMax = playerRef.getMaxHP ? playerRef.getMaxHP() : (playerRef.maxHp ?? 30);
    const atk   = playerRef.getAttack ? playerRef.getAttack() : (playerRef.atk ?? 7);
    const def   = playerRef.getDefense ? playerRef.getDefense() : (playerRef.def ?? 3);
    const spd   = playerRef.getAgility ? Math.max(0.5, playerRef.getAgility()/10) : (playerRef.speed ?? 1);

    combat.player = {
      name: playerRef.name || "Héros",
      maxHp: hpMax,
      hp:    Math.min(hpMax, Math.max(1, hpNow)),
      atk, def, speed: spd,
      mesh:  pMesh,
      xp:    stats ? (stats.xp|0) : (playerRef.xp||0),
      lvl:   stats ? (stats.level|0) : (playerRef.lvl||1)
    };

    const enemy = clone(enemyTemplate);
    enemy.hpMax = enemy.hp;
    enemy.mesh = eMesh;
    combat.enemy = enemy;

    // ===== Intégration ZoneDifficulty : niveau/scaling ennemi =====
    const baseAttack  = enemy.atk;
    const baseDefense = enemy.def;
    const baseHP      = enemy.hp;

    const player = playerRef || window.__PLAYER__;
    const px = player?.position?.x || 0;
    const pz = player?.position?.z || 0;

    const reg = (window.ZoneDifficulty && ZoneDifficulty.regionAt) 
      ? ZoneDifficulty.regionAt(px, pz)
      : { minLevel:1, maxLevel:5, name:"(défaut)" };

    const targetLevel = Math.floor(reg.minLevel + Math.random() * (reg.maxLevel - reg.minLevel + 1));

    const playerLevel = player?.userData?.stats?.level || 1;
    const clampLow  = Math.max(1, playerLevel - 3);
    const clampHigh = Math.max(clampLow, playerLevel + 4);
    const finalLevel = Math.min(clampHigh, Math.max(clampLow, targetLevel));

    enemy.level   = finalLevel;
    enemy.atk     = baseAttack  + Math.floor(finalLevel * 1.2);
    enemy.def     = baseDefense + Math.floor(finalLevel * 1.1);
    enemy.hpMax   = baseHP      + Math.floor(finalLevel * 12);
    enemy.hp      = enemy.hpMax;
    enemy.regionInfo = reg;
    // =====================================

    // —— Intégration AnimatCombat ——
    if (window.AnimatCombat && typeof AnimatCombat.attach==='function'){
      try {
        AnimatCombat.attach({ scene: combat.scene, camera: combat.camera, renderer });
        teardowns.push(()=> AnimatCombat.cleanup && AnimatCombat.cleanup());
      } catch(e) { console.warn('[Combat] AnimatCombat.attach failed', e); }
    }

    makeUI();
    onMusicSwap && onMusicSwap("combat");
    active = true;

    await Transition.fadeIn(280);
  }

async function endEncounter(result){
  combat.over = true; combat.result = result;

  cooldownUntil = now() + COOLDOWN_MS;
  metersSinceCheck = 0;

  await Transition.fadeOut(280);

  // Annule un éventuel timer d'attaque ennemi en attente
  if (combat._enemyTimer){ clearTimeout(combat._enemyTimer); combat._enemyTimer=null; }

  // Nettoyage UI & listeners via teardowns
  try {
    for (const td of teardowns) { try{ td(); }catch{} }
  } finally {
    teardowns = [];
  }

  if (combat.ui && combat.ui.parentNode) combat.ui.parentNode.removeChild(combat.ui);
  disposeScene(combat.scene);

  onMusicSwap && onMusicSwap("world");

  // ── Récup joueur + (NOUVEAU) téléportation origine si défaite
  const playerRef = getPlayerRef && getPlayerRef();
  if (playerRef){
    if (result === 'lose'){
      const y0 = (typeof window.worldHeightAt === 'function' ? window.worldHeightAt(0,0) : 0) + 1;
      if (playerRef.position.set) playerRef.position.set(0, y0, 0);
      else { playerRef.position.x = 0; playerRef.position.y = y0; playerRef.position.z = 0; }
    } else if (lastPlayerPos){
      if (playerRef.position.set) playerRef.position.set(lastPlayerPos.x,lastPlayerPos.y,lastPlayerPos.z);
      else { playerRef.position.x=lastPlayerPos.x; playerRef.position.y=lastPlayerPos.y; playerRef.position.z=lastPlayerPos.z; }
    }
  }

  // (re)construit le monde autour de la position courante (origine si lose, sinon pos initiale)
  try{ buildWorld && buildWorld(); }catch(e){ console.warn('buildWorld error', e); }

  if (typeof savedCameraAngle==='number' && typeof savedCameraPitch==='number'){
    window.cameraAngle = savedCameraAngle; window.cameraPitch = savedCameraPitch;
  }

  let gainedXP = 0;
  if (playerRef){
    const stats = playerRef.userData && playerRef.userData.stats;
    if (result === 'lose'){
      if (stats){
        stats.currentHP = 1;
        window.dispatchEvent(new CustomEvent('player:hpChanged',{detail:{hp:1,maxHP:playerRef.getMaxHP?playerRef.getMaxHP():stats.base.maxHP}}));
      } else {
        playerRef.hp = 1;
      }
    } else {
      const hpAfter = Math.max(1, Math.floor(combat.player.hp));
      if (stats){
        stats.currentHP = Math.min(playerRef.getMaxHP ? playerRef.getMaxHP() : stats.base.maxHP, hpAfter);
        window.dispatchEvent(new CustomEvent('player:hpChanged',{detail:{hp:stats.currentHP,maxHP:playerRef.getMaxHP?playerRef.getMaxHP():stats.base.maxHP}}));
      } else {
        playerRef.hp = hpAfter;
      }
      if (result === 'win') {
        gainedXP = xpForVictory(combat.enemy);
        if (typeof playerRef.gainXP === 'function') playerRef.gainXP(gainedXP);
        else playerRef.xp = (playerRef.xp||0) + gainedXP;

        if (window.Inventory) {
          const lootTable = {
            wolf:   [{ id:"wolf_pelt", qty:1, chance:0.8 }],
            goblin: [{ id:"goblin_ear", qty:1, chance:0.7 }],
            crab:   [{ id:"crab_shell", qty:1, chance:0.7 }],
            yeti:   [{ id:"yeti_fur", qty:1, chance:0.5 }]
          };
          const table = lootTable[combat.enemy.id] || [];
          table.forEach(l => { if (Math.random() < l.chance) Inventory.addItem(l.id, l.qty); });
          Inventory.addGold(Math.floor(Math.random()*5)+1);
        }
      }
    }
    if (playerRef.setInCombat) playerRef.setInCombat(false);
  }

  // (NOUVEAU) sauvegarde après résolution du combat (pos/HP à jour)
  try { if (window.SAVE && typeof SAVE.saveThrottled === 'function') SAVE.saveThrottled(); } catch {}

  combat = { scene:null, camera:null, ui:null, player:null, enemy:null, turn:'player', over:false, result:null, _enemyTimer:null };
  active = false;

  await Transition.fadeIn(280);

  if (gainedXP > 0) {
    Toast.show(`+${gainedXP} XP`, { duration: 1800 });
  }
}


  function disposeScene(scene){
    if (!scene) return;
    scene.traverse(o=>{
      if (o.isMesh){
        o.geometry && o.geometry.dispose?.();
        if (o.material){
          if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose?.());
          else o.material.dispose?.();
        }
      }
    });
  }

  // ======= UI =======
  function makeButton(txt, onClick){
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.margin='0 8px'; b.style.padding='8px 12px';
    b.style.borderRadius='10px'; b.style.border='1px solid #33406d';
    b.style.background='#1a2350'; b.style.color='#e8e8ea';
    b.onclick = onClick; return b;
  }

  function makeUI(){
    const ui = document.createElement('div');
    ui.style.position='fixed'; ui.style.left='0'; ui.style.right='0'; ui.style.bottom='0';
    ui.style.padding='12px 16px';
    ui.style.background='linear-gradient(transparent, rgba(0,0,0,.6))';
    ui.style.color='#fff'; ui.style.fontFamily='system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
    ui.style.zIndex='9999'; ui.style.userSelect='none';

    const title = document.createElement('div');
    title.textContent = `Un ${combat.enemy.name} apparaît !`;
    title.style.fontWeight='700'; title.style.marginBottom='8px'; title.style.textShadow='0 1px 2px #000';
    ui.appendChild(title);

    const bars = document.createElement('div');
    bars.style.display='flex'; bars.style.gap='16px'; bars.style.marginBottom='8px';

    const pBar = document.createElement('div');
    const eBar = document.createElement('div');

    function setBar(el, label, cur, max){
      el.innerHTML=''; const l=document.createElement('div');
      l.textContent = `${label}: ${Math.max(0,Math.floor(cur))}/${max}`;
      l.style.marginBottom='4px';
      const bar=document.createElement('div'); bar.style.height='8px'; bar.style.background='#222'; bar.style.borderRadius='6px';
      const fill=document.createElement('div'); fill.style.height='8px'; fill.style.width = `${Math.max(0, Math.min(1, cur/max))*100}%`;
      fill.style.borderRadius='6px'; fill.style.background='#2ecc71';
      bar.appendChild(fill); el.appendChild(l); el.appendChild(bar);
    }
    function refreshBars(){
      setBar(pBar, combat.player.name, combat.player.hp, combat.player.maxHp);
      setBar(eBar, `${combat.enemy.name} (niv ${combat.enemy.level||1})`, combat.enemy.hp, combat.enemy.hpMax);
    }
    refreshBars(); bars.appendChild(pBar); bars.appendChild(eBar); ui.appendChild(bars);

    // Conteneur des actions — position relative pour ancrer le menu
    const actions=document.createElement('div');
    actions.style.display='flex';
    actions.style.alignItems='center';
    actions.style.gap='8px';
    actions.style.position='relative';   // ancre pour le menu des objets
    ui.appendChild(actions);

    // --- boutons dans l'ordre demandé : Attaquer, Défense, Objet, Fuir ---
    const attackBtn = makeButton('Attaquer', async ()=>{
      if (combat.turn!=='player' || combat.over) return;
      closeConsumableMenu();

      // Animation d'attaque (héros -> ennemi)
      if (window.AnimatCombat){
        try{
          await AnimatCombat.lunge(combat.player.mesh, combat.enemy.mesh, { dist: 1.4, forward:0.18, back:0.14, arc:0.22 });
          AnimatCombat.shake({ amp:0.18, dur:0.25, freq:35 });
          await AnimatCombat.hitstop(120);
        }catch(e){ console.warn('[Combat] Anim lunge/hitstop error', e); }
      }

      const dmg = computeDamage(combat.player.atk, combat.enemy.def);
      combat.enemy.hp -= dmg; title.textContent = `${combat.player.name} inflige ${dmg} à ${combat.enemy.name}`;
      refreshBars();
      if (combat.enemy.hp <= 0){ title.textContent = `${combat.enemy.name} est vaincu !`; endEncounter('win'); return; }
      combat.turn='enemy';
    });
    actions.appendChild(attackBtn);

    const guardBtn = makeButton('Défense', ()=>{
      if (combat.turn!=='player' || combat.over) return;
      closeConsumableMenu();
      combat.player._guard = true; title.textContent = `${combat.player.name} se met en garde.`; combat.turn='enemy';
    });
    actions.appendChild(guardBtn);

    // === Objet (menu ancré au bouton) ===
    let consumableMenu = null;
    let itemBtn = null;

    function closeConsumableMenu(){
      if (consumableMenu && consumableMenu.parentNode){ consumableMenu.parentNode.removeChild(consumableMenu); consumableMenu = null; }
    }

    function openConsumableMenu(){
      closeConsumableMenu();
      const list = listConsumablesGrouped();
      if (!list.length){
        title.textContent = "Aucun consommable disponible.";
        return;
      }

      // créer menu
      consumableMenu = document.createElement('div');
      consumableMenu.style.position='absolute';
      consumableMenu.style.minWidth='220px';
      consumableMenu.style.maxWidth='60vw';
      consumableMenu.style.maxHeight='40vh';
      consumableMenu.style.overflow='auto';
      consumableMenu.style.padding='10px';
      consumableMenu.style.borderRadius='12px';
      consumableMenu.style.background='rgba(15,22,55,.95)';
      consumableMenu.style.border='1px solid rgba(90,120,220,.4)';
      consumableMenu.style.boxShadow='0 12px 28px rgba(0,0,0,.45)';
      consumableMenu.style.zIndex='10000';

      // positionner AU-DESSUS du bouton "Objet"
      const btnLeft = itemBtn.offsetLeft;
      const btnWidth = itemBtn.offsetWidth;
      const menuBottomOffset = actions.clientHeight + 8; // 8px au-dessus de la rangée
      const menuWidthGuess = 240;
      const left = Math.max(0, btnLeft + (btnWidth/2) - (menuWidthGuess/2));
      consumableMenu.style.left = `${left}px`;
      consumableMenu.style.bottom = `${menuBottomOffset}px`;

      const head = document.createElement('div');
      head.textContent = 'Choisir un objet';
      head.style.fontWeight='700';
      head.style.margin='0 0 8px 2px';
      consumableMenu.appendChild(head);

      for (const it of list){
        const row = document.createElement('button');
        row.textContent = `${it.name}  (+${it.heal} PV)  ×${it.qty}`;
        row.style.display='block';
        row.style.width='100%';
        row.style.textAlign='left';
        row.style.margin='6px 0';
        row.style.padding='8px 10px';
        row.style.borderRadius='10px';
        row.style.border='1px solid #33406d';
        row.style.background='#1a2350';
        row.style.color='#e8e8ea';
        row.onmouseenter = ()=> row.style.background='#202d6f';
        row.onmouseleave = ()=> row.style.background='#1a2350';
        row.onclick = ()=>{
          const heal = it.heal;
          if (heal <= 0) { title.textContent = "Cet objet ne peut pas être utilisé."; return; }

          const before = combat.player.hp;
          combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + heal);

          if (window.Inventory && Inventory.removeItem){
            if (it.metas && it.metas.length){
              const meta = it.metas.pop();
              Inventory.removeItem(it.id, 1, meta);
            } else {
              Inventory.removeItem(it.id, 1);
            }
          }

          const delta = Math.max(0, Math.floor(combat.player.hp - before));
          title.textContent = `${combat.player.name} boit ${it.name} (+${delta} PV)`;
          refreshBars();
          closeConsumableMenu();
          combat.turn='enemy';
        };
        consumableMenu.appendChild(row);
      }

      const cancel = document.createElement('button');
      cancel.textContent = 'Annuler';
      cancel.style.marginTop='8px';
      cancel.style.padding='8px 10px';
      cancel.style.borderRadius='10px';
      cancel.style.border='1px solid #33406d';
      cancel.style.background='#0f1637';
      cancel.style.color='#e8e8ea';
      cancel.onclick = ()=> closeConsumableMenu();
      consumableMenu.appendChild(cancel);

      actions.appendChild(consumableMenu);
    }

    itemBtn = makeButton('Objet', ()=>{
      if (combat.turn!=='player' || combat.over) return;
      if (consumableMenu) closeConsumableMenu();
      else openConsumableMenu();
    });
    actions.appendChild(itemBtn);

    const runBtn = makeButton('Fuir', ()=>{
      if (combat.turn!=='player' || combat.over) return;
      closeConsumableMenu();
      if (Math.random() < RUN_SUCCESS_RATE){ title.textContent = `${combat.player.name} s'échappe !`; endEncounter('run'); }
      else { title.textContent = `${combat.player.name} échoue à s'enfuir...`; combat.turn='enemy'; }
    });
    actions.appendChild(runBtn);

    document.body.appendChild(ui);
    combat.ui = ui;

    combat._refreshBars = refreshBars;
    combat._setTitle = t => title.textContent = t;

    // —— Gestion ROBUSTE du clic extérieur ——
    const onDocClick = (ev)=>{
      if (!consumableMenu) return;
      const within = consumableMenu.contains(ev.target) || itemBtn.contains(ev.target);
      if (!within) closeConsumableMenu();
    };
    document.addEventListener('click', onDocClick);
    teardowns.push(()=> document.removeEventListener('click', onDocClick));
  }

  async function enemyTurn(){
    if (combat.over) return;

    // Animation d'attaque (ennemi -> héros)
    if (window.AnimatCombat){
      try{
        await AnimatCombat.lunge(combat.enemy.mesh, combat.player.mesh, { dist: 1.2, forward:0.16, back:0.12, arc:0.12 });
        AnimatCombat.shake({ amp:0.15, dur:0.22, freq:32 });
        await AnimatCombat.hitstop(100);
      }catch(e){ console.warn('[Combat] Enemy anim error', e); }
    }

    const dmg = computeDamage(combat.enemy.atk, combat.player._guard ? combat.player.def+2 : combat.player.def);
    combat.player.hp -= dmg;
    if (combat.player._guard) delete combat.player._guard;

    combat._setTitle && combat._setTitle(`${combat.enemy.name} attaque et inflige ${dmg}.`);
    combat._refreshBars && combat._refreshBars();

    if (combat.player.hp <= 0){ combat._setTitle && combat._setTitle(`${combat.player.name} est K.O.`); endEncounter('lose'); return; }
    combat.turn='player';
  }

  function tick(delta){
    if (!active) return false;
    const renderer = getRenderer && getRenderer(); if (!renderer) return true;

    // Met à jour les animations de combat (hitstop/shake/lunge). Renvoie true si "gel" actif.
    if (window.AnimatCombat && AnimatCombat.update){ AnimatCombat.update(delta); }

    renderer.render(combat.scene, combat.camera);

    if (combat.turn==='enemy' && !combat._enemyTimer){
  combat._enemyTimer = setTimeout(async ()=>{
    await enemyTurn();           // attendre la fin
    combat._enemyTimer = null;   // libérer le verrou APRÈS
  }, 500);
}

    return true;
  }

  return { init, isActive, notifyPlayerStep, tick };
})();
