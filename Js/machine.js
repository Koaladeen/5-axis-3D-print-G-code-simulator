// ── machine.js ──────────────────────────────────────────
const MACHINES_API = 'https://api.github.com/repos/Koaladeen/5-axis-3D-print-G-code-simulator/contents/Machines';
const MACHINES_RAW = 'https://raw.githubusercontent.com/Koaladeen/5-axis-3D-print-G-code-simulator/main/Machines';
const MACHINE_PARTS = ['Frame','Z','B','C','Y','X'];

const machineGroup = new THREE.Group();
const mGrp = {};
let machineLoaded = false;
let currentMachineName = '';

const machMat = (part) => {
  const op  = parseFloat(document.getElementById(`mc-${part}-op`)?.value  ?? 1);
  const col = document.getElementById(`mc-${part}-col`)?.value ?? '#5577aa';
  return new THREE.MeshLambertMaterial({color:col, transparent:op<1, opacity:op, side:THREE.DoubleSide});
};

// Fetch machine folder list from GitHub API
async function fetchMachineList(){
  try{
    const res = await fetch(MACHINES_API);
    if(!res.ok) throw new Error('API '+res.status);
    const items = await res.json();
    const sel = document.getElementById('machineSelect');
    items
      .filter(i=>i.type==='dir')
      .forEach(i=>{
        const opt=document.createElement('option');
        opt.value=i.name;
        opt.textContent=i.name;
        sel.appendChild(opt);
      });
  } catch(e){
    console.info('Machine list unavailable (works on GitHub Pages):', e.message);
  }
}

function disposeMachine(){
  Object.values(mGrp).forEach(g=>{
    g.traverse(c=>{if(c.isMesh){c.geometry.dispose();c.material.dispose();}});
    if(g.parent) g.parent.remove(g);
  });
  Object.keys(mGrp).forEach(k=>delete mGrp[k]);
  if(machineGroup.parent) machineGroup.clear();
  machineLoaded=false;
  currentMachineName='';
}

async function loadMachine(machineName){
  if(!machineName) return;
  if(machineName===currentMachineName && machineLoaded) {
    machineGroup.visible=true; return;
  }
  disposeMachine();
  document.getElementById('tb-status').textContent='loading machine…';

  // Bed side: Frame > Z > B > C (C IS the bed)
  mGrp.Frame = new THREE.Group(); machineGroup.add(mGrp.Frame);
  mGrp.Z     = new THREE.Group(); machineGroup.add(mGrp.Z);
  mGrp.B     = new THREE.Group(); mGrp.Z.add(mGrp.B);
  mGrp.C     = new THREE.Group(); mGrp.B.add(mGrp.C);
  // Toolhead side: Y moves under machine root, X under Y
  mGrp.Y = new THREE.Group(); machineGroup.add(mGrp.Y);
  mGrp.X = new THREE.Group(); mGrp.Y.add(mGrp.X);

  if(!machineGroup.parent) rootGroup.add(machineGroup);
  machineGroup.rotation.set(0, 0, 0);
  machineGroup.visible=true;

  const loader = new THREE.STLLoader();
  const base = `${MACHINES_RAW}/${encodeURIComponent(machineName)}`;
  let loaded=0;

  const promises = MACHINE_PARTS.map(name=>new Promise(resolve=>{
    loader.load(
      `${base}/${name}.stl`,
      geo=>{
        const mesh=new THREE.Mesh(geo, machMat(name));
        mesh.rotation.x=-Math.PI/2;
        mGrp[name].add(mesh);
        loaded++;
        document.getElementById('tb-status').textContent=`loading machine… ${loaded}/${MACHINE_PARTS.length}`;
        resolve();
      },
      null,
      ()=>resolve()
    );
  }));

  await Promise.all(promises);
  machineLoaded=true;
  currentMachineName=machineName;
  document.getElementById('tb-status').textContent='';
  setSimpleSceneVisible(false);
  // Reset to start position
  document.getElementById('prog').value=0;
  applyProgress(0);
  goHome();
  // Try to load machine.json for this machine (settings + proxies)
  let collisionLoadedFromMachineJson = false;
  try{
    const mr = await fetch(`${MACHINES_RAW}/${encodeURIComponent(machineName)}/machine.json`);
    if(mr.ok){
      const cfg = await mr.json();
      applyMachineConfig(cfg);
      collisionLoadedFromMachineJson = collProxies.length > 0;
      document.getElementById('coll-status').textContent =
        `Auto-loaded settings from machine.json (${collProxies.length} proxies)`;
    }
  }catch(e){}

  // Try to load collision.json — takes precedence over proxies in machine.json
  try{
    const cr=await fetch(`${MACHINES_RAW}/${encodeURIComponent(machineName)}/collision.json`);
    if(cr.ok){
      const data=await cr.json();
      collProxies=(data.proxies||[]).map(p=>({...p,id:nextProxyId++}));
      rebuildProxyWireframes();
      document.getElementById('coll-status').textContent=`Auto-loaded ${collProxies.length} proxies from collision.json`;
    } else if(!collisionLoadedFromMachineJson) {
      // No collision.json and no proxies from machine.json — auto-generate hulls
      setTimeout(()=>autoGenerateHulls(), 200);
    }
  }catch(e){
    if(!collisionLoadedFromMachineJson) setTimeout(()=>autoGenerateHulls(), 200);
  }
  updateMachine(0);
}

