# InfinitWorld

## Développement

Le projet utilise [Vite](https://vitejs.dev) + des modules ES. Les dépendances
(three.js, dat.gui, perlin-noise-3d) sont installées via npm au lieu d'être
chargées depuis des CDN.

```bash
npm install
npm run dev      # serveur de dev avec rechargement à chaud
npm run build    # build de production dans dist/
npm run preview  # sert le build de production en local
```

Le point d'entrée est `src/main.js`, qui importe les fichiers du jeu
(`src/terrain.js`, `src/player.js`, `src/script.js`, ...) dans le même ordre
que l'ancien `index.html`. Ces fichiers n'ont pas été réécrits : ils
communiquent toujours entre eux via des globales `window.*`.

`biome_map_panzoom.html` est un outil de debug indépendant du bundle
principal — il continue de charger `perlin-noise-3d` depuis un CDN, à part.
