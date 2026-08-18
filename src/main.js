// Point d'entrée Vite — remplace la chaîne de <script> CDN de l'ancien index.html.
//
// Les fichiers du jeu (terrain.js, player.js, script.js, ...) sont volontairement
// laissés tels quels : ils communiquent entre eux via des globales `window.*`,
// exactement comme avant. On se contente ici de fournir les mêmes globales
// (THREE, dat, perlinNoise3d) que fournissaient les <script> CDN, puis d'importer
// les fichiers du jeu dans le même ordre que l'ancien index.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Refractor } from 'three/examples/jsm/objects/Refractor.js';
import { Water as Water2 } from 'three/examples/jsm/objects/Water2.js';
import { GUI } from 'dat.gui';
import './lib/perlin-shim.js';
import perlinNoise3d from 'perlin-noise-3d';

// `import * as THREE from 'three'` renvoie un objet de namespace figé (non
// extensible) : on ne peut pas lui assigner de nouvelles propriétés
// directement. On construit donc un objet simple qui reprend tous les
// exports de THREE, plus les addons, pour reproduire exactement la forme
// de l'ancien global `THREE` fourni par les <script> CDN (qui, eux,
// mutaient un vrai objet global mutable).
window.THREE = { ...THREE, OrbitControls, Reflector, Refractor, Water2 };
window.dat = { GUI };
window.perlinNoise3d = perlinNoise3d;

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
