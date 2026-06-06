// ── gcode.js ──────────────────────────────────────────
let allMoves=[], cachedText='';
let cum3=[], cum5=[], cumT=[];

// ── Parser ────────────────────────────────────────────────────────
function parseGcode(text){
  const lines=text.split('\n');
  let x=0,y=0,z=0,b=0,c=0,e=0;
  let absXYZ=true, absE=false;
  let layerZ=-Infinity, layerIdx=0;
  let hotend=null, bed=null, fan=0;
  const result=[];
  for(let li=0;li<lines.length;li++){
    const raw=lines[li].trim();
    if(!raw||raw[0]===';'||raw[0]==='(') continue;
    const lu=raw.toUpperCase();
    if(lu.startsWith('M83')){absE=false;continue;}
    if(lu.startsWith('M82')){absE=true;continue;}
    if(lu.startsWith('G90')){absXYZ=true;continue;}
    if(lu.startsWith('G91')){absXYZ=false;continue;}
    // Temperatures
    if(/^M104\b/.test(lu)||/^M109\b/.test(lu)){const sm=lu.match(/S([\d.]+)/);if(sm)hotend=parseFloat(sm[1]);continue;}
    if(/^M140\b/.test(lu)||/^M190\b/.test(lu)){const sm=lu.match(/S([\d.]+)/);if(sm)bed=parseFloat(sm[1]);continue;}
    if(/^M106\b/.test(lu)){const sm=lu.match(/S([\d.]+)/);fan=sm?Math.round(parseFloat(sm[1])/2.55):100;continue;}
    if(/^M107\b/.test(lu)){fan=0;continue;}
    const isG0=/^G0\b/.test(lu), isG1=/^G1\b/.test(lu);
    if(!isG0&&!isG1) continue;
    const px=x,py=y,pz=z,pb=b,pc=c;
    const xm=lu.match(/X(-?[\d.]+)/),ym=lu.match(/Y(-?[\d.]+)/),zm=lu.match(/Z(-?[\d.]+)/);
    const bm=lu.match(/B(-?[\d.]+)/),cm=lu.match(/C(-?[\d.]+)/),em=lu.match(/E(-?[\d.]+)/);
    if(xm) x=absXYZ?parseFloat(xm[1]):x+parseFloat(xm[1]);
    if(ym) y=absXYZ?parseFloat(ym[1]):y+parseFloat(ym[1]);
    if(zm) z=absXYZ?parseFloat(zm[1]):z+parseFloat(zm[1]);
    if(bm) b=parseFloat(bm[1]);
    if(cm) c=parseFloat(cm[1]);
    let extruding=false;
    if(em){const ev=parseFloat(em[1]);if(!absE&&ev>0.0001)extruding=true;if(absE&&ev>e+0.0001)extruding=true;if(absE)e=ev;else e+=parseFloat(em[1]);}
    if(isG0&&!em) extruding=false;
    if(z>layerZ+0.001){layerZ=z;layerIdx++;}
    const is5ax=Math.abs(b)>0.5||Math.abs(c)>0.5;
    const type=extruding?(is5ax?'e5':'e3'):'travel';
    const s0=toPart(px,py,pz,pb,pc);
    const s1=toPart(x,y,z,b,c);
    const dx2=s1[0]-s0[0],dy2=s1[1]-s0[1],dz2=s1[2]-s0[2];
    if(dx2*dx2+dy2*dy2+dz2*dz2<1e-8) continue;
    result.push({type,s0,s1,mx:x,my:y,mz:z,mb:b,mc:c,me:e,layer:layerIdx,lineNum:li+1,rawLine:raw,
      absXYZ,absE,hotend,bedTemp:bed,fan});
  }
  return result;
}

function toPart(x,y,z,bDeg,cDeg){
  const b=bDeg*Math.PI/180, c=cDeg*Math.PI/180;
  const xb=x*Math.cos(-b)+z*Math.sin(-b), yb=y, zb=-x*Math.sin(-b)+z*Math.cos(-b);
  return [xb*Math.cos(-c)-yb*Math.sin(-c), xb*Math.sin(-c)+yb*Math.cos(-c), zb];
}

