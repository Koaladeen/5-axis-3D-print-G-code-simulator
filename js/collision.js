// ── collision.js ──────────────────────────────────────────
let printHullIdx   = -1;    // moveIdx at last hull build
const PRINT_HULL_THROTTLE = 30; // rebuild hull every N moves
const PRINT_PART  = 'PrintMesh'; // virtual part name

// Extract world-space vertex sample from visible instanced mesh up to instanceCount
function sampleInstancedMeshPts(mesh, maxCount, maxSamples){
  if(!mesh || maxCount <= 0) return [];
  const pts = [];
  const mat4 = new THREE.Matrix4();
  const v    = new THREE.Vector3();
  const worldMat = mesh.matrixWorld.clone();
  // Sample up to maxSamples instances evenly
  const step = Math.max(1, Math.floor(maxCount / maxSamples));
  const geo  = mesh.geometry;
  const pos  = geo.attributes.position;
  // We only need the two endpoints of each cylinder instance (y = ±0.5 in local geo)
  const localPts = [new THREE.Vector3(0,-0.5,0), new THREE.Vector3(0,0.5,0)];
  for(let i = 0; i < maxCount; i += step){
    mesh.getMatrixAt(i, mat4);
    for(const lp of localPts){
      v.copy(lp).applyMatrix4(mat4).applyMatrix4(worldMat);
      pts.push([v.x, v.y, v.z]);
    }
  }
  return pts;
}

function buildPrintHull(moveIdx){
  if(!mesh3 && !mesh5) return null;
  scene.updateMatrixWorld(true);
  const pts = [];
  if(mesh3 && cum3[moveIdx] > 0) pts.push(...sampleInstancedMeshPts(mesh3, cum3[moveIdx], 200));
  if(mesh5 && cum5[moveIdx] > 0) pts.push(...sampleInstancedMeshPts(mesh5, cum5[moveIdx], 200));
  if(pts.length < 4) return null;
  // Reduce to hull vertices to keep SAT fast
  try{
    const verts = pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]));
    const hull  = new THREE.ConvexHull();
    hull.setFromPoints(verts);
    const seen = new Set(); const hullPts = [];
    for(const face of hull.faces){
      let e = face.edge;
      do {
        const vv = e.head().point;
        const key = `${vv.x.toFixed(3)},${vv.y.toFixed(3)},${vv.z.toFixed(3)}`;
        if(!seen.has(key)){ seen.add(key); hullPts.push([vv.x,vv.y,vv.z]); }
        e = e.next;
      } while(e !== face.edge);
    }
    return hullPts.length >= 4 ? hullPts : pts;
  } catch(ex){ return pts; }
}

function bedPoseKey(){
  // A cheap string key representing bedGroup's current world pose.
  const q = bedGroup.quaternion, p = bedGroup.position;
  return `${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)},${q.w.toFixed(4)},${p.y.toFixed(3)}`;
}
let printHullPoseKey = '';

function getPrintHullPts(moveIdx){
  const curPoseKey = bedPoseKey();
  const poseChanged = curPoseKey !== printHullPoseKey;
  const stale = printHullPts === null
    || poseChanged
    || Math.abs(moveIdx - printHullIdx) >= (isPlaying ? PRINT_HULL_THROTTLE : 1);
  if(stale){
    printHullPts = buildPrintHull(moveIdx);
    printHullIdx = moveIdx;
    printHullPoseKey = curPoseKey;
  }
  return printHullPts;
}

function clearPrintHull(){
  printHullPts = null;
  printHullIdx = -1;
  printHullPoseKey = '';
}

