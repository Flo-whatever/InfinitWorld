// === ThirdPersonControls.js — pointer lock + fallback drag + collisions objets ===
let cameraAngle = 0;
let cameraPitch = 0;

let isMouseDown = false;      // fallback drag (quand pas lock)
let isPointerLocked = false;  // pointer lock actif ?

const cameraDistance = 10;
const moveSpeed = 0.2;
const jumpStrength = 0.6;
const gravity = 0.03;

let velocityY = 0;
let isJumping = false;

// Limites de pitch
const maxPitch = Math.PI / 3;
const minPitch = -Math.PI / 6;

// Rayon de collision du joueur (sphère rouge de rayon ~1)
const PLAYER_RADIUS = 1.0;

// État clavier
const keys = {
  forward: false,
  left: false,
  right: false,
  backward: false,
  jump: false,
  sprint: false // ⇦ maintenu quand 'C' est enfoncé (comme avant)
};

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "w") keys.forward = true;
  if (k === "a") keys.left = true;
  if (k === "d") keys.right = true;
  if (k === "s") keys.backward = true;
  if (e.code === "Space") keys.jump = true;
  if (k === "c") keys.sprint = true;
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "w") keys.forward = false;
  if (k === "a") keys.left = false;
  if (k === "d") keys.right = false;
  if (k === "s") keys.backward = false;
  if (e.code === "Space") keys.jump = false;
  if (k === "c") keys.sprint = false;
});

// === Initialisation Pointer Lock (à appeler depuis script.js) ===
function initThirdPersonControls(domElement){
  // Clic → demander le lock
  domElement.addEventListener("click", () => {
    if (!isPointerLocked && domElement.requestPointerLock) {
      domElement.requestPointerLock();
    }
  });

  // Suivi de l’état
  document.addEventListener("pointerlockchange", () => {
    isPointerLocked = (document.pointerLockElement === domElement);
  });

  // Rotation souris
  window.addEventListener("mousemove", (e) => {
    if (isPointerLocked) {
      // mode pointer lock → utiliser movementX/Y (delta)
      cameraAngle -= e.movementX * 0.005;
      cameraPitch -= e.movementY * 0.005;
      cameraPitch = Math.max(minPitch, Math.min(maxPitch, cameraPitch));
    } else if (isMouseDown) {
      // fallback drag (comme avant)
      cameraAngle -= e.movementX * 0.005;
      cameraPitch -= e.movementY * 0.005;
      cameraPitch = Math.max(minPitch, Math.min(maxPitch, cameraPitch));
    }
  });

  // Fallback drag (quand pas lock)
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0 && !isPointerLocked) isMouseDown = true;
  });
  window.addEventListener("mouseup", () => { isMouseDown = false; });
}

// === Résolution de collisions joueur ↔ obstacles statiques ===
const _tmpWorldPos = new THREE.Vector3();
function resolveObjectCollisions(nextPos, scene){
  // Parcours léger : on regarde uniquement les objets tagués "isObstacle"
  // On fait 2 passes max pour améliorer la séparation en cas de contacts multiples.
  for (let pass = 0; pass < 2; pass++){
    scene.traverse((o)=>{
      if (!o.isMesh || !o.userData || !o.userData.isObstacle) return;

      // Position monde de l’obstacle (les chunks n’ont pas de transform, mais on reste safe)
      o.getWorldPosition(_tmpWorldPos);
      const ox = _tmpWorldPos.x;
      const oz = _tmpWorldPos.z;
      const orad = o.userData.colliderRadius || 0.6;

      const dx = nextPos.x - ox;
      const dz = nextPos.z - oz;
      const distSq = dx*dx + dz*dz;
      const minDist = PLAYER_RADIUS + orad;

      if (distSq > 0 && distSq < (minDist*minDist)){
        const dist = Math.sqrt(distSq);
        // Vector de poussée (2D XZ)
        const nx = dx / dist;
        const nz = dz / dist;
        const push = (minDist - dist) + 1e-3; // petit epsilon pour éviter la recapture
        nextPos.x += nx * push;
        nextPos.z += nz * push;
      }
    });
  }
}

// === Boucle de contrôle (MAJ: ajout param 'scene' pour collisions) ===
function updateThirdPersonControls(player, camera, getTerrainHeightAt, scene) {
  // Position du joueur actuelle
  const px = player.position.x;
  const py = player.position.y;
  const pz = player.position.z;

  // Caméra orbitale autour du joueur
  const offset = new THREE.Vector3();
  offset.x = Math.sin(cameraAngle) * Math.cos(cameraPitch) * cameraDistance;
  offset.y = Math.sin(cameraPitch) * cameraDistance;
  offset.z = Math.cos(cameraAngle) * Math.cos(cameraPitch) * cameraDistance;

  const camX = px + offset.x;
  const camY = py + 5 + offset.y;
  const camZ = pz + offset.z;

  camera.position.set(camX, camY, camZ);
  camera.lookAt(player.position);
  // Expose l’angle pour la minimap (yaw + pitch si besoin ailleurs)
  window.cameraAngle = cameraAngle;
  window.cameraPitch = cameraPitch;


  // Directions par rapport à la caméra
  const forward = new THREE.Vector3();
  forward.subVectors(player.position, camera.position).normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  // Déplacement désiré (horizontal)
  const currentSpeed = moveSpeed * (keys.sprint ? 2 : 1);
  const desiredMove = new THREE.Vector3();
  if (keys.forward)  desiredMove.add(forward);
  if (keys.backward) desiredMove.sub(forward);
  if (keys.left)     desiredMove.sub(right);
  if (keys.right)    desiredMove.add(right);

  // Appliquer le déplacement (avec collisions)
  if (desiredMove.lengthSq() > 0) {
    desiredMove.normalize().multiplyScalar(currentSpeed);

    const nextPos = new THREE.Vector3(
      player.position.x + desiredMove.x,
      player.position.y,
      player.position.z + desiredMove.z
    );

    // Collisions objets (si la scène est fournie)
    if (scene) resolveObjectCollisions(nextPos, scene);

    player.position.x = nextPos.x;
    player.position.z = nextPos.z;
  }

  // Saut/gravité vs terrain
  const terrainY = getTerrainHeightAt(player.position.x, player.position.z);
  const groundY = terrainY + PLAYER_RADIUS; // le joueur "pose" sur la surface

  if (player.position.y <= groundY) {
    player.position.y = groundY;
    velocityY = 0;
    isJumping = false;
    if (keys.jump) {
      velocityY = jumpStrength;
      isJumping = true;
    }
  } else {
    velocityY -= gravity;
  }
  player.position.y += velocityY;
}

// Expose pour script.js
window.initThirdPersonControls = initThirdPersonControls;
window.updateThirdPersonControls = updateThirdPersonControls;
