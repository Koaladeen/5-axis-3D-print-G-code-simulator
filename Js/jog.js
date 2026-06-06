// ── jog.js ────────────────────────────────────────────
const JOG_AXES = [
  {key:'x', label:'X', color:'var(--ax-x)', min:-50, max:50,  step:0.1,  unit:'mm', deg:false},
  {key:'y', label:'Y', color:'var(--ax-y)', min:-50, max:50,  step:0.1,  unit:'mm', deg:false},
  {key:'z', label:'Z', color:'var(--ax-z)', min:0,   max:90,  step:0.1,  unit:'mm', deg:false},
  {key:'b', label:'B', color:'var(--ax-b)', min:-120,max:32,  step:0.5,  unit:'°',  deg:true},
  {key:'c', label:'C', color:'var(--ax-c)', min:-360,max:360, step:1,    unit:'°',  deg:true},
];

// Jog state — current manual positions
const HOME_POS = {x:0, y:0, z:80, b:0, c:0};
let jogPos = {...HOME_POS};
let jogActive = false; // true when in jog mode (playback paused)
let isJogging = false;  // true while applyJogPosition is running

function buildJogPanel(){
  const container = document.getElementById('jog-axes');
  container.innerHTML = '';
  for(const ax of JOG_AXES){
    const div = document.createElement('div');
    div.className = 'jog-axis';
    div.innerHTML = `
      <div class="jog-axis-head">
        <span class="jog-axis-name" style="color:${ax.color}">${ax.label}</span>
        <span class="jog-axis-val" id="jog-val-${ax.key}">${jogPos[ax.key].toFixed(ax.deg?1:3)} ${ax.unit}</span>
      </div>
      <input type="range" class="jog-slider" id="jog-${ax.key}"
        min="${ax.min}" max="${ax.max}" step="${ax.step}" value="${jogPos[ax.key]}"
        style="background:var(--bg4);"
        oninput="onJogInput('${ax.key}', this.value)">
      <div class="jog-range-labels"><span>${ax.min}${ax.unit}</span><span>${ax.max}${ax.unit}</span></div>
    `;
    // Style slider thumb color
    const style = document.createElement('style');
    style.textContent = `#jog-${ax.key}::-webkit-slider-thumb { background: ${ax.color}; }`;
    div.appendChild(style);
    container.appendChild(div);
  }
}

function onJogInput(key, val){
  if(isPlaying) return; // only when paused
  jogPos[key] = parseFloat(val);
  document.getElementById(`jog-val-${key}`).textContent =
    jogPos[key].toFixed(JOG_AXES.find(a=>a.key===key)?.deg ? 1 : 3) + ' ' +
    (JOG_AXES.find(a=>a.key===key)?.unit||'');
  applyJogPosition();
}

function applyJogPosition(){
  // Update axis readout
  document.getElementById('ax-x').textContent = jogPos.x.toFixed(3);
  document.getElementById('ax-y').textContent = jogPos.y.toFixed(3);
  document.getElementById('ax-z').textContent = jogPos.z.toFixed(3);
  document.getElementById('ax-b').textContent = jogPos.b.toFixed(1)+'°';
  document.getElementById('ax-c').textContent = jogPos.c.toFixed(1)+'°';
  updateAxisBars({mx:jogPos.x,my:jogPos.y,mz:jogPos.z,mb:jogPos.b,mc:jogPos.c,me:0});

  // Update nozzle and bed
  const fakeMove = {mx:jogPos.x,my:jogPos.y,mz:jogPos.z,mb:jogPos.b,mc:jogPos.c,me:0};
  // Temporarily inject into allMoves[0] slot for update functions
  const saved = allMoves[0];
  allMoves[0] = fakeMove;
  updateNozzlePositionFromMove(fakeMove);
  updateBedRotationFromMove(fakeMove);
  updateMachineFromMove(fakeMove);
  // Force Three.js to recalculate world matrices before collision check.
  // NOTE: restore allMoves[0] AFTER checkCurrentMove so buildPrintHull
  // reads the correct moveIdx (prog bar position) against the actual
  // printed geometry, while the machine is posed at the jog position.
  scene.updateMatrixWorld(true);
  checkCurrentMove(); // includes print hull vs machine check
  if(saved !== undefined) allMoves[0] = saved;
}