// ── Per-move check called every playback step ────────────────────
// Returns true if any violation was found (so caller can pause).
// Also updates the violation panel in real-time.
function checkCurrentMove(){
  const prog = document.getElementById('prog');
  const pct  = parseInt(prog.value);
  const frac = pct / 10000;
  const moveIdx = Math.max(0, Math.floor(allMoves.length * frac) - 1);
  const m = allMoves[moveIdx];
  if(!m) return false;

  const L = getLimits();
  const axes = [
    {key:'x', label:'X', val:m.mx, min:L.xmin, max:L.xmax, unit:'mm'},
    {key:'y', label:'Y', val:m.my, min:L.ymin, max:L.ymax, unit:'mm'},
    {key:'z', label:'Z', val:m.mz, min:L.zmin, max:L.zmax, unit:'mm'},
    {key:'b', label:'B', val:m.mb, min:L.bmin, max:L.bmax, unit:'°'},
  ];

  const limViolations = [];
  for(const ax of axes){
    if(ax.val < ax.min) limViolations.push(`L${m.lineNum||'?'}: ${ax.label} ${ax.val.toFixed(2)}${ax.unit} &lt; ${ax.min}`);
    else if(ax.val > ax.max) limViolations.push(`L${m.lineNum||'?'}: ${ax.label} ${ax.val.toFixed(2)}${ax.unit} &gt; ${ax.max}`);
  }

  // Collision check for current machine pose
  let collViolations = [];
  clearAllPartColliding(); // reset tints each frame
  // ── Proxy vs proxy collision (machine parts) ────────────────────
  const collidingParts = new Set();
  if(collisionEnabled && collProxies.length && machineLoaded){
    machineGroup.visible = true;
    rootGroup.rotation.x = rotX; rootGroup.rotation.y = rotY;
    rootGroup.position.x = panX; rootGroup.position.y = panY;
    rootGroup.updateWorldMatrix(true, true);
    const proxiesByPart = {};
    for(const p of collProxies){
      if(!proxiesByPart[p.part]) proxiesByPart[p.part] = [];
      proxiesByPart[p.part].push(p);
    }
    const parts = Object.keys(proxiesByPart);
    for(let i=0; i<parts.length; i++){
      for(let j=i+1; j<parts.length; j++){
        if(!shouldCheck(parts[i], parts[j])) continue;
        for(const pa of proxiesByPart[parts[i]]){
          for(const pb of proxiesByPart[parts[j]]){
            const wA = getProxyWorldPts(pa), wB = getProxyWorldPts(pb);
            if(!wA||!wB) continue;
            if(pointCloudsOverlap(wA, wB)){
              const key = parts[i]+' ↔ '+parts[j];
              if(!collViolations.includes(key)) collViolations.push(key);
              setProxyColliding(pa.id, true);
              setProxyColliding(pb.id, true);
              collidingParts.add(parts[i]);
              collidingParts.add(parts[j]);
            }
          }
        }
      }
    }
    for(const part of Object.keys(partCollidingState)) setPartColliding(part, collidingParts.has(part));
    for(const part of collidingParts) setPartColliding(part, true);
    machineGroup.visible = document.getElementById('showMach').checked;
  }

  // ── Print mesh vs machine (experimental) — runs independently ───
  const printEnabled = document.getElementById('coll-print-enabled')?.checked ?? false;
  // During jog the prog bar may be at 0 with no G-code, so use the last move index
  // which covers all extrusion laid down so far.
  const printMoveIdx = (cum3[moveIdx] > 0 || cum5[moveIdx] > 0)
    ? moveIdx
    : Math.max(0, allMoves.length - 1);
  if(collisionEnabled && printEnabled && collProxies.length && (cum3[printMoveIdx] > 0 || cum5[printMoveIdx] > 0)){
    // Must sync rootGroup's orbit transform into matrixWorld before reading any world positions
    rootGroup.rotation.x = rotX; rootGroup.rotation.y = rotY;
    rootGroup.position.x = panX; rootGroup.position.y = panY;
    rootGroup.updateWorldMatrix(true, true);
    const hullPts = getPrintHullPts(printMoveIdx);
    if(hullPts && hullPts.length >= 4){
      for(const p of collProxies){
        if(!shouldCheck(PRINT_PART, p.part)) continue;
        const wB = getProxyWorldPts(p);
        if(!wB || !wB.length) continue;
        if(pointCloudsOverlap(hullPts, wB)){
          const key = 'PrintMesh ↔ ' + p.part;
          if(!collViolations.includes(key)) collViolations.push(key);
          setPartColliding(p.part, true);
        }
      }
    }
  }
  // Always restore parts no longer in any collision (machine-vs-machine or print hull)
  for(const part of Object.keys(partCollidingState)){
    if(!collidingParts.has(part) && !collViolations.some(k=>k.includes('↔ '+part))){
      setPartColliding(part, false);
    }
  }

  const hadViolation = limViolations.length > 0 || collViolations.length > 0;

  // Only update the panel when state actually changes (avoid per-frame DOM thrash)
  const limStr  = limViolations.join('|');
  const collStr = collViolations.join('|');
  if(limStr !== (_lastLimStr||'') || collStr !== (_lastCollStr||'')){
    _lastLimStr  = limStr;
    _lastCollStr = collStr;
    _limitViolations    = limViolations;
    _collisionViolations = collViolations;
    renderViolationPanel();
  }

  return hadViolation;
}
let _lastLimStr = '', _lastCollStr = '';

function checkLimits(){
  const L=getLimits();
  const seen={};
  _limitViolations=[];

  const axes=[
    {key:'x', label:'X', min:L.xmin, max:L.xmax, get:m=>m.mx},
    {key:'y', label:'Y', min:L.ymin, max:L.ymax, get:m=>m.my},
    {key:'z', label:'Z', min:L.zmin, max:L.zmax, get:m=>m.mz},
    {key:'b', label:'B', min:L.bmin, max:L.bmax, get:m=>m.mb},
  ];

  for(let i=0;i<allMoves.length;i++){
    const m=allMoves[i];
    for(const ax of axes){
      const v=ax.get(m);
      const unit=ax.key==='b'||ax.key==='c'?'°':'mm';
      if(v<ax.min){
        const k=ax.key+'-min';
        if(!seen[k]){ seen[k]=true; _limitViolations.push(`L${m.lineNum}: ${ax.label} ${v.toFixed(2)}${unit} &lt; ${ax.min}`); }
      }
      if(v>ax.max){
        const k=ax.key+'-max';
        if(!seen[k]){ seen[k]=true; _limitViolations.push(`L${m.lineNum}: ${ax.label} ${v.toFixed(2)}${unit} &gt; ${ax.max}`); }
      }
    }
  }
  renderViolationPanel();
}
document.getElementById('loadBtn').addEventListener('click',()=>document.getElementById('fi').click());
document.getElementById('fi').addEventListener('change',ev=>{
  const f=ev.target.files[0]; if(!f) return;
  document.getElementById('tb-fname').textContent=f.name;
  document.getElementById('tb-status').textContent='parsing…';
  const r=new FileReader();
  r.onload=e=>{cachedText=e.target.result; rebuildAll(true);};
  r.readAsText(f);
});
document.getElementById('viewMode').addEventListener('change',()=>rebuildAll(false));
document.getElementById('nozzle').addEventListener('change',()=>rebuildAll(false));
document.getElementById('sc').addEventListener('change',()=>rebuildAll(false));
['se','s5','st'].forEach(id=>document.getElementById(id).addEventListener('change',()=>rebuildAll(false)));

