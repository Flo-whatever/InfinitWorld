// catalog.js
window.InventoryCatalog = {
  // Loots ennemis
  wolf_pelt: { name: "Peau de loup", stackMax: 10, rarity: "common" },
  goblin_ear: { name: "Oreille de gobelin", stackMax: 10, rarity: "common" },
  crab_shell: { name: "Carapace de crabe", stackMax: 10, rarity: "common" },
  yeti_fur: { name: "Fourrure de yéti", stackMax: 5, rarity: "rare" },
  boar_tusk: { name: "Défense de sanglier", stackMax: 10, rarity: "common" },
  treant_bark: { name: "Écorce d'esprit des bois", stackMax: 10, rarity: "uncommon" },
  bear_claw: { name: "Griffe d'ours", stackMax: 10, rarity: "uncommon" },
  hawk_feather: { name: "Plume de faucon", stackMax: 10, rarity: "common" },
  golem_shard: { name: "Éclat de golem", stackMax: 5, rarity: "rare" },
  griffon_feather: { name: "Plume de griffon", stackMax: 5, rarity: "rare" },
  gull_feather: { name: "Plume de mouette", stackMax: 10, rarity: "common" },
  sandwyrm_scale: { name: "Écaille de ver des sables", stackMax: 10, rarity: "uncommon" },

  // Potions
  potion_small: { name: "Petite potion de soin", stackMax: 5, rarity: "common", consumable: true, effect: { heal: 10 } },
  potion_medium: { name: "Potion de soin moyenne", stackMax: 3, rarity: "uncommon", consumable: true, effect: { heal: 25 } }
};
