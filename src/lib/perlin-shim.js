// La lib `perlin-noise-3d` fait `perlinNoise3d = function(){...}` sans `var`
// devant — une création de globale implicite qui fonctionnait dans les
// <script> classiques (mode non-strict) mais qui lève une ReferenceError
// une fois chargée comme module ES, car les modules sont TOUJOURS en mode
// strict (interdit d'assigner une variable non déclarée).
//
// En pré-déclarant la globale ici, l'assignation de la lib retombe sur une
// liaison existante au lieu d'en créer une nouvelle — plus d'erreur, et le
// comportement de la lib est identique à celui du <script> CDN d'origine.
//
// Doit être importé AVANT `perlin-noise-3d` (voir main.js).
globalThis.perlinNoise3d = undefined;