// Show/hide the simple buildplate and nozzle cone
function setSimpleSceneVisible(visible){
  if(buildplateMesh) buildplateMesh.visible = visible;
  const grid = bedGroup.getObjectByName('bp-grid');
  if(grid) grid.visible = visible;
  if(nozzleMesh) nozzleMesh.visible = visible;
  // also reflect in settings checkboxes so they stay in sync
  document.getElementById('s-bp-vis').checked = visible;
  document.getElementById('s-nz-vis').checked = visible;
}

// Machine toggle
document.getElementById('showMach').addEventListener('change', function(){
  document.getElementById('chip-mach').classList.toggle('on', this.checked);
  if(this.checked){
    const name=document.getElementById('machineSelect').value;
    if(name) loadMachine(name);
  } else {
    if(machineGroup.parent) machineGroup.visible=false;
    setSimpleSceneVisible(true);
  }
});

// Machine selector — "none" option reverts to simple scene
document.getElementById('machineSelect').addEventListener('change', function(){
  if(!this.value){
    // No machine selected — show simple bed/nozzle, hide machine
    disposeMachine();
    if(machineGroup.parent) machineGroup.visible=false;
    document.getElementById('showMach').checked=false;
    document.getElementById('chip-mach').classList.remove('on');
    setSimpleSceneVisible(true);
    return;
  }
  document.getElementById('showMach').checked=true;
  document.getElementById('chip-mach').classList.add('on');
  setSimpleSceneVisible(false);
  loadMachine(this.value);
});
document.getElementById('prog').addEventListener('input',e=>applyProgress(parseInt(e.target.value)));

// ── Playback ──────────────────────────────────────────────────────
let playInterval=null;
let isPlaying=false;

function setPlaying(val){
  isPlaying=val;
  const pbp=document.getElementById('pb-play'); pbp.textContent=val?'⏸':'▶'; pbp.classList.toggle('play-active',val);
  setJogEnabled(!val);
}

function stepForward(){
  const prog=document.getElementById('prog');
  const cur=parseInt(prog.value);
  if(cur>=10000){ stopPlayback(); checkCurrentMove(); return; }
  const speed=parseInt(document.getElementById('pb-speed').value);
  const next=Math.min(10000, cur+speed);
  prog.value=next;
  applyProgress(next);
  if(checkCurrentMove()) stopPlayback(); // pause on violation
}

function stopPlayback(){
  clearInterval(playInterval);
  playInterval=null;
  setPlaying(false);
  // Pre-warm print hull cache now, while bedGroup is still in its print pose.
  // This ensures isJogging checks have a valid hull even if jog starts immediately.
  if(mesh3 || mesh5){
    const prog = document.getElementById('prog');
    const moveIdx = Math.max(0, Math.floor(allMoves.length * parseInt(prog.value) / 10000) - 1);
    const pmIdx = (cum3[moveIdx] > 0 || cum5[moveIdx] > 0) ? moveIdx : Math.max(0, allMoves.length - 1);
    printHullPts = buildPrintHull(pmIdx);
    printHullIdx = pmIdx;
  }
}

function startPlayback(){
  if(playInterval) clearInterval(playInterval);
  setPlaying(true);
  playInterval=setInterval(stepForward, 16); // ~60fps
}

document.getElementById('pb-play').addEventListener('click',()=>{
  if(isPlaying){ stopPlayback(); }
  else {
    // If at end, restart from beginning
    if(parseInt(document.getElementById('prog').value)>=10000){
      document.getElementById('prog').value=0;
      applyProgress(0);
    }
    startPlayback();
  }
});
document.getElementById('pb-stop').addEventListener('click',()=>{
  stopPlayback();
  document.getElementById('prog').value=0;
  applyProgress(0);
});
document.getElementById('pb-start').addEventListener('click',()=>{ stopPlayback(); document.getElementById('prog').value=0; applyProgress(0); });
document.getElementById('pb-end').addEventListener('click',()=>{ stopPlayback(); document.getElementById('prog').value=10000; applyProgress(10000); });
document.getElementById('pb-speed').addEventListener('input',function(){
  document.getElementById('pb-speed-val').textContent=this.value+'×';
});

