
/*
  inventory.js — Inventaire côté client (localStorage)
  ----------------------------------------------------
  - Données par domaine (mêmes règles que localStorage) : persistantes tant que l’utilisateur ne nettoie pas ses données.
  - Génère un playerId anonyme (UUID) stocké localement.
  - API simple :
      Inventory.init(options?)
      Inventory.getPlayerId()
      Inventory.get()                 -> { gold, items:[{id, qty, meta?}], version }
      Inventory.save()
      Inventory.clear()               -> reset l’inventaire (garde playerId)
      Inventory.addGold(n) / setGold(n)
      Inventory.addItem(id, qty=1, meta?)        -> stack si même id + meta JSON identique
      Inventory.removeItem(id, qty=1, meta?)     -> retire en respectant la meta si fournie
      Inventory.hasItem(id, qty=1, meta?)        -> bool
      Inventory.count(id, meta?)                  -> total qty pour id(+meta)
      Inventory.items()                           -> copie shallow du tableau d’items
      Inventory.export()                          -> string JSON (pour sauvegarde externe)
      Inventory.import(jsonString, { merge })     -> remplace ou fusionne
      Inventory.subscribe(fn) / unsubscribe(fn)   -> écoute les changements ({type, payload, state})
      Inventory.setCatalog(catalog)               -> optionnel : { id:{name, stackMax, rarity, ...}, ... }

  - Autosave :
      * onChange (toutes opérations) sauvent après un petit debounce,
      * à 'visibilitychange' & 'beforeunload'.

  - Versionnage :
      * state.version permet de migrer si tu changes le schéma plus tard.

  Intégration basique :
      // index.html (ordre)
      <script src="./inventory.js"></script>
      <script src="./EncounterHelpers.js"></script>
      <script src="./CombatSystem.js"></script>
      <script src="./script.js"></script>

      // exemple : donner un loot après combat
      // if (result === 'win') { Inventory.addItem('wolf_pelt', 1); Inventory.addGold(5); }
*/

