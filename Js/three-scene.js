// ── three-scene.js ──────────────────────────────────────────
// ── Three.js ──────────────────────────────────────────────────────
const cv = document.getElementById('cv');
let renderer, scene, camera, rootGroup;
let mesh3=null, mesh5=null, lineT=null;
let rotX=-0.4, rotY=0.4, zoom=1, baseZ=200, panX=0, panY=0;
let isDrag=false, isRightDrag=false, lastMX=0, lastMY=0;

function initThree(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45,1,0.01,1e6);
  camera.position.set(0,0,200);
  renderer = new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0xb8bec6, 1);
  scene.add(new THREE.AmbientLight(0xffffff,0.75));
  const dl=new THREE.DirectionalLight(0xffffff,0.8); dl.position.set(1,2,1.5); scene.add(dl);
  const dl2=new THREE.DirectionalLight(0xc8d0d8,0.3); dl2.position.set(-1,-1,-1); scene.add(dl2);
  rootGroup = new THREE.Group(); scene.add(rootGroup);

  function resize(){
    const w=cv.parentElement.clientWidth, h=cv.parentElement.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(cv.parentElement);
  resize();

  (function loop(){
    requestAnimationFrame(loop);
    rootGroup.rotation.x=rotX; rootGroup.rotation.y=rotY;
    rootGroup.position.x=panX; rootGroup.position.y=panY;
    renderer.render(scene,camera);
  })();
}

function initStaticSceneLate(){
  // Called after initThree so scene exists
  initStaticScene();
}

const cvWrap = document.getElementById('cv-wrap');
cvWrap.addEventListener('contextmenu',e=>e.preventDefault());
cvWrap.addEventListener('mousedown',e=>{
  if(collConfigOpen){
    const ax = getGizmoHit(e);
    if(ax){
      gizmoDragging=true;
      gizmoAxis=ax;
      gizmoPrevEvent={clientX:e.clientX,clientY:e.clientY};
      const proxy=collProxies.find(p=>p.id===selectedProxyId);
      if(proxy) gizmoProxyStart={ox:proxy.ox||0,oy:proxy.oy||0,oz:proxy.oz||0};
      e.preventDefault();
      return; // don't start orbit
    }
  }
  isDrag=true;isRightDrag=e.button===2;lastMX=e.clientX;lastMY=e.clientY;cv.style.cursor='grabbing';
});
window.addEventListener('mouseup',()=>{isDrag=false;cv.style.cursor='grab';});
window.addEventListener('mousemove',e=>{
  if(!isDrag) return;
  const dx=e.clientX-lastMX, dy=e.clientY-lastMY;
  lastMX=e.clientX; lastMY=e.clientY;
  if(isRightDrag){panX+=dx*0.15*(baseZ*zoom/200); panY-=dy*0.15*(baseZ*zoom/200);}
  else{rotY+=dx*0.007; rotX+=dy*0.007;}
});
cvWrap.addEventListener('wheel',e=>{
  zoom*=e.deltaY>0?1.1:0.91; zoom=Math.max(0.02,Math.min(100,zoom));
  camera.position.z=baseZ*zoom; e.preventDefault();
},{passive:false});

// ── Touch events ──────────────────────────────────────────────────
let lastTouchDist=0, lastTouchMidX=0, lastTouchMidY=0, touchMode='';

cvWrap.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(e.touches.length===1){
    touchMode='orbit';
    lastMX=e.touches[0].clientX; lastMY=e.touches[0].clientY;
  } else if(e.touches.length===2){
    touchMode='pinch';
    const dx=e.touches[0].clientX-e.touches[1].clientX;
    const dy=e.touches[0].clientY-e.touches[1].clientY;
    lastTouchDist=Math.sqrt(dx*dx+dy*dy);
    lastTouchMidX=(e.touches[0].clientX+e.touches[1].clientX)/2;
    lastTouchMidY=(e.touches[0].clientY+e.touches[1].clientY)/2;
  }
},{passive:false});

cvWrap.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(touchMode==='orbit'&&e.touches.length===1){
    const dx=e.touches[0].clientX-lastMX, dy=e.touches[0].clientY-lastMY;
    lastMX=e.touches[0].clientX; lastMY=e.touches[0].clientY;
    rotY+=dx*0.007; rotX+=dy*0.007;
  } else if(touchMode==='pinch'&&e.touches.length===2){
    const dx=e.touches[0].clientX-e.touches[1].clientX;
    const dy=e.touches[0].clientY-e.touches[1].clientY;
    const dist=Math.sqrt(dx*dx+dy*dy);
    // Pinch zoom
    zoom*=lastTouchDist/dist;
    zoom=Math.max(0.02,Math.min(100,zoom));
    camera.position.z=baseZ*zoom;
    lastTouchDist=dist;
    // Two-finger pan
    const midX=(e.touches[0].clientX+e.touches[1].clientX)/2;
    const midY=(e.touches[0].clientY+e.touches[1].clientY)/2;
    panX+=(midX-lastTouchMidX)*0.15*(baseZ*zoom/200);
    panY-=(midY-lastTouchMidY)*0.15*(baseZ*zoom/200);
    lastTouchMidX=midX; lastTouchMidY=midY;
  }
},{passive:false});

cvWrap.addEventListener('touchend',e=>{
  if(e.touches.length===0) touchMode='';
  else if(e.touches.length===1){
    touchMode='orbit';
    lastMX=e.touches[0].clientX; lastMY=e.touches[0].clientY;
  }
},{passive:false});

// ── Chip toggles ──────────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip=>{
  const cb=chip.querySelector('input');
  chip.addEventListener('click',()=>{
    cb.checked=!cb.checked;
    chip.classList.toggle('on',cb.checked);
  });
});