// ── Arrow key single-line navigation ─────────────────────────────
document.addEventListener('keydown', e=>{
  if(isPlaying) return;
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA') return;
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight') return;
  e.preventDefault();
  if(!allMoves.length) return;
  const prog = document.getElementById('prog');
  const cur = parseInt(prog.value);
  const curMove = Math.round(cur/10000 * allMoves.length);
  const nextMove = e.key==='ArrowRight'
    ? Math.min(allMoves.length, curMove+1)
    : Math.max(0, curMove-1);
  const newPct = Math.round(nextMove/allMoves.length * 10000);
  prog.value = newPct;
  applyProgress(newPct);
});

// ── Collision proxy system ────────────────────────────────────────
let collProxies = [];
let proxyMeshes = {}; // id → THREE.Mesh
let collisionEnabled = true;
let nextProxyId = 1;
let selectedPart = null; // currently selected machine part for proxy assignment
let partHighlights = {}; // part name → original materials

// ── Collision groups ──────────────────────────────────────────────
// Group 0 = never check (Frame, static)
// Group 1 = toolhead side (X, Y)
// Group 2 = bed side (Z, B, C)
// Only proxies from DIFFERENT non-zero groups are checked.
const DEFAULT_GROUPS = {Frame:0, Z:2, B:2, C:2, Y:1, X:1, PrintMesh:2};
let partGroups = {...DEFAULT_GROUPS};

function shouldCheck(a, b){
  const ga = partGroups[a] ?? 1;
  const gb = partGroups[b] ?? 1;
  if(ga===0 || gb===0) return false;
  return ga !== gb;
}

// Solid transparent proxy mesh — supports box, cylinder, sphere, hull
function makeProxyMesh(proxy, colliding=false){
  let geo;
  if(proxy.type==='hull' && proxy.hullPoints){
    try{
      const pts = proxy.hullPoints.map(p=>new THREE.Vector3(p[0],p[1],p[2]));
      geo = new THREE.ConvexGeometry(pts);
    } catch(e){ geo = new THREE.SphereGeometry(10,8,6); } // fallback
  } else if(proxy.type==='sphere'){
    geo=new THREE.SphereGeometry(proxy.sx,16,10);
  } else if(proxy.type==='cylinder'){
    geo=new THREE.CylinderGeometry(proxy.sx,proxy.sx,proxy.sy,16,1);
  } else {
    geo=new THREE.BoxGeometry(proxy.sx,proxy.sy,proxy.sz);
  }
  const col = colliding ? 0xff2222 : 0xff4444;
  const mat = new THREE.MeshLambertMaterial({color:col, transparent:true, opacity:0.22, side:THREE.DoubleSide, depthWrite:false});
  const wireMat = new THREE.LineBasicMaterial({color:colliding?0xff0000:0xff6666, transparent:true, opacity:0.5});
  const wireGeo = new THREE.WireframeGeometry(geo);
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo,mat));
  grp.add(new THREE.LineSegments(wireGeo,wireMat));
  grp.position.set(proxy.ox||0, proxy.oy||0, proxy.oz||0);
  return grp;
}

// Compute concavity of a point set relative to its convex hull
// Returns the plane that best splits concave regions
function findBestSplitPlane(pts, hullGeo){
  if(!hullGeo || !hullGeo.attributes.position) return null;

  // Get hull face normals and centroids
  const hullPos = hullGeo.attributes.position;
  const hullNorm = hullGeo.attributes.normal;
  if(!hullNorm) return null;

  // Find points most "inside" the hull — furthest from any hull face
  let maxConcavity = 0;
  let worstPt = null;

  const faceCount = hullPos.count / 3;
  const v = new THREE.Vector3();

  for(const p of pts){
    v.set(p[0],p[1],p[2]);
    // Find min distance to any hull face (negative = inside)
    let minDist = Infinity;
    for(let f=0;f<faceCount;f++){
      const nx = hullNorm.getX(f*3);
      const ny = hullNorm.getY(f*3);
      const nz = hullNorm.getZ(f*3);
      const fx = hullPos.getX(f*3);
      const fy = hullPos.getY(f*3);
      const fz = hullPos.getZ(f*3);
      const d = (v.x-fx)*nx + (v.y-fy)*ny + (v.z-fz)*nz;
      if(d < minDist) minDist = d;
    }
    if(-minDist > maxConcavity){ maxConcavity = -minDist; worstPt = p; }
  }

  if(maxConcavity < 0.5 || !worstPt) return null; // convex enough, no split needed

  // Try splitting along each principal axis through the centroid
  let cx=0,cy=0,cz=0;
  for(const p of pts){ cx+=p[0];cy+=p[1];cz+=p[2]; }
  cx/=pts.length; cy/=pts.length; cz/=pts.length;

  // Try 3 axis-aligned planes + 3 diagonal planes through centroid
  const candidates = [
    [1,0,0,cx], [0,1,0,cy], [0,0,1,cz],
    [1,1,0,(cx+cy)/2], [1,0,1,(cx+cz)/2], [0,1,1,(cy+cz)/2]
  ];

  let bestScore = -1, bestPlane = null;
  for(const [nx,ny,nz,d] of candidates){
    const len = Math.sqrt(nx*nx+ny*ny+nz*nz);
    let nPos=0, nNeg=0;
    for(const p of pts){
      const side = (p[0]*nx+p[1]*ny+p[2]*nz)/len - d/len;
      if(side >= 0) nPos++; else nNeg++;
    }
    // Score: prefer balanced splits
    const balance = 1 - Math.abs(nPos-nNeg)/pts.length;
    if(balance > bestScore){ bestScore=balance; bestPlane=[nx/len,ny/len,nz/len,d/len]; }
  }
  return bestPlane;
}

