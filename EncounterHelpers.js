
window.EncounterHelpers = (function(){
  let lastPos = null;

  function trackPlayerDistance(player) {
    if (!player || !player.position) return 0;
    const p = player.position;
    const x = p.x || (p.getX && p.getX()) || 0;
    const y = p.y || 0;
    const z = p.z || 0;

    if (!lastPos) {
      lastPos = {x,y,z}; 
      return 0;
    }
    const dx = x - lastPos.x;
    const dy = y - lastPos.y;
    const dz = z - lastPos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 0.001) lastPos = {x,y,z};
    return d;
  }

  return { trackPlayerDistance };
})();

