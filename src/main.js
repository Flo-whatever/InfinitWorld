// Point d'entrée Vite — remplace la chaîne de <script> CDN de l'ancien index.html.
//
// Les fichiers du jeu (terrain.js, player.js, script.js, ...) sont volontairement
// laissés tels quels : ils communiquent entre eux via des globales `window.*`,
// exactement comme avant.
//
// IMPORTANT : ce premier import doit rester en premier. Un module ES termine
// entièrement l'évaluation de son propre corps avant que l'import suivant ne
// soit évalué — c'est ce qui garantit que window.THREE/dat/perlinNoise3d
// existent avant que les fichiers du jeu ci-dessous ne s'exécutent.
import './lib/globals.js';

// Ordre de chargement identique à l'ancien index.html.
// IMPORTANT: charger les biomes AVANT terrain/physics.
import './biome.fixed.js';

// Modules (ordre important)
import './terrain.js';
import './physics.js';
import './player.js';
import './ThirdPersonControls.js';
import './objects.js';
// === combat ===
import './EncounterHelpers.js';
import './ZoneDifficulty.js';
import './CombatSystem.js';
import './animatCombat.js';
import './inventory.js';
import './game_menu.js';
import './catalog.js';
import './SaveSystem.js';
import './script.js';