(function(){
  const DEFAULT_STORAGE_KEY = 'rpg.inventory.v1';
  const PLAYER_ID_KEY = 'rpg.playerId';
  const DEFAULT_VERSION = 1;

  const isObj = (v)=> v && typeof v === 'object' && !Array.isArray(v);
  const deepFreeze = (o)=> o && typeof o === 'object' ? Object.freeze(o) : o;

  // micro debounce
  function debounce(fn, ms){
    let t=null;
    return (...args)=>{
      if (t) clearTimeout(t);
      t = setTimeout(()=>{ t=null; fn(...args); }, ms);
    };
  }

  // stable stringify pour comparer meta JSON
  function stableStringify(o){
    if (o == null) return 'null';
    if (Array.isArray(o)) return '[' + o.map(stableStringify).join(',') + ']';
    if (typeof o === 'object'){
      const keys = Object.keys(o).sort();
      return '{' + keys.map(k => JSON.stringify(k)+':'+stableStringify(o[k])).join(',') + '}';
    }
    return JSON.stringify(o);
  }

  // génération UUID (fallback simple si crypto indispo)
  function makeUUID(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r = Math.random()*16|0, v = c==='x'? r : (r&0x3|0x8);
      return v.toString(16);
    });
    return s;
  }

  // événement interne
  const listeners = new Set();
  function emit(type, payload){
    const snapshot = Inventory.get(); // état courant
    listeners.forEach(fn=>{
      try { fn({ type, payload, state: snapshot }); } catch(e){ console.warn('Inventory listener error', e); }
    });
  }

  // État en mémoire (synchro avec localStorage)
  let _opts = {
    storageKey: DEFAULT_STORAGE_KEY,
    autosave: true,
    saveDebounceMs: 200,
  };

  let _catalog = {}; // optionnel : description des items {id:{stackMax,...}}
  let _state = {
    version: DEFAULT_VERSION,
    gold: 0,
    items: [] // { id, qty, meta? }
  };

  // Debounced saver
  const _saveNow = ()=> {
    try {
      localStorage.setItem(_opts.storageKey, JSON.stringify(_state));
    } catch(e){
      console.warn('[Inventory] save failed:', e);
    }
  };
  const _saveDebounced = debounce(_saveNow, _opts.saveDebounceMs);

  function _ensurePlayerId(){
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id){
      id = makeUUID();
      try { localStorage.setItem(PLAYER_ID_KEY, id); } catch(e) { console.warn('[Inventory] cannot persist playerId', e); }
    }
    return id;
  }

  function _load(){
    try {
      const raw = localStorage.getItem(_opts.storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!isObj(parsed)) return false;

      // migrations éventuelles
      if (parsed.version !== DEFAULT_VERSION){
        // place pour des migrations futures
        parsed.version = DEFAULT_VERSION;
      }

      _state = {
        version: DEFAULT_VERSION,
        gold: Number(parsed.gold) || 0,
        items: Array.isArray(parsed.items) ? parsed.items.filter(v => v && typeof v.id === 'string' && Number(v.qty) > 0).map(v => ({
          id: v.id,
          qty: Math.max(1, Math.floor(Number(v.qty)||0)),
          meta: v.meta && isObj(v.meta) ? v.meta : undefined
        })) : []
      };
      return true;
    } catch(e){
      console.warn('[Inventory] load failed, resetting. Error:', e);
      return false;
    }
  }

  function _saveIfNeeded(){
    if (_opts.autosave) _saveDebounced();
  }

  function _stackMaxFor(id){
    const def = _catalog && _catalog[id];
    const sm = def && Number(def.stackMax);
    return (sm && sm>0) ? Math.floor(sm) : 999999; // par défaut très haut (quasi illimité)
  }

  function _sameMeta(a,b){
    if (!a && !b) return true;
    if (!!a !== !!b) return false;
    return stableStringify(a) === stableStringify(b);
  }

  // public API
  const Inventory = {
    init(options={}){
      _opts = Object.assign({}, _opts, options||{});
      _ensurePlayerId();
      const ok = _load();
      if (!ok) _saveNow();

      // Autosave aux événements navigateur
      document.addEventListener('visibilitychange', ()=>{
        if (document.visibilityState === 'hidden') _saveNow();
      });
      window.addEventListener('beforeunload', _saveNow);

      emit('init', null);
      return Inventory.get();
    },

    setCatalog(catalog){
      if (catalog && typeof catalog === 'object'){
        _catalog = catalog;
        emit('catalog:update', { catalog });
      }
    },

    getPlayerId(){
      return localStorage.getItem(PLAYER_ID_KEY) || _ensurePlayerId();
    },

    get(){
      // Retourne une copie profonde minimale (items copiés shallow pour perf)
      return {
        version: _state.version,
        gold: _state.gold,
        items: _state.items.map(it => ({ id: it.id, qty: it.qty, meta: it.meta ? { ...it.meta } : undefined }))
      };
    },

    items(){
      return _state.items.map(it => ({ id: it.id, qty: it.qty, meta: it.meta ? { ...it.meta } : undefined }));
    },

    save(){
      _saveNow();
    },

    clear(){
      _state.gold = 0;
      _state.items = [];
      _saveIfNeeded();
      emit('clear', null);
    },

    addGold(n){
      const v = Math.floor(Number(n)||0);
      if (!v) return;
      _state.gold = Math.max(0, (_state.gold|0) + v);
      _saveIfNeeded();
      emit('gold:add', { delta: v, gold: _state.gold });
    },

    setGold(n){
      const v = Math.max(0, Math.floor(Number(n)||0));
      _state.gold = v;
      _saveIfNeeded();
      emit('gold:set', { gold: v });
    },

    // Ajoute qty pour un id (+meta optionnelle). Stack au maximum selon catalog.stackMax.
    addItem(id, qty=1, meta){
      if (typeof id !== 'string' || !id) return 0;
      qty = Math.max(1, Math.floor(Number(qty)||0));
      const stackMax = _stackMaxFor(id);
      const keyMeta = meta && isObj(meta) ? meta : undefined;

      // remplir d'abord les stacks existants compatibles (id + meta identique)
      let remaining = qty;
      for (const it of _state.items){
        if (it.id === id && _sameMeta(it.meta, keyMeta)){
          const space = stackMax - it.qty;
          if (space > 0){
            const add = Math.min(space, remaining);
            it.qty += add;
            remaining -= add;
            if (remaining <= 0) break;
          }
        }
      }
      // si reste → créer de nouveaux stacks
      while (remaining > 0){
        const add = Math.min(stackMax, remaining);
        _state.items.push({ id, qty:add, meta: keyMeta ? { ...keyMeta } : undefined });
        remaining -= add;
      }

      _saveIfNeeded();
      emit('item:add', { id, qty, meta:keyMeta });
      return qty;
    },

    // Retire qty d’un item (si meta fourni, retire sur ce stack; sinon, sur tous les stacks id).
    removeItem(id, qty=1, meta){
      if (typeof id !== 'string' || !id) return 0;
      qty = Math.max(1, Math.floor(Number(qty)||0));
      const keyMeta = meta && isObj(meta) ? meta : undefined;

      let remaining = qty;
      // on parcours de la fin (plus récent d’abord) pour un ressenti "dernier ajouté, premier retiré"
      for (let i=_state.items.length-1; i>=0 && remaining>0; i--){
        const it = _state.items[i];
        if (it.id !== id) continue;
        if (!_sameMeta(it.meta, keyMeta) && keyMeta) continue;

        const take = Math.min(it.qty, remaining);
        it.qty -= take;
        remaining -= take;
        if (it.qty <= 0) _state.items.splice(i,1);
      }

      const removed = qty - remaining;
      if (removed > 0){
        _saveIfNeeded();
        emit('item:remove', { id, qty: removed, meta:keyMeta });
      }
      return removed;
    },

    hasItem(id, qty=1, meta){
      return Inventory.count(id, meta) >= Math.max(1, Math.floor(Number(qty)||0));
    },

    count(id, meta){
      if (typeof id !== 'string' || !id) return 0;
      const keyMeta = meta && isObj(meta) ? meta : undefined;
      let n = 0;
      for (const it of _state.items){
        if (it.id !== id) continue;
        if (keyMeta && !_sameMeta(it.meta, keyMeta)) continue;
        n += it.qty;
      }
      return n;
    },

    // export/import
    export(){
      try {
        return JSON.stringify({ version: _state.version, gold: _state.gold, items: _state.items }, null, 2);
      } catch(e){
        console.warn('[Inventory] export failed', e);
        return '';
      }
    },

    import(jsonString, { merge=false } = {}){
      try {
        const data = JSON.parse(jsonString);
        if (!isObj(data) || !Array.isArray(data.items)) throw new Error('bad payload');

        if (!merge){
          _state.gold = Math.max(0, Number(data.gold)||0);
          _state.items = [];
        } else {
          _state.gold = Math.max(0, (_state.gold|0) + Math.max(0, Number(data.gold)||0));
        }

        // on injecte proprement : respecte le stackMax via addItem
        let totalAdded = 0;
        for (const it of data.items){
          if (!it || typeof it.id !== 'string') continue;
          const q = Math.max(1, Math.floor(Number(it.qty)||0));
          totalAdded += Inventory.addItem(it.id, q, it.meta && isObj(it.meta) ? it.meta : undefined);
        }

        _saveIfNeeded();
        emit('import', { merge, added: totalAdded, gold: _state.gold });
        return true;
      } catch(e){
        console.warn('[Inventory] import failed', e);
        return false;
      }
    },

    // évènements
    subscribe(fn){
      if (typeof fn === 'function') listeners.add(fn);
      return ()=> listeners.delete(fn);
    },
    unsubscribe(fn){ listeners.delete(fn); }
  };

  // expose global
  window.Inventory = Inventory;

  // auto-init par défaut (optionnel) :
  // Si tu préfères init manuel, commente les 3 lignes ci-dessous et appelle Inventory.init() dans script.js.
  Inventory.init();

})();

