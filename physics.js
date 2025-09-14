function getTerrainHeightAt(x, z){
  return window.worldHeightAt(x, z) || 0;
}
window.getTerrainHeightAt = getTerrainHeightAt;