function layerColor(layer,maxLayer){
  const col=new THREE.Color();
  col.setHSL(0.66-Math.min(layer/Math.max(maxLayer,1),1)*0.66,1,0.5);
  return col;
}

// ── Build meshes ──────────────────────────────────────────────────
const dummy=new THREE.Object3D();

function buildMeshes(nd){
  [mesh3,mesh5,lineT].forEach(m=>{if(m){m.geometry?.dispose();m.material?.dispose();bedGroup.remove(m);}});
  mesh3=mesh5=lineT=null;
  const ax=bedGroup.getObjectByName('axes'); if(ax) bedGroup.remove(ax);

  const show3=document.getElementById('se').checked;
  const show5=document.getElementById('s5').checked;
  const showT=document.getElementById('st').checked;
  const colorByLayer=document.getElementById('sc').checked;
  const maxLayer=allMoves.length?Math.max(...allMoves.map(s=>s.layer)):0;

  const segs3=allMoves.filter(s=>s.type==='e3');
  const segs5=allMoves.filter(s=>s.type==='e5');
  const segsT=allMoves.filter(s=>s.type==='travel');

  // Cumulative indices
  let n3=0,n5=0,nT=0;
  cum3=new Int32Array(allMoves.length+1);
  cum5=new Int32Array(allMoves.length+1);
  cumT=new Int32Array(allMoves.length+1);
  for(let i=0;i<allMoves.length;i++){
    const t=allMoves[i].type;
    if(t==='e3')n3++;else if(t==='e5')n5++;else nT++;
    cum3[i+1]=n3;cum5[i+1]=n5;cumT[i+1]=nT;
  }

  const r=nd/2;
  const cylGeo=new THREE.CylinderGeometry(r,r,1,6,1);

  function makeInstanced(segs,color,visible){
    if(!segs.length||!visible) return null;
    const mat=new THREE.MeshLambertMaterial({color,vertexColors:colorByLayer});
    const mesh=new THREE.InstancedMesh(cylGeo,mat,segs.length);
    const colors=colorByLayer?new Float32Array(segs.length*3):null;
    for(let i=0;i<segs.length;i++){
      const [x0,y0,z0]=segs[i].s0,[x1,y1,z1]=segs[i].s1;
      const v0=new THREE.Vector3(x0,z0,-y0),v1=new THREE.Vector3(x1,z1,-y1);
      const len=v0.distanceTo(v1);
      if(len<0.001){mesh.setMatrixAt(i,new THREE.Matrix4());continue;}
      dummy.position.copy(v0).lerp(v1,0.5);
      dummy.scale.set(1,len,1);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v1.clone().sub(v0).normalize());
      dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix);
      if(colorByLayer){const col=layerColor(segs[i].layer,maxLayer);colors[i*3]=col.r;colors[i*3+1]=col.g;colors[i*3+2]=col.b;}
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(colorByLayer) mesh.instanceColor=new THREE.InstancedBufferAttribute(colors,3);
    mesh.count=0; mesh.userData.fullCount=segs.length;
    return mesh;
  }

  mesh3=makeInstanced(segs3,0x3b82f6,show3); if(mesh3) bedGroup.add(mesh3);
  mesh5=makeInstanced(segs5,0xef4444,show5); if(mesh5) bedGroup.add(mesh5);

  if(showT&&segsT.length){
    const pts=[];
    for(const s of segsT){
      pts.push(new THREE.Vector3(s.s0[0],s.s0[2],-s.s0[1]));
      pts.push(new THREE.Vector3(s.s1[0],s.s1[2],-s.s1[1]));
    }
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    lineT=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xf59e0b,transparent:true,opacity:0.4}));
    lineT.userData.fullCount=segsT.length;
    lineT.geometry.setDrawRange(0,0);
    bedGroup.add(lineT);
  }

  const axHelper=new THREE.AxesHelper(10); axHelper.name='axes'; bedGroup.add(axHelper);

  // Fit camera using full bounds (use bedGroup + staticGroup together)
  if(mesh3) mesh3.count=mesh3.userData.fullCount;
  if(mesh5) mesh5.count=mesh5.userData.fullCount;
  if(lineT) lineT.geometry.setDrawRange(0,lineT.userData.fullCount*2);
  const box=new THREE.Box3().setFromObject(rootGroup);
  if(!box.isEmpty()){
    const center=box.getCenter(new THREE.Vector3());
    const size=box.getSize(new THREE.Vector3());
    rootGroup.position.sub(center); panX=0; panY=0;
    const maxD=Math.max(size.x,size.y,size.z,1);
    baseZ=maxD*1.8; zoom=1;
    camera.position.z=baseZ; camera.near=maxD*0.001; camera.far=maxD*300;
    camera.updateProjectionMatrix();
  }
  if(mesh3) mesh3.count=0;
  if(mesh5) mesh5.count=0;
  if(lineT) lineT.geometry.setDrawRange(0,0);

  document.getElementById('c3ax').textContent=segs3.length.toLocaleString();
  document.getElementById('c5ax').textContent=segs5.length.toLocaleString();
  document.getElementById('ctrav').textContent=segsT.length.toLocaleString();
  document.getElementById('ctot').textContent=allMoves.length.toLocaleString();
  document.getElementById('corner-br').textContent=allMoves.length.toLocaleString()+' moves';
}

