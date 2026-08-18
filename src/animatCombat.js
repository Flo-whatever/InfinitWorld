// animatCombat.js — Effets d'attaque pour la scène de combat
//  - Hitstop (gel visuel court)
//  - Camera shake (micro secousse amortie)
//  - Lunge (dash) du héros vers l'ennemi et inversement
//
// API globale : window.AnimatCombat
//   AnimatCombat.attach({ scene, camera, renderer? })
//   AnimatCombat.update(delta)                       -> bool (true si hitstop actif)
//   AnimatCombat.cleanup()
//   AnimatCombat.hitstop(ms=100)                    -> Promise
//   AnimatCombat.shake({ amp=0.2, dur=0.25, freq=35 })
//   AnimatCombat.lunge(mesh, targetMesh, opts?)     -> Promise
//      opts = { dist?:number, forward?:number, back?:number, arc?:number }
//
// Intégration conseillée dans CombatSystem.js :
//   - après création de la camera/scene : AnimatCombat.attach({ scene:combat.scene, camera:combat.camera, renderer })
//   - dans tick(delta): AnimatCombat.update(delta) avant render()
//   - lors d'une attaque : await AnimatCombat.lunge(attacker.mesh, defender.mesh); AnimatCombat.shake(...); await AnimatCombat.hitstop(120);