// Split point cloud by plane [nx,ny,nz,d] → [side>=0, side<0]
function splitByPlane(pts, plane){
  const [nx,ny,nz,d] = plane;
  const pos=[], neg=[];
  for(const p of pts){
    if(p[0]*nx+p[1]*ny+p[2]*nz >= d) pos.push(p); else neg.push(p);
  }
  return [pos, neg];
}

// Build a convex hull geometry from points, returns null if degenerate
function buildHullGeo(pts){
  if(pts.length < 4) return null;
  try{
    const verts = pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]));
    return new THREE.ConvexGeometry(verts);
  }catch(e){ return null; }
}

// Auto-decompose a point cloud into 1 or 2 convex hulls
// Returns array of point arrays (1 or 2 groups)
function decomposeToHulls(pts, concavityThreshold=1.0){
  if(pts.length < 4) return [pts];

  // Build initial hull and check concavity
  const hullGeo = buildHullGeo(pts);
  if(!hullGeo) return [pts];

  const plane = findBestSplitPlane(pts, hullGeo);
  if(!plane) return [pts]; // already convex enough

  const [posGroup, negGroup] = splitByPlane(pts, plane);

  // Only split if both groups are large enough for a hull
  if(posGroup.length < 4 || negGroup.length < 4) return [pts];

  return [posGroup, negGroup];
}

// Extract only convex hull surface vertices from a point cloud
// Reduces storage from 800+ points to typically 30-80 unique hull verts
function extractHullVertices(pts){
  if(pts.length < 4) return pts;
  try{
    const verts = pts.map(p => new THREE.Vector3(p[0],p[1],p[2]));
    const hull = new THREE.ConvexHull();
    hull.setFromPoints(verts);
    // Collect unique vertices from hull faces
    const seen = new Set();
    const result = [];
    for(const face of hull.faces){
      let edge = face.edge;
      do {
        const v = edge.head().point;
        const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
        if(!seen.has(key)){
          seen.add(key);
        result.push([
          Math.round(v.x*100)/100,
          Math.round(v.y*100)/100,
          Math.round(v.z*100)/100
        ]);
        }
        edge = edge.next;
      } while(edge !== face.edge);
    }
    return result.length >= 4 ? result : pts;
  } catch(e){
    return pts; // fallback to all points if hull fails
  }
}