// ── Progress ──────────────────────────────────────────────────────
function applyProgress(pct){
  const frac=pct/10000;
  const moveIdx=Math.floor(allMoves.length*frac);
  if(mesh3) mesh3.count=cum3[moveIdx];
  if(mesh5) mesh5.count=cum5[moveIdx];
  if(lineT) lineT.geometry.setDrawRange(0,cumT[moveIdx]*2);

  const pctStr=Math.round(frac*100)+'%';
  document.getElementById('progv').textContent=pctStr;
  document.getElementById('prog-fill').style.width=pctStr;
  document.getElementById('moveInfo').textContent=moveIdx.toLocaleString()+' / '+(allMoves.length||0).toLocaleString();

  updateReadout(moveIdx);
  updateNozzlePosition(moveIdx);
  updateBedRotation(moveIdx);
  updateMachine(moveIdx);
  // Update violation panel on every frame (scrub, arrow keys, playback)
  if(!isPlaying) checkCurrentMove();
}

// Update axis position bar indicators
function updateAxisBars(m){
  if(!m) return;
  const L = getLimits();
  const axes = [
    {key:'x', val:m.mx, min:L.xmin, max:L.xmax},
    {key:'y', val:m.my, min:L.ymin, max:L.ymax},
    {key:'z', val:m.mz, min:L.zmin, max:L.zmax},
    {key:'b', val:m.mb, min:L.bmin, max:L.bmax},
    {key:'c', val:m.mc, min:-360,   max:360},
    {key:'e', val:m.me, min:0,       max:Math.max(m.me||1,1)},
  ];
  for(const ax of axes){
    const bar = document.getElementById('ax-bar-'+ax.key);
    if(!bar) continue;
    const range = ax.max - ax.min;
    const pct = range>0 ? Math.max(0,Math.min(100,((ax.val-ax.min)/range)*100)) : 50;
    bar.style.width = pct+'%';
  }
}

const TYPE_LABELS={e3:'3-AXIS EXTRUDE',e5:'5-AXIS EXTRUDE',travel:'TRAVEL'};
const TYPE_COLORS={e3:'var(--ax-z)',e5:'var(--ax-x)',travel:'var(--ax-b)'};

