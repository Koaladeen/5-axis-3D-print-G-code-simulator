// ── scene-objects.js ──────────────────────────────────────────
// ── Static scene objects ──────────────────────────────────────────
let buildplateMesh=null, nozzleMesh=null;
const staticGroup=new THREE.Group(); // nozzle lives here — never gets bed rotation
const bedGroup=new THREE.Group();    // buildplate + toolpath meshes; gets B/C in machine frame

// Build or rebuild buildplate
function buildBuildplate(){
  if(buildplateMesh){ bedGroup.remove(buildplateMesh); buildplateMesh.geometry.dispose(); buildplateMesh.material.dispose(); }
  const w=parseFloat(document.getElementById('s-bp-w').value)||90;
  const d=parseFloat(document.getElementById('s-bp-d').value)||90;
  const t=parseFloat(document.getElementById('s-bp-t').value)||3;
  const col=document.getElementById('s-bp-col').value;
  const vis=document.getElementById('s-bp-vis').checked;
  const geo=new THREE.BoxGeometry(w,t,d);
  const mat=new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:0.55});
  buildplateMesh=new THREE.Mesh(geo,mat);
  buildplateMesh.position.set(0,-t/2,0);
  buildplateMesh.visible=vis;
  bedGroup.add(buildplateMesh);

  // Grid lines on top surface
  const existing=bedGroup.getObjectByName('bp-grid'); if(existing) bedGroup.remove(existing);
  const gridGrp=new THREE.Group(); gridGrp.name='bp-grid';
  const lineMat=new THREE.LineBasicMaterial({color:0x88a0b8,transparent:true,opacity:0.4});
  const step=10;
  for(let xi=-w/2;xi<=w/2+0.01;xi+=step){
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(xi,0,-d/2),new THREE.Vector3(xi,0,d/2)]);
    gridGrp.add(new THREE.Line(g,lineMat));
  }
  for(let zi=-d/2;zi<=d/2+0.01;zi+=step){
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w/2,0,zi),new THREE.Vector3(w/2,0,zi)]);
    gridGrp.add(new THREE.Line(g,lineMat));
  }
  const bpts=[new THREE.Vector3(-w/2,0,-d/2),new THREE.Vector3(w/2,0,-d/2),new THREE.Vector3(w/2,0,d/2),new THREE.Vector3(-w/2,0,d/2),new THREE.Vector3(-w/2,0,-d/2)];
  const bg=new THREE.BufferGeometry().setFromPoints(bpts);
  gridGrp.add(new THREE.Line(bg,new THREE.LineBasicMaterial({color:0x3a6090,transparent:true,opacity:0.7})));
  gridGrp.visible=vis;
  bedGroup.add(gridGrp);
}