// Auto-generate convex hull proxies for all loaded machine parts
function autoGenerateHulls(){
  if(!machineLoaded){ document.getElementById('coll-status').textContent='Load a machine first'; return; }
  document.getElementById('coll-status').textContent='Generating hulls…';

  // Clear existing hull proxies (keep manual ones)
  collProxies = collProxies.filter(p=>p.type!=='hull');

  // Skip Frame (complex) and only use direct mesh children (not grandchildren = child parts)
  const SKIP_AUTO = new Set(['Frame']);
  let count=0;

  rootGroup.updateMatrixWorld(true);

  for(const partName of MACHINE_PARTS){
    if(SKIP_AUTO.has(partName)) continue;
    const grp = mGrp[partName]; if(!grp) continue;

    const allPts=[];
    for(const child of grp.children){
      if(!child.isMesh) continue;
      const pos=child.geometry?.attributes?.position; if(!pos) continue;
      const total=pos.count;
      const step=Math.max(1,Math.floor(total/800));
      const v=new THREE.Vector3();
      // Apply only the child's LOCAL matrix (e.g. rotation.x=-PI/2) to get part-group local coords
      const localMat=child.matrix;
      for(let i=0;i<total;i+=step){
        v.set(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(localMat);
        allPts.push([v.x,v.y,v.z]);
      }
      // Also include extreme points
      for(let i=0;i<total;i++){
        v.set(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(localMat);
        if(i===0||v.x<allPts[0][0]) allPts.push([v.x,v.y,v.z]);
      }
    }

    if(allPts.length<4) continue;

    // Try to decompose into 2 hulls for concave parts
    const groups = decomposeToHulls(allPts);
    for(let gi=0;gi<groups.length;gi++){
      const grp2=groups[gi];
      if(grp2.length<4) continue;
      // Extract only convex hull surface vertices — drastically reduces storage
      const hullVerts = extractHullVertices(grp2);
      collProxies.push({
        id:nextProxyId++,
        part:partName,
        type:'hull',
        hullPoints: hullVerts,
        sx:0,sy:0,sz:0,ox:0,oy:0,oz:0,
        label: groups.length>1 ? `${partName} hull ${gi+1}` : partName
      });
      count++;
    }
  }

  rebuildProxyWireframes();
  renderProxyList();
  document.getElementById('coll-status').textContent=`Generated ${count} convex hull proxies`;
}

// Proxies visible only when: modal is open OR "Show proxies" checkbox explicitly checked
function shouldShowProxies(){
  return collConfigOpen || (document.getElementById('coll-show-proxies')?.checked ?? false);
}

function rebuildProxyWireframes(){
  Object.values(proxyMeshes).forEach(m=>{if(m.parent)m.parent.remove(m);});
  proxyMeshes={};
  const show = shouldShowProxies();
  for(const proxy of collProxies){
    const grp=mGrp[proxy.part]; if(!grp) continue;
    const mesh=makeProxyMesh(proxy);
    mesh.visible=show;
    grp.add(mesh);
    proxyMeshes[proxy.id]=mesh;
  }
}

function setProxyWireframesVisible(v){
  Object.values(proxyMeshes).forEach(m=>m.visible=v);
}


function setProxyColliding(id, colliding){
  const mesh=proxyMeshes[id]; if(!mesh) return;
  mesh.traverse(c=>{
    if(c.isMesh) c.material.color.set(colliding?0xff2222:0xff4444);
    if(c.isLineSegments) c.material.color.set(colliding?0xff0000:0xff6666);
  });
  // Also tint the actual machine part this proxy belongs to
  const proxy = collProxies.find(p=>p.id===id);
  if(proxy) setPartColliding(proxy.part, colliding);
}

// ── Machine part collision highlight ─────────────────────────────
const partCollidingState = {};  // partName → bool
const partOrigMats = {};        // partName → [{mesh, origEmissive, origEI}]

function setPartColliding(partName, colliding){
  if(partCollidingState[partName] === colliding) return;
  partCollidingState[partName] = colliding;
  const grp = mGrp[partName]; if(!grp) return;
  if(colliding){
    if(!partOrigMats[partName]){
      const saved = [];
      grp.traverse(c=>{
        if(!c.isMesh || c.userData.isProxyMesh) return;
        c.material = c.material.clone();
        saved.push({mesh:c, origEmissive:c.material.emissive?.clone()||new THREE.Color(0), origEI:c.material.emissiveIntensity||0});
      });
      partOrigMats[partName] = saved;
    }
    grp.traverse(c=>{
      if(!c.isMesh || c.userData.isProxyMesh) return;
      c.material.emissive = new THREE.Color(0xcc0000);
      c.material.emissiveIntensity = 0.7;
    });
  } else {
    const saved = partOrigMats[partName];
    if(saved){
      for(const {mesh,origEmissive,origEI} of saved){
        if(mesh.material){
          mesh.material.emissive.copy(origEmissive);
          mesh.material.emissiveIntensity = origEI;
        }
      }
      delete partOrigMats[partName];
    }
  }
}

function clearAllPartColliding(){
  for(const part of Object.keys(partCollidingState)){
    if(partCollidingState[part]) setPartColliding(part, false);
  }
}

// ── Part selection via raycasting ─────────────────────────────────
let collConfigOpen = false;
const raycaster = new THREE.Raycaster();
const mouse2D = new THREE.Vector2();

// Build flat list of all meshes in machineGroup with their part name
function getMachineRayTargets(){
  const targets=[];
  for(const [partName, grp] of Object.entries(mGrp)){
    grp.traverse(c=>{
      if(c.isMesh){ c.userData.partName=partName; targets.push(c); }
    });
  }
  return targets;
}

function highlightPart(partName){
  // Clear previous highlight
  clearPartHighlight();
  selectedPart=partName;
  if(!mGrp[partName]) return;
  mGrp[partName].traverse(c=>{
    if(!c.isMesh||c.userData.isProxyMesh) return;
    partHighlights[c.uuid]={mesh:c, origColor:c.material.color.clone(), origEmissive:c.material.emissive?.clone()};
    c.material=c.material.clone();
    c.material.emissive=new THREE.Color(0x224488);
    c.material.emissiveIntensity=0.6;
  });
  document.getElementById('coll-selected-part').textContent='Selected: '+partName;
}

function clearPartHighlight(){
  for(const {mesh,origColor,origEmissive} of Object.values(partHighlights)){
    if(mesh.material){
      mesh.material.color.copy(origColor);
      if(origEmissive) mesh.material.emissive.copy(origEmissive);
      else if(mesh.material.emissive) mesh.material.emissive.set(0x000000);
      mesh.material.emissiveIntensity=0;
    }
  }
  partHighlights={};
  selectedPart=null;
  document.getElementById('coll-selected-part').textContent='Click a machine part to select';
}

// Canvas click — only raycast when coll config is open AND not dragging
let mouseDownPos={x:0,y:0};
cvWrap.addEventListener('mousedown',e=>{mouseDownPos={x:e.clientX,y:e.clientY};});
cvWrap.addEventListener('click',e=>{
  if(!collConfigOpen||!machineLoaded) return;
  const dx=Math.abs(e.clientX-mouseDownPos.x), dy=Math.abs(e.clientY-mouseDownPos.y);
  if(dx>4||dy>4) return;

  // Don't deselect if clicking a gizmo handle
  if(getGizmoHit(e)) return;

  // Check if clicking a proxy mesh
  const proxyId=getProxyHit(e);
  if(proxyId!==null){ selectProxy(proxyId); return; }

  // Try to select a machine part
  const rect=cvWrap.getBoundingClientRect();
  mouse2D.x=((e.clientX-rect.left)/rect.width)*2-1;
  mouse2D.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse2D,camera);
  const targets=getMachineRayTargets();
  const hits=raycaster.intersectObjects(targets,false);
  if(hits.length>0){
    const partName=hits[0].object.userData.partName;
    if(partName) highlightPart(partName);
  } else {
    clearPartHighlight();
    selectProxy(null);
  }
});

function rebuildProxyWireframes(){
  // Remove old
  Object.values(proxyMeshes).forEach(m=>{
    if(m.parent) m.parent.remove(m);
    m.traverse(c=>{ if(c.geometry) c.geometry.dispose(); });
  });
  proxyMeshes={};
  const show = shouldShowProxies();
  for(const proxy of collProxies){
    const grp = mGrp[proxy.part];
    if(!grp) continue;
    const mesh = makeProxyMesh(proxy);
    mesh.visible = show;
    grp.add(mesh);
    proxyMeshes[proxy.id] = mesh;
  }
}

function setProxyWireframesVisible(v){
  Object.values(proxyMeshes).forEach(m=>m.visible=v);
}

function getProxyWorldPts(proxy){
  const grp=mGrp[proxy.part]; if(!grp) return null;
  const v=new THREE.Vector3();
  const mat=grp.matrixWorld; // needed by ALL branches, not just hull

  if(proxy.type==='hull'&&proxy.hullPoints){
    // Points are in part-group local space — apply group's world matrix for current kinematics
    return proxy.hullPoints.map(p=>{ v.set(p[0],p[1],p[2]).applyMatrix4(mat); return [v.x,v.y,v.z]; });
  }
  const cx=proxy.ox||0,cy=proxy.oy||0,cz=proxy.oz||0;
  const pts=[];
  if(proxy.type==='sphere'){
    const r=proxy.sx;
    for(let i=0;i<8;i++) for(let j=0;j<6;j++){
      const th=i/8*Math.PI*2,ph=j/6*Math.PI-Math.PI/2;
      pts.push([cx+r*Math.cos(ph)*Math.cos(th),cy+r*Math.sin(ph),cz+r*Math.cos(ph)*Math.sin(th)]);
    }
  } else if(proxy.type==='cylinder'){
    const r=proxy.sx,h=proxy.sy/2;
    for(let i=0;i<10;i++){
      const th=i/10*Math.PI*2;
      pts.push([cx+r*Math.cos(th),cy+h,cz+r*Math.sin(th)]);
      pts.push([cx+r*Math.cos(th),cy-h,cz+r*Math.sin(th)]);
    }
    pts.push([cx,cy+h,cz]);pts.push([cx,cy-h,cz]);
  } else {
    const hx=proxy.sx/2,hy=proxy.sy/2,hz=proxy.sz/2;
    for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1])
      pts.push([cx+sx*hx,cy+sy*hy,cz+sz*hz]);
  }
  return pts.map(p=>{ v.set(p[0],p[1],p[2]).applyMatrix4(mat); return [v.x,v.y,v.z]; });
}