(function(){
  const AC = {};

  let _scene = null, _camera = null, _renderer = null;
  let _baseCamPos = null;              // position "neutre" de la caméra (copiée chaque frame)
  let _effects = [];                   // effets en cours (shake, lunge, etc.)
  let _freeze = 0;                     // hitstop (secondes)

  // Pour lunge: garantir 1 seul effet par mesh
  const _lungeByMesh = new WeakMap();

  // ─────────── EASING ───────────
  const Easing = {
    // t∈[0,1]
    inOutQuad: t => (t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2),
    outQuad:   t => 1 - (1-t)*(1-t),
    outBack:   (t, s=1.4)=> { const c1 = s; const c3 = c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); },
    inOutSine: t => -(Math.cos(Math.PI*t)-1)/2
  };

  // ─────────── CORE ───────────
  AC.attach = function({ scene, camera, renderer }){
    _scene = scene; _camera = camera; _renderer = renderer || _renderer;
    if (!_camera) throw new Error('[AnimatCombat] camera manquante');
    _baseCamPos = _camera.position.clone();
  };

  AC.cleanup = function(){
    // restaure caméra
    if (_camera && _baseCamPos){ _camera.position.copy(_baseCamPos); }
    _effects.length = 0;
    _freeze = 0;
  };

  AC.update = function(delta){
    if (!_camera) return false;

    // hitstop : on ne fait évoluer aucun effet (mais on peut quand même rendre)
    if (_freeze > 0){
      _freeze = Math.max(0, _freeze - delta);
      // on conserve la position "secouée"/"lungée" actuelle (freeze visuel)
      return true;
    }

    // réinitialise la position caméra au neutre puis applique shakes cumulés
    if (_baseCamPos) _camera.position.copy(_baseCamPos);

    // appliquer les effets en cours
    let camShake = new THREE.Vector3(0,0,0);
    const alive = [];
    for (const fx of _effects){
      const keep = fx.update(delta, { scene:_scene, camera:_camera, renderer:_renderer, camShake });
      if (keep) alive.push(fx);
    }
    _effects = alive;

    // appliquer l'offset cumulé de shake
    if (camShake.lengthSq() > 0){ _camera.position.add(camShake); }

    return false;
  };

  // ─────────── HITSTOP ───────────
  AC.hitstop = function(ms=100){
    const sec = Math.max(0, ms|0) / 1000;
    _freeze = Math.max(_freeze, sec);
    return new Promise(res => setTimeout(res, ms));
  };

  // ─────────── SHAKE ───────────
  // Simple bruit périodique amorti. amp en unités monde (0.1–0.3 marche bien).
  AC.shake = function({ amp=0.2, dur=0.25, freq=35 }={}){
    if (!_camera) return;
    const fx = {
      t: 0, dur: Math.max(0.05, dur), amp: Math.max(0, amp), freq: Math.max(1, freq),
      update(dt, ctx){
        this.t += dt; const k = Math.min(1, this.t / this.dur);
        const fade = 1 - k; // amortissement linéaire
        const w = this.freq * this.t * Math.PI*2;
        // 2 axes pour éviter le mal de mer vertical trop fort
        const x = Math.sin(w*0.9) * this.amp * fade;
        const y = Math.sin(w*1.3 + 1.1) * this.amp * 0.35 * fade;
        const z = Math.cos(w*1.1 + 0.6) * this.amp * 0.6 * fade;
        ctx.camShake.x += x; ctx.camShake.y += y; ctx.camShake.z += z;
        return this.t < this.dur;
      }
    };
    _effects.push(fx);
  };

  // ─────────── LUNGE (dash avant puis retour) ───────────
  // Déplace mesh vers target sur le plan XZ, avec légère arche Y optionnelle.
  AC.lunge = function(mesh, targetMesh, opts={}){
    if (!mesh || !targetMesh) return Promise.resolve();

    // annuler le lunge en cours sur ce mesh
    const prev = _lungeByMesh.get(mesh);
    if (prev && prev.cancel){ prev.cancel(); }

    const origin = mesh.position.clone();
    const target = targetMesh.position.clone();

    // direction et distances
    const dir = new THREE.Vector3().subVectors(target, origin);
    dir.y = 0; const len = Math.max(1e-6, dir.length()); dir.normalize();
    const minSep = 1.2; // laisse un espace pour ne pas "pénétrer" l'autre mesh

    const dist = Math.min(len - minSep, (opts.dist ?? 1.4)); // avance maximale
    const forward = Math.max(0.06, opts.forward ?? 0.18);
    const back    = Math.max(0.06, opts.back    ?? 0.14);
    const arc     = opts.arc ?? 0.25; // élévation max (optionnelle)

    // end position
    const end = origin.clone().addScaledVector(dir, Math.max(0, dist));

    let canceled = false; let done = false; let phase = 'forward'; let t = 0;

    const fx = {
      update(dt){
        if (canceled) return false;
        if (_freeze > 0) return true; // gelé -> ne pas évoluer, garder position courante
        t += dt;
        if (phase === 'forward'){
          const k = Math.min(1, t/forward);
          const e = Easing.outQuad(k);
          mesh.position.lerpVectors(origin, end, e);
          if (arc !== 0){
            const y = origin.y + Math.sin(e*Math.PI) * arc;
            mesh.position.y = y;
          }
          if (k>=1){ phase='back'; t=0; }
          return true;
        } else if (phase === 'back'){
          const k = Math.min(1, t/back);
          const e = Easing.inOutSine(k);
          mesh.position.lerpVectors(end, origin, e);
          if (arc !== 0){
            const y = origin.y + Math.sin((1-e)*Math.PI) * (arc*0.4);
            mesh.position.y = y;
          }
          if (k>=1){ mesh.position.copy(origin); done=true; return false; }
          return true;
        }
        return false;
      },
      cancel(){ canceled = true; try{ mesh.position.copy(origin); }catch{} }
    };

    _effects.push(fx);
    _lungeByMesh.set(mesh, fx);

    return new Promise(resolve=>{
      const check = () => {
        if (done || canceled) return resolve();
        // tant que l'effet est dans la liste, on attend
        if (_effects.includes(fx)) requestAnimationFrame(check); else resolve();
      };
      check();
    });
  };

  // ─────────── FLASH (teinte brève du/des matériau(x) à l'impact) ───────────
  // Fonctionne aussi bien sur un simple Mesh (sphère/cylindre placeholder)
  // que sur un modèle chargé (Group avec plusieurs sous-meshes/matériaux) —
  // on parcourt la hiérarchie et on collecte tous les matériaux colorables.
  AC.flash = function(mesh, { color = 0xff3333, duration = 0.18 } = {}){
    if (!mesh) return;
    // .traverse() existe sur tout Object3D et visite l'objet lui-même en
    // premier, donc ça marche identiquement pour un simple Mesh ou un Group.
    const mats = new Set();
    mesh.traverse(o => {
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m.color) mats.add(m); });
    });
    if (mats.size === 0) return;

    const originals = new Map();
    mats.forEach(m => originals.set(m, m.color.clone()));
    const flashColor = new THREE.Color(color);
    const fx = {
      t: 0, dur: Math.max(0.05, duration),
      update(dt){
        this.t += dt;
        const k = Math.min(1, this.t / this.dur);
        mats.forEach(m => m.color.copy(flashColor).lerp(originals.get(m), k));
        if (k >= 1){ mats.forEach(m => m.color.copy(originals.get(m))); return false; }
        return true;
      }
    };
    _effects.push(fx);
  };

  // expose
  window.AnimatCombat = AC;
})();