// Build or rebuild nozzle cone. Tip points down, shaft extends upward.
function buildNozzle(){
  if(nozzleMesh){ staticGroup.remove(nozzleMesh); nozzleMesh.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();}); }
  const tipR  = parseFloat(document.getElementById('s-nz-tip').value)/2  || 0.4;
  const baseR = parseFloat(document.getElementById('s-nz-base').value)/2 || 4;
  const angDeg= parseFloat(document.getElementById('s-nz-ang').value)    || 45;
  const shaftL= parseFloat(document.getElementById('s-nz-len').value)    || 10;
  const col   = document.getElementById('s-nz-col').value;
  const vis   = document.getElementById('s-nz-vis').checked;

  const angRad = angDeg * Math.PI / 180;
  const coneH  = (baseR - tipR) / Math.tan(angRad);

  const mat = new THREE.MeshLambertMaterial({color:col, transparent:true, opacity:0.8, side:THREE.DoubleSide});

  // Cone: tip at bottom (radiusTop=tipR, radiusBottom=baseR so THREE cylinder goes top→bottom)
  // We want tip pointing DOWN (-Y). CylinderGeometry goes along Y.
  // radiusTop = tipR (will be at +Y = top = upward), radiusBottom = baseR (at -Y = downward toward bed)
  // Then we flip it 180° so tip faces down.
  const coneGeo  = new THREE.CylinderGeometry(tipR, baseR, coneH, 24, 1);
  const coneMesh = new THREE.Mesh(coneGeo, mat);
  // Flip 180° around X so tip (-Y end = tipR end) now points down
  coneMesh.rotation.x = Math.PI;
  // After flip the cone occupies y: -coneH/2 to +coneH/2 relative to its own origin
  // We want tip at y=0 (nozzle tip at move position), so shift up by coneH/2
  coneMesh.position.y = coneH / 2;

  // Shaft cylinder: sits on top of cone base, extends upward
  const shaftGeo  = new THREE.CylinderGeometry(baseR, baseR, shaftL, 24, 1);
  const shaftMesh = new THREE.Mesh(shaftGeo, mat);
  // Bottom of shaft at y = coneH, center at y = coneH + shaftL/2
  shaftMesh.position.y = coneH + shaftL / 2;

  nozzleMesh = new THREE.Group();
  nozzleMesh.add(coneMesh);
  nozzleMesh.add(shaftMesh);
  nozzleMesh.visible = vis;
  nozzleMesh.userData.height = coneH + shaftL;
  staticGroup.add(nozzleMesh);
}

// Canonical bed quaternion for machine frame (bed tilts away from nozzle)
function calcBedQuat(bRad, cRad){
  const qB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,-1),  bRad);
  const qC = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1, 0), cRad);
  return new THREE.Quaternion().copy(qB).multiply(qC);
}

// Part frame nozzle: same as calcBedQuat but C flipped
function calcNozzlePartQuat(bRad, cRad){
  const qB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,-1), -bRad);
  const qC = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1, 0),  cRad);
  return new THREE.Quaternion().copy(qB).multiply(qC);
}

// Nozzle quaternion for part frame (inverse of toPart rotation)
function calcNozzleQuat(bRad, cRad){
  const qB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,-1), -bRad);
  const qC = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1, 0),  cRad); // +cRad matches toPart's -c
  return new THREE.Quaternion().copy(qB).multiply(qC).conjugate();
}

// Apply B/C rotation and Z translation to bedGroup in machine frame
function updateBedRotation(moveIdx){
  const usePart = document.getElementById('viewMode').value==='part';
  if(usePart || !allMoves.length || moveIdx===0){
    bedGroup.quaternion.set(0,0,0,1);
    bedGroup.position.set(0,0,0);
    return;
  }
  const m = allMoves[Math.min(moveIdx-1, allMoves.length-1)];
  bedGroup.quaternion.copy(calcBedQuat(m.mb*Math.PI/180, m.mc*Math.PI/180));
  bedGroup.position.set(0, -m.mz, 0); // Z moves bed down, same as machine model
}

// Update nozzle position to current move's world coords
function updateNozzlePosition(moveIdx){
  if(!nozzleMesh) return;
  if(!allMoves.length||moveIdx===0){
    nozzleMesh.position.set(0,0,0);
    nozzleMesh.quaternion.set(0,0,0,1);
    return;
  }
  const m=allMoves[Math.min(moveIdx-1,allMoves.length-1)];
  const usePart=document.getElementById('viewMode').value==='part';

  if(usePart){
    const [wx,wy,wz]=toPart(m.mx,m.my,m.mz,m.mb,m.mc);
    nozzleMesh.position.set(wx,wz,-wy);
    nozzleMesh.quaternion.copy(calcNozzlePartQuat(m.mb*Math.PI/180, m.mc*Math.PI/180));
  } else {
    nozzleMesh.position.set(m.mx, 0, -m.my);
    nozzleMesh.quaternion.set(0,0,0,1);
  }
}

function initStaticScene(){
  rootGroup.add(staticGroup);
  rootGroup.add(bedGroup);
  buildBuildplate();
  buildNozzle();
}

// ── Machine STL loader ────────────────────────────────────────────