function updateMachine(moveIdx){
  if(!machineLoaded||!machineGroup.parent) return;
  machineGroup.visible=document.getElementById('showMach').checked;
  if(!machineGroup.visible) return;

  let mx=0,my=0,mz=0,mb=0,mc=0;
  if(allMoves.length && moveIdx>0){
    const m=allMoves[Math.min(moveIdx-1,allMoves.length-1)];
    mx=m.mx;my=m.my;mz=m.mz;mb=m.mb;mc=m.mc;
  }

  // Machine origin offset (corrects STL export origin vs machine zero)
  const ox=parseFloat(document.getElementById('mc-ox').value)||0;
  const oy=parseFloat(document.getElementById('mc-oy').value)||0;
  const oz=parseFloat(document.getElementById('mc-oz').value)||0;
  machineGroup.position.set(ox, oz, -oy); // apply in Three.js coords

  // Bed side: Z↑, B rotates Y, C IS the bed (rotates on B-local Y)
  if(mGrp.Z) mGrp.Z.position.set(0, -mz, 0);
  if(mGrp.B){ mGrp.B.rotation.set(0,0,0); mGrp.B.rotateZ(-mb*Math.PI/180); }
  if(mGrp.C){ mGrp.C.rotation.set(0,0,0); mGrp.C.rotateY(mc*Math.PI/180); }

  // Toolhead side: Y translates in -Z, X carries toolhead
  if(mGrp.Y) mGrp.Y.position.set(0, 0, -my);
  if(mGrp.X) mGrp.X.position.set(mx, 0, 0);
}

function applyMachineAppearance(){
  MACHINE_PARTS.forEach(name=>{
    if(!mGrp[name]) return;
    const op  = parseFloat(document.getElementById(`mc-${name}-op`)?.value ?? 1);
    const col = document.getElementById(`mc-${name}-col`)?.value ?? '#5577aa';
    mGrp[name].traverse(c=>{
      if(!c.isMesh) return;
      c.material.color.set(col);
      c.material.opacity=op;
      c.material.transparent=op<1;
      c.material.needsUpdate=true;
    });
  });
}

// Legacy alias
function setMachineOpacity(val){
  MACHINE_PARTS.forEach(name=>{
    if(!mGrp[name]) return;
    mGrp[name].traverse(c=>{if(c.isMesh){c.material.opacity=val;c.material.transparent=val<1;}});
  });
}

// ── Settings modal wiring ─────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click',()=>document.getElementById('settings-overlay').classList.add('open'));
document.getElementById('settingsClose').addEventListener('click',()=>document.getElementById('settings-overlay').classList.remove('open'));
document.getElementById('settings-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget) e.currentTarget.classList.remove('open');});
document.getElementById('s-apply-btn').addEventListener('click',()=>{
  buildBuildplate();
  buildNozzle();
  checkLimits();
  document.getElementById('settings-overlay').classList.remove('open');
});
// Chip toggles inside modal for bp/nz visibility
['chip-bp','chip-nz'].forEach(id=>{
  const chip=document.getElementById(id);
  if(!chip) return;
  const cb=chip.querySelector('input');
  chip.addEventListener('click',()=>{ cb.checked=!cb.checked; chip.classList.toggle('on',cb.checked); });
});

['mc-ox','mc-oy','mc-oz'].forEach(id=>{
  document.getElementById(id).addEventListener('input',()=>updateMachine(0));
});

// Per-part machine appearance controls
document.querySelectorAll('.s-mach-op').forEach(el=>{
  el.addEventListener('input', ()=>applyMachineAppearance());
});
['Frame','Z','B','C','Y','X'].forEach(name=>{
  const col=document.getElementById(`mc-${name}-col`);
  if(col) col.addEventListener('input', ()=>applyMachineAppearance());
});

// ── Data ──────────────────────────────────────────────────────────
