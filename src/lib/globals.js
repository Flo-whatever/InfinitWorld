// Fournit les mêmes globales que les <script> CDN de l'ancien index.html
// (THREE, dat, perlinNoise3d), AVANT que les fichiers du jeu ne soient
// importés.
//
// Doit être le TOUT PREMIER import de main.js : un module ES termine
// entièrement l'évaluation de son propre corps (y compris ses propres
// imports) avant que l'import suivant dans le fichier parent ne soit évalué
// — c'est ce qui garantit que ces globales existent avant que les fichiers
// du jeu (qui les utilisent au niveau racine, ex: ThirdPersonControls.js)
// ne s'exécutent.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Refractor } from 'three/examples/jsm/objects/Refractor.js';
import { Water } from 'three/examples/jsm/objects/Water2.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GUI } from 'dat.gui';
import './perlin-shim.js';
import perlinNoise3d from 'perlin-noise-3d';

// `import * as THREE` renvoie un objet de namespace figé (non extensible) :
// impossible de lui assigner de nouvelles propriétés directement. On
// construit donc un objet simple qui reprend tous les exports de THREE,
// plus les addons, pour reproduire la forme de l'ancien global mutable
// fourni par les <script> CDN.
window.THREE = { ...THREE, OrbitControls, Reflector, Refractor, Water, GLTFLoader };
window.dat = { GUI };
window.perlinNoise3d = perlinNoise3d;
