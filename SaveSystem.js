// SaveSystem.js — sauvegarde locale (PV, XP, position, équipements, inventaire, stats)
// Stockage: window.localStorage (slot "hj_save_v1") — compatibilité ascendante.

(function(){
  const KEY = 'hj_save_v1';
  let getPlayerRef = null;

  // ————— Utils —————
  const now = () => Date.now();
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  // ————— Snapshot complet —————
  function snapshot(){
    const p = getPlayerRef && getPlayerRef();
    const inv = window.Inventory;
    const data = {
      version: 2,              // ← bump pour indiquer stats persistées
      ts: now(),
      player: {},
      inventory: {}
    };

    if (p){
      const stats = p.userData && p.userData.stats;
      const pos   = p.position || {};
      const maxHP = (p.getMaxHP ? p.getMaxHP() : (stats?.base?.maxHP ?? p.maxHp ?? 30));
      const curHP = clamp((stats?.currentHP ?? p.hp ?? maxHP) | 0, 1, maxHP);

      data.player = {
        name:   p.name || 'Hero',
        level:  (stats?.level ?? p.lvl ?? 1) | 0,
        xp:     (stats?.xp    ?? p.xp  ?? 0) | 0,
        currentHP: curHP,
        maxHP,
        position: { x:+(pos.x||0), y:+(pos.y||0), z:+(pos.z||0) }
      };

      // === NEW: stats base + bonus (STR/DEF/AGI/MaxHP)
      if (stats && (stats.base || stats.bonus)){
        data.player.stats = {
          base: {
            str:   (stats.base?.str   ?? 0)|0,
            def:   (stats.base?.def   ?? 0)|0,
            agi:   (stats.base?.agi   ?? 0)|0,
            maxHP: (stats.base?.maxHP ?? (maxHP|0))|0
          },
          bonus: {
            str:   (stats.bonus?.str   ?? 0)|0,
            def:   (stats.bonus?.def   ?? 0)|0,
            agi:   (stats.bonus?.agi   ?? 0)|0,
            maxHP: (stats.bonus?.maxHP ?? 0)|0
          }
        };
      } else {
        // Fallback “legacy” si pas de userData.stats structuré
        data.player.legacy = {
          atk:  (p.atk   ?? 0)|0,
          def:  (p.def   ?? 0)|0,
          speed:(p.speed ?? 0)|0
        };
      }

      // Équipement si dispo côté player ou inventaire
      if (typeof p.getEquipment === 'function') {
        try { data.player.equipment = p.getEquipment(); } catch {}
      } else if (inv && typeof inv.getEquipment === 'function') {
        try { data.player.equipment = inv.getEquipment(); } catch {}
      }
    }

    if (inv){
      try { data.inventory.items = inv.items ? inv.items() : []; } catch { data.inventory.items = []; }
      try {
        if      (typeof inv.getGold === 'function') data.inventory.gold = inv.getGold();
        else if (typeof inv.gold    === 'number')   data.inventory.gold = inv.gold;
      } catch {}
    }
    return data;
  }

  // ————— Application d’une sauvegarde —————
  function applySave(data, { applyPosition = true } = {}){
    const p = getPlayerRef && getPlayerRef();
    const inv = window.Inventory;

    if (p && data.player){
      const stats = p.userData && p.userData.stats;

      // === NEW: restaurer stats.base/stats.bonus si disponibles
      if (stats && data.player.stats){
        const b  = data.player.stats.base  || {};
        const bn = data.player.stats.bonus || {};
        stats.base  = stats.base  || {};
        stats.bonus = stats.bonus || {};
        if (Number.isFinite(b.str))   stats.base.str   = b.str|0;
        if (Number.isFinite(b.def))   stats.base.def   = b.def|0;
        if (Number.isFinite(b.agi))   stats.base.agi   = b.agi|0;
        if (Number.isFinite(b.maxHP)) stats.base.maxHP = b.maxHP|0;

        if (Number.isFinite(bn.str))   stats.bonus.str   = bn.str|0;
        if (Number.isFinite(bn.def))   stats.bonus.def   = bn.def|0;
        if (Number.isFinite(bn.agi))   stats.bonus.agi   = bn.agi|0;
        if (Number.isFinite(bn.maxHP)) stats.bonus.maxHP = bn.maxHP|0;
      } else if (!stats && data.player.legacy){
        // Fallback legacy
        if (Number.isFinite(data.player.legacy.atk))   p.atk   = data.player.legacy.atk|0;
        if (Number.isFinite(data.player.legacy.def))   p.def   = data.player.legacy.def|0;
        if (Number.isFinite(data.player.legacy.speed)) p.speed = data.player.legacy.speed|0;
      }

      // Niveau / XP / PV
      const maxHPcalc =
        (p.getMaxHP ? p.getMaxHP() :
         (stats?.base?.maxHP ?? data.player.maxHP ?? 30));
      const hp = clamp((data.player.currentHP ?? maxHPcalc)|0, 1, maxHPcalc);

      if (stats){
        if (typeof data.player.level === 'number') stats.level = data.player.level|0;
        if (typeof data.player.xp    === 'number') stats.xp    = data.player.xp|0;
        stats.currentHP = hp;
        window.dispatchEvent(new CustomEvent('player:hpChanged', { detail:{ hp, maxHP: maxHPcalc } }));
        window.dispatchEvent(new CustomEvent('player:xpChanged', { detail:{ xp: stats.xp, level: stats.level } }));
        // Optionnel : notifier stats (si ton UI écoute)
        window.dispatchEvent(new CustomEvent('player:statsChanged', { detail:{ base:stats.base, bonus:stats.bonus } }));
      } else {
        if (typeof data.player.level === 'number') p.lvl = data.player.level|0;
        if (typeof data.player.xp    === 'number') p.xp  = data.player.xp|0;
        p.hp = hp;
      }

      // Position
      if (applyPosition && data.player.position && p.position && p.position.set){
        p.position.set(data.player.position.x, data.player.position.y, data.player.position.z);
      }

      // Équipement
      if (data.player.equipment){
        try {
          if (inv && typeof inv.setEquipment === 'function') inv.setEquipment(data.player.equipment);
          else if (typeof p.setEquipment === 'function') p.setEquipment(data.player.equipment);
        } catch {}
      }
    }

    // Inventaire
    if (inv && data.inventory){
      try {
        // Remplace l’inventaire courant par celui sauvegardé
        if (typeof inv.clear === 'function')       inv.clear();
        else if (typeof inv.removeAll === 'function') inv.removeAll();
        else if (typeof inv.items === 'function' && typeof inv.removeItem === 'function') {
          inv.items().forEach(it => inv.removeItem(it.id, it.qty, it.meta));
        }
        (data.inventory.items||[]).forEach(it => inv.addItem && inv.addItem(it.id, it.qty, it.meta));
      } catch {}

      try {
        if (typeof inv.setGold === 'function') inv.setGold(+data.inventory.gold||0);
        else if (typeof inv.addGold === 'function' && typeof inv.getGold === 'function'){
          const cur = inv.getGold();
          inv.addGold((+data.inventory.gold||0) - cur);
        }
      } catch {}
    }
  }

  // ————— Hooks & autosave —————
  function hookInventory(){
    const inv = window.Inventory;
    if (!inv) return;

    const wrap = (name)=>{
      if (!inv[name]) return;
      const orig = inv[name].bind(inv);
      inv[name] = function(...args){
        const res = orig(...args);
        try{ SAVE.saveThrottled(); }catch{}
        return res;
      };
    };
    // ⚠️ Inclut equip/unequip => maj des bonus → autosave
    ['addItem','removeItem','removeAll','clear','addGold','setGold','equip','unequip','setEquipment'].forEach(wrap);
  }

  function hookPlayer(){
    const p = getPlayerRef && getPlayerRef();
    if (!p) return;

    // gainXP → autosave
    if (typeof p.gainXP === 'function'){
      const orig = p.gainXP.bind(p);
      p.gainXP = function(...args){
        const r = orig(...args);
        try{ SAVE.saveThrottled(); }catch{}
        return r;
      };
    }

    // heal / takeDamage → hpChanged est déjà écouté (voir init)
    // Si tu as des méthodes de modif de stats, ajoute-les ici de la même façon.

    // Écoutes d’événements émis ailleurs
    window.addEventListener('player:statsChanged', ()=> SAVE.saveThrottled());
  }

  // ————— API publique —————
  const SAVE = {
    init(api){
      getPlayerRef = api.getPlayerRef;

      // Hook inventaire dès que dispo
      if (window.Inventory) hookInventory();
      else {
        const t = setInterval(()=>{
          if (window.Inventory){ hookInventory(); clearInterval(t); }
        }, 250);
        setTimeout(()=> clearInterval(t), 10000);
      }

      // Hook events joueur
      hookPlayer();

      // Sauvegarde sur changements PV/XP
      window.addEventListener('player:hpChanged', ()=> SAVE.saveThrottled());
      window.addEventListener('player:xpChanged', ()=> SAVE.saveThrottled());

      // Sauvegarde à la fermeture onglet
      window.addEventListener('beforeunload', ()=>{
        try { SAVE.save(); } catch {}
      });
    },

    save(){
      const data = snapshot();
      localStorage.setItem(KEY, JSON.stringify(data));
      return data;
    },

    saveThrottled: (()=> {
      let lock = false;
      return function(){
        if (lock) return;
        lock = true;
        setTimeout(()=>{ lock=false; try{ SAVE.save(); }catch{} }, 150);
      };
    })(),

    load({ applyPosition = true } = {}){
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      try {
        const data = JSON.parse(raw);
        applySave(data, { applyPosition });
        return true;
      } catch (e){
        console.warn('[SAVE] parse/load error', e);
        return false;
      }
    },

    erase(){
      localStorage.removeItem(KEY);
    },

    // debug helpers
    snapshot
  };

  window.SAVE = SAVE;
})();
