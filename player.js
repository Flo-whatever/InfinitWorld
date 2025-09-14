// ===== player.js =====
// Joueur + stats + mini HUD texte + barre de vie flottante (billboard 3D)
// + régénération passive hors combat.
//
// API (inchangée) sur `player` :
//   gainXP(amount), takeDamage(amount), heal(amount),
//   setInCombat(bool), getMaxHP(), getAttack/Defense/Agility(),
//   setRegenEnabled(bool)
// Ajouts :
//   player.dispose()  // nettoie HUD, sprite, timers
//
// Événements (CustomEvent sur window) :
//   'player:levelUp' {level}, 'player:hpChanged' {hp,maxHP}, 'player:ko', 'player:ready'
//
// NOTE : on expose le joueur globalement via window.__PLAYER__ (utilisé par ton menu).

function createPlayer(scene, getTerrainHeightAt) {
  // ---------- Helpers HUD flottant ----------
  function makeHpCanvas(width=96, height=14){
    const cvs = document.createElement('canvas');
    cvs.width = width; cvs.height = height;
    const ctx = cvs.getContext('2d');
    ctx.font = '10px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    return { cvs, ctx, w:width, h:height };
  }
  function drawHpBarToCanvas(ctx, w, h, hp, maxHP, name=''){
    ctx.clearRect(0,0,w,h);
    // fond
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.quadraticCurveTo(w,0,w,r);
    ctx.lineTo(w,h-r); ctx.quadraticCurveTo(w,h,w-r,h);
    ctx.lineTo(r,h); ctx.quadraticCurveTo(0,h,0,h-r);
    ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // barre
    const p = Math.max(0, Math.min(1, hp / Math.max(1,maxHP)));
    const pad = 3, barH = 6;
    const x = pad, y = (h - barH) / 2, barW = w - pad*2;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = p>0.5 ? '#2ecc71' : (p>0.25 ? '#f1c40f' : '#e74c3c');
    ctx.fillRect(x, y, Math.floor(barW * p), barH);

    // texte (à droite) ou nom (à gauche)
    if (name){
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(name, 6, h/2);
    } else {
      const label = `${Math.floor(hp)}/${maxHP}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(label, w - tw - 6, h/2);
    }
  }
  function attachFloatingHP(player, opts={}){
    const {
      name = '',
      yOffset = 2.6,
      pixelWidth = 96,
      pixelHeight = 14,
      baseScale = 0.016, // unités monde par pixel
      minScale = 1.0,
      maxScale = 2.0,
      hideInCombat = true,
    } = opts;

    const { cvs, ctx, w, h } = makeHpCanvas(pixelWidth, pixelHeight);
    const tex = new THREE.CanvasTexture(cvs);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 999;
    sprite.frustumCulled = false;
    sprite.scale.set(w*baseScale, h*baseScale, 1);

    const anchor = new THREE.Object3D();
    anchor.position.set(0, yOffset, 0);
    player.add(anchor);
    anchor.add(sprite);

    // 1ère peinture
    const stats = player.userData?.stats || {};
    const mx = player.getMaxHP ? player.getMaxHP() : (stats.base?.maxHP||30) + (stats.bonus?.maxHP||0);
    const hp0 = (stats.currentHP ?? mx);
    drawHpBarToCanvas(ctx, w, h, hp0, mx, name);
    tex.needsUpdate = true;

    // écouteur PV
    const onHP = (ev)=>{
      const hp = (ev?.detail?.hp ?? stats.currentHP) || 0;
      const maxHP = (ev?.detail?.maxHP ?? (player.getMaxHP ? player.getMaxHP() : mx)) || mx;
      drawHpBarToCanvas(ctx, w, h, hp, maxHP, name);
      tex.needsUpdate = true;
    };
    window.addEventListener('player:hpChanged', onHP);

    // masque en combat si requis
    let _overrideSetInCombat = null;
    if (hideInCombat && typeof player.setInCombat === 'function'){
      const prev = player.setInCombat;
      _overrideSetInCombat = function(v){
        sprite.visible = !v;
        prev.call(player, v);
      };
      player.setInCombat = _overrideSetInCombat;
    }

    // update/scale selon distance caméra
    const tmp = new THREE.Vector3();
    function getCamera(){
      return window.mainCamera || window.camera || scene.userData?.camera || null;
    }
    function update(){
      const cam = getCamera();
      if (!cam) return;
      anchor.getWorldPosition(tmp);
      const dist = cam.position.distanceTo(tmp);
      const k = THREE.MathUtils.clamp(dist * 0.08, minScale, maxScale);
      sprite.scale.set(w*baseScale*k, h*baseScale*k, 1);
    }

    function dispose(){
      window.removeEventListener('player:hpChanged', onHP);
      if (_overrideSetInCombat) player.setInCombat = _overrideSetInCombat; // remet la réf (déjà la bonne)
      if (sprite && sprite.parent) sprite.parent.remove(sprite);
      mat.map?.dispose?.(); mat.dispose?.(); tex.dispose?.();
    }

    return { sprite, anchor, update, dispose };
  }

  // ---------- Création mesh joueur ----------
  const player = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff4444 })
  );
  player.castShadow = true;
  player.receiveShadow = true;
  scene.add(player);

  const startY = getTerrainHeightAt(0, 0);
  player.position.set(0, startY + 1, 0);

  // ---------- Stats ----------
  player.userData = player.userData || {};
  const stats = {
    level: 1,
    xp: 0,
    base:  { str: 5, def: 3, agi: 3, maxHP: 30 },
    bonus: { str: 0, def: 0, agi: 0, maxHP: 0 },
    currentHP: 0
  };

  function xpForNext(level) { return Math.max(20, Math.floor(50 * Math.pow(level, 1.5))); }

  player.getMaxHP = function () {
    const base = stats.base.maxHP + stats.bonus.maxHP;
    const scaling = (stats.level - 1) * 10;
    return base + scaling;
  };
  function getAttack()  { return stats.base.str + stats.bonus.str + Math.floor((stats.level - 1) * 0.5); }
  function getDefense() { return stats.base.def + stats.bonus.def + Math.floor((stats.level - 1) * 0.5); }
  function getAgility() { return stats.base.agi + stats.bonus.agi + Math.floor((stats.level - 1) * 0.3); }

  player.getAttack  = () => getAttack();
  player.getDefense = () => getDefense();
  player.getAgility = () => getAgility();

  stats.currentHP = player.getMaxHP();
  player.userData.stats = stats;

  // ---------- Mini HUD texte ----------
  const hud = document.createElement('div');
  Object.assign(hud.style, {
    position:'fixed', top:'8px', right:'8px', zIndex:'9999',
    padding:'8px 10px', borderRadius:'8px', background:'rgba(0,0,0,0.45)',
    color:'#fff', fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize:'12px', lineHeight:'1.25', whiteSpace:'pre', pointerEvents:'none'
  });
  document.body.appendChild(hud);

  function refreshHUD() {
    const maxHP = player.getMaxHP();
    const need = xpForNext(stats.level);
    hud.textContent =
      `Niv: ${stats.level}  XP: ${stats.xp}/${need}\n` +
      `PV:  ${Math.max(0, Math.floor(stats.currentHP))}/${maxHP}`;
  }
  refreshHUD();

  // ---------- Combat flag ----------
  let _inCombat = false;
  const _origSetInCombat = function (v) {
    _inCombat = !!v;
    hud.style.display = _inCombat ? 'none' : 'block';
  };
  player.setInCombat = _origSetInCombat;

  // ---------- Barre de vie flottante ----------
  const hpHUD = attachFloatingHP(player, {
    name: '',
    yOffset: 2.6,
    hideInCombat: true
  });

  // ---------- Régénération passive ----------
  const REGEN_AMOUNT = 1;
  const REGEN_INTERVAL_MS = 2000;
  let _regenEnabled = true;
  let _regenTimer = null;

  function regenTick() {
    if (!_regenEnabled || _inCombat) return;
    const maxHP = player.getMaxHP();
    if (stats.currentHP <= 0 || stats.currentHP >= maxHP) return;
    const before = stats.currentHP;
    stats.currentHP = Math.min(maxHP, before + REGEN_AMOUNT);
    if (stats.currentHP !== before) {
      window.dispatchEvent(new CustomEvent('player:hpChanged', { detail: { hp: stats.currentHP, maxHP } }));
      refreshHUD();
    }
  }
  function startRegenLoop() { if (!_regenTimer) _regenTimer = setInterval(regenTick, REGEN_INTERVAL_MS); }
  function stopRegenLoop() { if (_regenTimer) { clearInterval(_regenTimer); _regenTimer = null; } }

  startRegenLoop();

  player.setRegenEnabled = function (v) { _regenEnabled = !!v; if (_regenEnabled) startRegenLoop(); else stopRegenLoop(); };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopRegenLoop();
    else if (_regenEnabled) startRegenLoop();
  });

  // ---------- API publique ----------
  player.gainXP = function (amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    stats.xp += Math.floor(amount);
    while (stats.xp >= xpForNext(stats.level)) {
      stats.xp -= xpForNext(stats.level);
      stats.level += 1;
      stats.base.str += 2; stats.base.def += 2; stats.base.agi += 1;
      window.dispatchEvent(new CustomEvent('player:levelUp', { detail: { level: stats.level } }));
    }
    // clamp si maxHP a augmenté
    const maxHP = player.getMaxHP();
    if (stats.currentHP > maxHP) stats.currentHP = maxHP;
    window.dispatchEvent(new CustomEvent('player:hpChanged', { detail: { hp: stats.currentHP, maxHP } }));
    refreshHUD();
  };

  player.takeDamage = function (amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const mitigated = Math.max(1, Math.floor(amount - getDefense() * 0.35));
    stats.currentHP -= mitigated;
    if (stats.currentHP <= 0) {
      stats.currentHP = 0;
      window.dispatchEvent(new CustomEvent('player:hpChanged', { detail: { hp: stats.currentHP, maxHP: player.getMaxHP() } }));
      refreshHUD();
      window.dispatchEvent(new CustomEvent('player:ko'));
      return;
    }
    window.dispatchEvent(new CustomEvent('player:hpChanged', { detail: { hp: stats.currentHP, maxHP: player.getMaxHP() } }));
    refreshHUD();
  };

  player.heal = function (amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    stats.currentHP = Math.min(player.getMaxHP(), stats.currentHP + Math.floor(amount));
    window.dispatchEvent(new CustomEvent('player:hpChanged', { detail: { hp: stats.currentHP, maxHP: player.getMaxHP() } }));
    refreshHUD();
  };

  // ---------- Boucle d'update externe ----------
  // Appelle ceci à chaque frame dans ta boucle principale :
  player.update = function(){
    hpHUD.update(); // autoscale + face caméra (Sprite)
  };

  // ---------- Teardown ----------
  player.dispose = function(){
    stopRegenLoop();
    hpHUD?.dispose?.();
    if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
    // Libère géométrie & matériau si tu recrées le joueur
    player.geometry?.dispose?.();
    if (Array.isArray(player.material)) player.material.forEach(m=>m.dispose?.());
    else player.material?.dispose?.();
    if (player.parent) player.parent.remove(player);
  };

  // ---------- Expose global & ready ----------
  window.__PLAYER__ = player;
  window.dispatchEvent(new Event('player:ready'));

  return player;
}
