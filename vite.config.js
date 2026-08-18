import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    // script.js utilise le top-level await (écran d'accueil bloquant avant
    // le boot du jeu) — nécessite une cible qui le supporte.
    target: 'esnext',
  },
});