// Jog-aware versions that take a move directly
function updateNozzlePositionFromMove(m){
  if(!nozzleMesh) return;
  const usePart = document.getElementById('viewMode').value==='part';
  if(usePart){
    const [wx,wy,wz]=toPart(m.mx,m.my,m.mz,m.mb,m.mc);
    nozzleMesh.position.set(wx,wz,-wy);
    nozzleMesh.quaternion.copy(calcNozzlePartQuat(m.mb*Math.PI/180,m.mc*Math.PI/180));
  } else {
    nozzleMesh.position.set(m.mx,0,-m.my);
    nozzleMesh.quaternion.set(0,0,0,1);
  }
}
function updateBedRotationFromMove(m){
  const usePart = document.getElementById('viewMode').value==='part';
  if(usePart||!m){bedGroup.quaternion.set(0,0,0,1);bedGroup.position.set(0,0,0);return;}
  bedGroup.quaternion.copy(calcBedQuat(m.mb*Math.PI/180,m.mc*Math.PI/180));
  bedGroup.position.set(0,-m.mz,0);
}
function updateMachineFromMove(m){
  if(!machineLoaded||!machineGroup.parent) return;
  machineGroup.visible=document.getElementById('showMach').checked;
  if(!machineGroup.visible) return;
  const ox=parseFloat(document.getElementById('mc-ox').value)||0;
  const oy=parseFloat(document.getElementById('mc-oy').value)||0;
  const oz=parseFloat(document.getElementById('mc-oz').value)||0;
  machineGroup.position.set(ox,oz,-oy);
  if(mGrp.Z) mGrp.Z.position.set(0,-m.mz,0);
  if(mGrp.B){mGrp.B.rotation.set(0,0,0);mGrp.B.rotateZ(-m.mb*Math.PI/180);}
  if(mGrp.C){mGrp.C.rotation.set(0,0,0);mGrp.C.rotateY(m.mc*Math.PI/180);}
  if(mGrp.Y) mGrp.Y.position.set(0,0,-m.my);
  if(mGrp.X) mGrp.X.position.set(m.mx,0,0);
}

function setJogEnabled(enabled){
  const panel = document.getElementById('jog-axes');
  panel.classList.toggle('jp-disabled', !enabled);
  document.getElementById('jog-home-btn').classList.toggle('jp-disabled', !enabled);
  document.getElementById('jog-status').textContent = enabled ? 'ACTIVE' : 'PAUSED';
  document.getElementById('jog-status').style.color = enabled ? 'var(--green)' : 'var(--amber)';
}


function goHome(){
  jogPos = {...HOME_POS};
  JOG_AXES.forEach(ax=>{
    const el=document.getElementById('jog-'+ax.key);
    if(el) el.value=jogPos[ax.key];
    const vEl=document.getElementById('jog-val-'+ax.key);
    if(vEl) vEl.textContent=jogPos[ax.key].toFixed(ax.deg?1:3)+' '+(ax.unit||'');
  });
  applyJogPosition();
}
document.getElementById('jog-home-btn').addEventListener('click',()=>{
  if(isPlaying) return;
  goHome();
});

// Sync jog sliders when progress scrubs to a position
function syncJogFromMove(m){
  if(!m) return;
  jogPos.x=m.mx; jogPos.y=m.my; jogPos.z=m.mz; jogPos.b=m.mb; jogPos.c=m.mc;
  JOG_AXES.forEach(ax=>{
    const el=document.getElementById('jog-'+ax.key);
    if(el) el.value=jogPos[ax.key];
    const vEl=document.getElementById('jog-val-'+ax.key);
    if(vEl) vEl.textContent=jogPos[ax.key].toFixed(ax.deg?1:3)+' '+(ax.unit||'');
  });
}

