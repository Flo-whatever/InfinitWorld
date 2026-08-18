// ===== terrain.js =====
// Classement des triangles par altitude (sand/grass/dirt/rock) sans shader custom.
// Utilise worldHeightAt(x,z) & localWaterLevelAt(x,z) fournis par biome.js.
// Le sable est aussi présent sous l’eau, avec gradient (plus sombre en profondeur).

function buildGeometryFromTriangles(tris, uvs){
  const vertCount = tris.length / 3;
  const positions = new Float32Array(tris);
  const uv = new Float32Array(uvs);
  const indices = new Uint32Array(vertCount);
  for (let i=0; i<vertCount; i++) indices[i] = i;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv',       new THREE.BufferAttribute(uv, 2));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  // NOTE: computeVertexNormals() inutile avec flatShading:true
  return geom;
}

function generateTerrainChunk(cx, cz){
  const { chunkSize: size, chunkSegments: segs, uvScale, bands } = window.terrainParams;

  const originX = cx * size;
  const originZ = cz * size;

  const step = size / segs;
  const x0 = originX - size/2;
  const z0 = originZ - size/2;

  const vertsPerSide = segs + 1;
  const positions = new Float32Array(vertsPerSide * vertsPerSide * 3);
  const uvs       = new Float32Array(vertsPerSide * vertsPerSide * 2);

  // Grille (positions avec y = worldHeightAt)
  let p = 0, u = 0;
  for (let iz = 0; iz < vertsPerSide; iz++){
    const z = z0 + iz * step;
    for (let ix = 0; ix < vertsPerSide; ix++){
      const x = x0 + ix * step;
      const y = window.worldHeightAt(x, z);

      positions[p++] = x;
      positions[p++] = y;
      positions[p++] = z;

      uvs[u++] = x * uvScale;
      uvs[u++] = z * uvScale;
    }
  }
  const idx = (ix, iz) => iz * vertsPerSide + ix;

  // Offsets relatifs aux bandes globales (appliqués au waterLevel local)
  const offSand  = bands.sandMax  - bands.waterLevel;
  const offGrass = bands.grassMax - bands.waterLevel;
  const offDirt  = bands.dirtMax  - bands.waterLevel;

  // Buckets
  const sandTris = [], grassTris = [], dirtTris = [], rockTris = [];
  const sandUVs  = [], grassUVs  = [], dirtUVs  = [], rockUVs  = [];
  const sandDepths = []; // profondeur sous l’eau (pour gradient)

  function pushTri(bucketPos, bucketUV, ia, ib, ic, depthsArr){
    const a3 = ia*3, b3 = ib*3, c3 = ic*3;
    const au = ia*2, bu = ib*2, cu = ic*2;
    bucketPos.push(
      positions[a3], positions[a3+1], positions[a3+2],
      positions[b3], positions[b3+1], positions[b3+2],
      positions[c3], positions[c3+1], positions[c3+2]
    );
    bucketUV.push(
      uvs[au], uvs[au+1],
      uvs[bu], uvs[bu+1],
      uvs[cu], uvs[cu+1]
    );
    if (depthsArr){
      // profondeur par VERTEX (eau locale)
      const wlA = window.localWaterLevelAt(positions[a3], positions[a3+2]);
      const wlB = window.localWaterLevelAt(positions[b3], positions[b3+2]);
      const wlC = window.localWaterLevelAt(positions[c3], positions[c3+2]);
      depthsArr.push(
        Math.max(0, wlA - positions[a3+1]),
        Math.max(0, wlB - positions[b3+1]),
        Math.max(0, wlC - positions[c3+1])
      );
    }
  }

  // Boucle triangles
  for (let iz = 0; iz < segs; iz++){
    for (let ix = 0; ix < segs; ix++){
      const a = idx(ix,     iz);
      const b = idx(ix + 1, iz);
      const c = idx(ix,     iz + 1);
      const d = idx(ix + 1, iz + 1);

      // Tri 1 : a,c,b
      {
        const ax = positions[a*3], ay = positions[a*3+1], az = positions[a*3+2];
        const bx = positions[b*3], by = positions[b*3+1], bz = positions[b*3+2];
        const cxp= positions[c*3], cy = positions[c*3+1], czp= positions[c*3+2];

        const avgY = (ay + by + cy) / 3;
        const cxz = (ax + bx + cxp) / 3;
        const czz = (az + bz + czp) / 3;
        const wl  = window.localWaterLevelAt(cxz, czz);

        const sandMax  = wl + offSand;
        const grassMax = wl + offGrass;
        const dirtMax  = wl + offDirt;

        if (avgY < sandMax)        pushTri(sandTris,  sandUVs,  a, c, b, sandDepths);
        else if (avgY < grassMax)  pushTri(grassTris, grassUVs, a, c, b);
        else if (avgY < dirtMax)   pushTri(dirtTris,  dirtUVs,  a, c, b);
        else                       pushTri(rockTris,  rockUVs,  a, c, b);
      }

      // Tri 2 : b,c,d
      {
        const bx = positions[b*3], by = positions[b*3+1], bz = positions[b*3+2];
        const cxp= positions[c*3], cy = positions[c*3+1], czp= positions[c*3+2];
        const dx = positions[d*3], dy = positions[d*3+1], dz = positions[d*3+2];

        const avgY = (by + cy + dy) / 3;
        const cxz = (bx + cxp + dx) / 3;
        const czz = (bz + czp + dz) / 3;
        const wl  = window.localWaterLevelAt(cxz, czz);

        const sandMax  = wl + offSand;
        const grassMax = wl + offGrass;
        const dirtMax  = wl + offDirt;

        if (avgY < sandMax)        pushTri(sandTris,  sandUVs,  b, c, d, sandDepths);
        else if (avgY < grassMax)  pushTri(grassTris, grassUVs, b, c, d);
        else if (avgY < dirtMax)   pushTri(dirtTris,  dirtUVs,  b, c, d);
        else                       pushTri(rockTris,  rockUVs,  b, c, d);
      }
    }
  }

  // Construction des Mesh
  function makeMesh(triArray, uvArray, texture, name, depths){
    if (triArray.length === 0) return null;
    const geom = buildGeometryFromTriangles(new Float32Array(triArray), new Float32Array(uvArray));
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 0,
      flatShading: true
    });

    // Gradient de sable sous l’eau
    if (name === "sand" && depths){
      const colors = new Float32Array((triArray.length/3) * 3);
      for (let i=0; i<depths.length; i++){
        const depth = depths[i];
        const t = Math.min(depth / 5.0, 1.0); // ~5 unités => foncé
        // du clair (1,1,1) au brun (0.6,0.5,0.4)
        const r = 1.0 - 0.4*t;
        const g = 1.0 - 0.5*t;
        const b = 1.0 - 0.6*t;
        colors[i*3]   = r;
        colors[i*3+1] = g;
        colors[i*3+2] = b;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mat.vertexColors = true;
    }

    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;
    mesh.name = name;
    return mesh;
  }

  const sandMesh  = makeMesh(sandTris,  sandUVs,  window.__TEX__.sandTex,  "sand",  sandDepths);
  const grassMesh = makeMesh(grassTris, grassUVs, window.__TEX__.grassTex, "grass");
  const dirtMesh  = makeMesh(dirtTris,  dirtUVs,  window.__TEX__.dirtTex,  "dirt");
  const rockMesh  = makeMesh(rockTris,  rockUVs,  window.__TEX__.rockTex,  "rock");

  const group = new THREE.Group();
  group.userData.isChunk = true;
  group.userData.cx = cx;
  group.userData.cz = cz;

  if (sandMesh)  group.add(sandMesh);
  if (grassMesh) group.add(grassMesh);
  if (dirtMesh)  group.add(dirtMesh);
  if (rockMesh)  group.add(rockMesh);

  const objs = new THREE.Group();
  objs.name = "objects";
  addDeterministicObjectsForChunk(cx, cz, objs, size, segs);
  group.add(objs);

  return group;
}

window.generateTerrainChunk = generateTerrainChunk;