function gjkSupport(pts,d){
  let best=-Infinity,bx=0,by=0,bz=0;
  for(const p of pts){
    const dot=p[0]*d[0]+p[1]*d[1]+p[2]*d[2];
    if(dot>best){best=dot;bx=p[0];by=p[1];bz=p[2];}
  }
  return [bx,by,bz];
}

// Compute convex hull face normals from a point cloud via THREE.ConvexHull.
// Returns array of [nx,ny,nz] unit vectors (deduplicated by direction).
function hullFaceNormals(pts){
  if(pts.length < 4) return [];
  try {
    const verts = pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]));
    const hull = new THREE.ConvexHull();
    hull.setFromPoints(verts);
    const seen = new Set();
    const normals = [];
    for(const face of hull.faces){
      const n = face.normal;
      // Snap to 4 decimal places to deduplicate parallel faces
      const key = `${n.x.toFixed(4)},${n.y.toFixed(4)},${n.z.toFixed(4)}`;
      if(!seen.has(key)){
        seen.add(key);
        normals.push([n.x, n.y, n.z]);
      }
    }
    return normals;
  } catch(e){ return []; }
}

// Project point cloud onto axis, return [min, max]
function projectPts(pts, nx, ny, nz){
  let mn=Infinity, mx=-Infinity;
  for(const p of pts){
    const d = p[0]*nx + p[1]*ny + p[2]*nz;
    if(d < mn) mn = d;
    if(d > mx) mx = d;
  }
  return [mn, mx];
}

