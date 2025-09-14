// catalog.js
window.InventoryCatalog = {
  // Loots ennemis
  wolf_pelt: { name: "Peau de loup", stackMax: 10, rarity: "common" },
  goblin_ear: { name: "Oreille de gobelin", stackMax: 10, rarity: "common" },
  crab_shell: { name: "Carapace de crabe", stackMax: 10, rarity: "common" },
  yeti_fur: { name: "Fourrure de yéti", stackMax: 5, rarity: "rare" },

  // Potions
  potion_small: { name: "Petite potion de soin", stackMax: 5, rarity: "common", consumable: true, effect: { heal: 10 } },
  potion_medium: { name: "Potion de soin moyenne", stackMax: 3, rarity: "uncommon", consumable: true, effect: { heal: 25 } }
};
