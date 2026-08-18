// Écran d'accueil — Nouvelle partie / Reprendre / Options (touches).
//
// window.showTitleScreen() renvoie une Promise résolue en
// { mode: 'new' | 'continue' } une fois que le joueur a choisi, et retire
// l'écran du DOM. script.js attend cette promesse (top-level await) avant
// de lancer quoi que ce soit — scène, chunks, joueur, boucle de rendu.
//
// Les touches sont stockées dans window.__keyBindings et relues en direct
// par ThirdPersonControls.js à chaque keydown/keyup (pas figées au
// chargement), donc les modifier ici prend effet immédiatement.
(function () {
  const SAVE_KEY = 'hj_save_v1';
  const BINDINGS_KEY = 'vp_keybindings_v1';

  const DEFAULT_BINDINGS = {
    forward:  { key: 'z', label: 'Avancer' },
    left:     { key: 'q', label: 'Aller à gauche' },
    right:    { key: 'd', label: 'Aller à droite' },
    backward: { key: 's', label: 'Reculer' },
    sprint:   { key: 'c', label: 'Sprinter' },
    jump:     { key: ' ', label: 'Sauter' },
  };

  function loadBindings() {
    try {
      const saved = JSON.parse(localStorage.getItem(BINDINGS_KEY) || 'null');
      const merged = {};
      for (const action in DEFAULT_BINDINGS) {
        merged[action] = (saved && saved[action]) ? saved[action] : DEFAULT_BINDINGS[action].key;
      }
      return merged;
    } catch {
      const merged = {};
      for (const action in DEFAULT_BINDINGS) merged[action] = DEFAULT_BINDINGS[action].key;
      return merged;
    }
  }

  function saveBindings(bindings) {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
  }

  window.__keyBindings = loadBindings();

  function keyLabel(k) {
    if (k === ' ') return 'Espace';
    return k.length === 1 ? k.toUpperCase() : k;
  }

  window.showTitleScreen = function () {
    return new Promise((resolve) => {
      const hasSave = !!localStorage.getItem(SAVE_KEY);

      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '100000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #1a2340 0%, #05060f 100%)',
        color: '#fff', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      });

      const panel = document.createElement('div');
      Object.assign(panel.style, {
        width: 'min(420px, 90vw)', textAlign: 'center',
        padding: '32px 28px', borderRadius: '18px',
        background: 'rgba(10,14,30,.55)', border: '1px solid rgba(120,140,220,.25)',
        boxShadow: '0 20px 60px rgba(0,0,0,.5)', backdropFilter: 'blur(6px)',
      });
      overlay.appendChild(panel);

      const title = document.createElement('div');
      title.textContent = 'LA TRAME';
      Object.assign(title.style, {
        fontSize: '38px', fontWeight: '800', letterSpacing: '0.08em',
        marginBottom: '6px', textShadow: '0 2px 20px rgba(120,150,255,.6)',
      });
      panel.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.textContent = 'Quelque part, un métier a cessé de tisser…';
      Object.assign(subtitle.style, {
        fontSize: '13px', fontWeight: '300', fontStyle: 'italic', opacity: '0.7',
        marginBottom: '28px',
      });
      panel.appendChild(subtitle);

      const menuView = document.createElement('div');
      panel.appendChild(menuView);

      function makeMenuButton(label, { disabled = false, hint = '' } = {}) {
        const btn = document.createElement('button');
        btn.textContent = label;
        Object.assign(btn.style, {
          display: 'block', width: '100%', margin: '8px 0',
          padding: '12px 16px', borderRadius: '12px',
          border: '1px solid rgba(120,140,220,.35)',
          background: disabled ? 'rgba(40,46,80,.4)' : 'rgba(50,60,120,.6)',
          color: disabled ? '#6b7290' : '#fff',
          fontSize: '15px', fontWeight: '600', cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background .15s, transform .1s',
        });
        if (!disabled) {
          btn.onmouseenter = () => btn.style.background = 'rgba(70,84,160,.75)';
          btn.onmouseleave = () => btn.style.background = 'rgba(50,60,120,.6)';
          btn.onmousedown = () => btn.style.transform = 'scale(0.98)';
          btn.onmouseup = () => btn.style.transform = 'scale(1)';
        }
        if (hint) btn.title = hint;
        return btn;
      }

      const newBtn = makeMenuButton('Nouvelle partie');
      newBtn.onclick = () => {
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        overlay.remove();
        resolve({ mode: 'new' });
      };
      menuView.appendChild(newBtn);

      const continueBtn = makeMenuButton('Reprendre', {
        disabled: !hasSave,
        hint: hasSave ? '' : 'Aucune sauvegarde trouvée',
      });
      if (hasSave) {
        continueBtn.onclick = () => { overlay.remove(); resolve({ mode: 'continue' }); };
      }
      menuView.appendChild(continueBtn);

      const optionsBtn = makeMenuButton('Options');
      optionsBtn.onclick = () => { menuView.style.display = 'none'; optionsView.style.display = 'block'; };
      menuView.appendChild(optionsBtn);

      // ---------- Options (touches) ----------
      const optionsView = document.createElement('div');
      optionsView.style.display = 'none';
      panel.appendChild(optionsView);

      const optsTitle = document.createElement('div');
      optsTitle.textContent = 'Touches';
      Object.assign(optsTitle.style, { fontSize: '16px', fontWeight: '700', margin: '0 0 14px' });
      optionsView.appendChild(optsTitle);

      const rows = {};
      let capturing = null;

      function renderRow(action) {
        const row = rows[action].row;
        const keyEl = rows[action].keyEl;
        keyEl.textContent = capturing === action ? 'Appuyez sur une touche…' : keyLabel(window.__keyBindings[action]);
        keyEl.style.color = capturing === action ? '#ffd166' : '#cdd3ff';
      }

      for (const action in DEFAULT_BINDINGS) {
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', margin: '4px 0', borderRadius: '10px',
          background: 'rgba(255,255,255,.04)', cursor: 'pointer',
        });

        const label = document.createElement('span');
        label.textContent = DEFAULT_BINDINGS[action].label;
        label.style.fontSize = '13px';
        row.appendChild(label);

        const keyEl = document.createElement('span');
        Object.assign(keyEl.style, {
          fontSize: '12px', fontWeight: '700', padding: '3px 10px',
          borderRadius: '6px', background: 'rgba(0,0,0,.35)', minWidth: '70px', textAlign: 'center',
        });
        row.appendChild(keyEl);

        rows[action] = { row, keyEl };
        renderRow(action);

        row.onclick = () => {
          if (capturing) renderRow(capturing); // annule une capture précédente en cours
          capturing = action;
          renderRow(action);
        };

        optionsView.appendChild(row);
      }

      // Capture globale — n'agit que pendant l'écran d'accueil.
      const onKeyCapture = (e) => {
        if (!capturing) return;
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === 'escape') { const c = capturing; capturing = null; renderRow(c); return; }
        window.__keyBindings[capturing] = k;
        saveBindings(window.__keyBindings);
        const c = capturing; capturing = null; renderRow(c);
      };
      window.addEventListener('keydown', onKeyCapture);

      const resetBtn = makeMenuButton('Réinitialiser les touches');
      resetBtn.style.marginTop = '16px';
      resetBtn.onclick = () => {
        for (const action in DEFAULT_BINDINGS) window.__keyBindings[action] = DEFAULT_BINDINGS[action].key;
        saveBindings(window.__keyBindings);
        for (const action in DEFAULT_BINDINGS) renderRow(action);
      };
      optionsView.appendChild(resetBtn);

      const backBtn = makeMenuButton('Retour');
      backBtn.onclick = () => {
        capturing = null;
        optionsView.style.display = 'none';
        menuView.style.display = 'block';
      };
      optionsView.appendChild(backBtn);

      document.body.appendChild(overlay);
    });
  };
})();