// True SAT overlap test using convex hull face normals of both shapes
// + 3 axis-aligned axes as fallback for degenerate/flat clouds.
// Only returns true when the hulls actually interpenetrate — no ghost collisions.
function pointCloudsOverlap(ptsA, ptsB){
  if(!ptsA||!ptsB||!ptsA.length||!ptsB.length) return false;

  // Quick AABB pre-check (cheap early-out)
  let axMin=Infinity,axMax=-Infinity,bxMin=Infinity,bxMax=-Infinity;
  let ayMin=Infinity,ayMax=-Infinity,byMin=Infinity,byMax=-Infinity;
  let azMin=Infinity,azMax=-Infinity,bzMin=Infinity,bzMax=-Infinity;
  for(const p of ptsA){
    if(p[0]<axMin)axMin=p[0]; if(p[0]>axMax)axMax=p[0];
    if(p[1]<ayMin)ayMin=p[1]; if(p[1]>ayMax)ayMax=p[1];
    if(p[2]<azMin)azMin=p[2]; if(p[2]>azMax)azMax=p[2];
  }
  for(const p of ptsB){
    if(p[0]<bxMin)bxMin=p[0]; if(p[0]>bxMax)bxMax=p[0];
    if(p[1]<byMin)byMin=p[1]; if(p[1]>byMax)byMax=p[1];
    if(p[2]<bzMin)bzMin=p[2]; if(p[2]>bzMax)bzMax=p[2];
  }
  if(axMax<bxMin||bxMax<axMin) return false;
  if(ayMax<byMin||byMax<ayMin) return false;
  if(azMax<bzMin||bzMax<azMin) return false;

  // Build SAT axes: face normals from both hulls + 3 axis-aligned fallbacks
  const axesA = hullFaceNormals(ptsA);
  const axesB = hullFaceNormals(ptsB);
  const axes  = axesA.length && axesB.length
    ? [...axesA, ...axesB]
    : [[1,0,0],[0,1,0],[0,0,1]]; // fallback if hull fails (flat/degenerate)

  // Also add cross products of representative edges between the two hulls
  // (needed for edge-edge separation, e.g. two rotated boxes)
  if(axesA.length && axesB.length){
    for(const a of axesA){
      for(const b of axesB){
        const cx = a[1]*b[2] - a[2]*b[1];
        const cy = a[2]*b[0] - a[0]*b[2];
        const cz = a[0]*b[1] - a[1]*b[0];
        const len = Math.sqrt(cx*cx+cy*cy+cz*cz);
        if(len > 1e-6) axes.push([cx/len, cy/len, cz/len]);
      }
    }
  }

  for(const [nx,ny,nz] of axes){
    const [aMin,aMax] = projectPts(ptsA, nx, ny, nz);
    const [bMin,bMax] = projectPts(ptsB, nx, ny, nz);
    if(aMax < bMin || bMax < aMin) return false; // separating axis found
  }
  return true; // no separating axis — genuinely overlapping
}

function gjkOverlap(ptsA,ptsB){ return pointCloudsOverlap(ptsA,ptsB); }

function checkCollisions(){
  if(!collisionEnabled||!collProxies.length||!machineLoaded){
    _collisionViolations=[];
    renderViolationPanel();
    return;
  }
  // Force matrix update even on invisible objects
  machineGroup.visible=true;
  scene.updateMatrixWorld(true);

  const violations=[];
  const loopDebug=[];
  for(const proxy of collProxies) setProxyColliding(proxy.id,false);
  const proxiesByPart={};
  for(const p of collProxies){
    if(!proxiesByPart[p.part]) proxiesByPart[p.part]=[];
    proxiesByPart[p.part].push(p);
  }
  const parts=Object.keys(proxiesByPart);
  for(let i=0;i<parts.length;i++){
    for(let j=i+1;j<parts.length;j++){
      const pA=parts[i],pB=parts[j];
      const chk=shouldCheck(pA,pB);
      if(!chk) continue;
      for(const pa of proxiesByPart[pA]){
        for(const pb of proxiesByPart[pB]){
          scene.updateMatrixWorld(true);
          const wA=getProxyWorldPts(pa),wB=getProxyWorldPts(pb);
          if(!wA||!wB||!wA.length||!wB.length) continue;
          const hit=pointCloudsOverlap(wA,wB);
          loopDebug.push(`${pA}vs${pB}:${hit?'HIT':'miss'}`);
          if(hit){
            const key=pA+' <-> '+pB;
            if(!violations.includes(key)) violations.push(key);
            setProxyColliding(pa.id,true);
            setProxyColliding(pb.id,true);
          }
        }
      }
    }
  }
  // Restore machine visibility to user setting
  machineGroup.visible=document.getElementById('showMach').checked;

  // Update coll-status label inside the config modal
  document.getElementById('coll-status').textContent=
    violations.length?violations.length+' collision(s) detected':'No collisions detected';

  // Feed unified panel
  _collisionViolations = violations.map(v => v.replace(/ <-> /, ' ↔ '));
  renderViolationPanel();
}

// ── Proxy Transform Gizmo ─────────────────────────────────────────