function updateReadout(moveIdx){
  if(!allMoves.length||moveIdx===0){
    ['x','y','z'].forEach(a=>document.getElementById('ax-'+a).textContent='0.000');
    ['b','c'].forEach(a=>document.getElementById('ax-'+a).textContent='0.0°');
    document.getElementById('ax-e').textContent='0.000';
    document.getElementById('type-label').textContent='—';
    document.getElementById('type-dot').style.background='';
    ['ps-pos','ps-emode','ps-fan','ps-hotend','ps-bed'].forEach(id=>document.getElementById(id).textContent='—');
    document.getElementById('gcode-ctx').innerHTML='';
    return;
  }
  const m=allMoves[Math.min(moveIdx-1,allMoves.length-1)];
  document.getElementById('ax-x').textContent=m.mx.toFixed(3);
  document.getElementById('ax-y').textContent=m.my.toFixed(3);
  document.getElementById('ax-z').textContent=m.mz.toFixed(3);
  document.getElementById('ax-b').textContent=m.mb.toFixed(1)+'°';
  document.getElementById('ax-c').textContent=m.mc.toFixed(1)+'°';
  document.getElementById('ax-e').textContent=m.me.toFixed(3);
  updateAxisBars(m);
  syncJogFromMove(m);
  document.getElementById('type-label').textContent=TYPE_LABELS[m.type]||m.type;
  document.getElementById('type-dot').style.background=TYPE_COLORS[m.type]||'';
  // Print state
  document.getElementById('ps-pos').textContent=m.absXYZ?'G90 Absolute':'G91 Relative';
  document.getElementById('ps-emode').textContent=m.absE?'M82 Absolute':'M83 Relative';
  document.getElementById('ps-fan').textContent=m.fan!=null?m.fan+'%':'—';
  document.getElementById('ps-hotend').textContent=m.hotend!=null?m.hotend+'°C':'—';
  document.getElementById('ps-bed').textContent=m.bedTemp!=null?m.bedTemp+'°C':'—';
  buildContext(m.lineNum);
}

function buildContext(centerLine){
  if(!cachedText) return;
  const lines=cachedText.split('\n');
  const start=Math.max(0,centerLine-6), end=Math.min(lines.length-1,centerLine+5);
  let html='';
  for(let i=start;i<=end;i++){
    const cur=i===centerLine-1;
    const raw=lines[i];
    // Syntax color: command, axis letters, comments
    let colored=escHtml(raw);
    if(!raw.trim().startsWith(';')){
      colored=colored
        .replace(/^(\s*)(G\d+|M\d+)/,'$1<span class="gc-cmd">$2</span>')
        .replace(/\b([XYZEBCF])(-?[\d.]+)/g,'<span class="gc-axis">$1$2</span>')
        .replace(/(;.*)$/,'<span class="gc-comment">$1</span>');
    } else {
      colored='<span class="gc-comment">'+colored+'</span>';
    }
    const ln=String(i+1).padStart(4,' ').replace(/ /g,'&nbsp;');
    html+=`<div class="gc-line${cur?' current':''}"><span class="gc-ln">${ln}</span><span class="gc-code">${colored}</span></div>`;
  }
  const ctx=document.getElementById('gcode-ctx');
  ctx.innerHTML=html;
  const cur=ctx.querySelector('.current');
  if(cur) cur.scrollIntoView({block:'nearest'});
}

function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── Rebuild ───────────────────────────────────────────────────────
function rebuildAll(resetProgress){
  if(!cachedText) return;
  document.getElementById('tb-status').textContent='building…';
  setTimeout(()=>{
    allMoves=parseGcode(cachedText);
    buildMeshes(parseFloat(document.getElementById('nozzle').value)||0.4);
    // Always start at beginning of gcode
    document.getElementById('prog').value=0;
    applyProgress(0);
    checkLimits();
    // Clear live violation state for the new file
    _lastLimStr=''; _lastCollStr='';
    _limitViolations=[]; _collisionViolations=[];
    clearAllPartColliding();
    clearPrintHull();
    renderViolationPanel();
    document.getElementById('tb-status').textContent='';
    // Home the machine
    goHome();
  },10);
}

// ── Unified violation state (collisions + limits) ─────────────────
// Both checkLimits() and checkCollisions() write here; panel updates atomically.
