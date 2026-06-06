// ── machine-config.js ────────────────────────────────────────────
// ── machine.json export / import ──────────────────────────────────
function collectMachineConfig() {
  const val  = id => { const el=document.getElementById(id); return el ? (el.type==='checkbox' ? el.checked : el.value) : null; };
  const num  = id => parseFloat(val(id));
  const parts = ['Frame','Z','B','C','Y','X'];
  return {
    _version: 1,
    buildplate: {
      w: num('s-bp-w'), d: num('s-bp-d'), t: num('s-bp-t'),
      color: val('s-bp-col'), visible: val('s-bp-vis')
    },
    nozzle: {
      tip: num('s-nz-tip'), base: num('s-nz-base'),
      angle: num('s-nz-ang'), length: num('s-nz-len'),
      color: val('s-nz-col'), visible: val('s-nz-vis')
    },
    limits: {
      x: { min: num('lim-xmin'), max: num('lim-xmax') },
      y: { min: num('lim-ymin'), max: num('lim-ymax') },
      z: { min: num('lim-zmin'), max: num('lim-zmax') },
      b: { min: num('lim-bmin'), max: num('lim-bmax') },
      c: { min: num('lim-cmin'), max: num('lim-cmax') }
    },
    machineOffset: { x: num('mc-ox'), y: num('mc-oy'), z: num('mc-oz') },
    machineAppearance: Object.fromEntries(parts.map(p => [p, {
      color:   val('mc-'+p+'-col'),
      opacity: parseFloat(val('mc-'+p+'-op'))
    }])),
    nozzleDiameter: parseFloat(document.getElementById('nozzle')?.value || 0.4),
    collisionProxies: collProxies.map(({id:_,...rest}) => rest),
    collisionEnabled:    document.getElementById('coll-enabled')?.checked,
    collisionShowProxy:  document.getElementById('coll-show-proxies')?.checked,
    collisionPrintMesh:  document.getElementById('coll-print-enabled')?.checked,
  };
}

function applyMachineConfig(cfg) {
  if(!cfg || cfg._version !== 1) { alert('Invalid or incompatible machine.json'); return; }
  const set = (id, v) => { const el=document.getElementById(id); if(!el) return; el.type==='checkbox' ? el.checked=v : el.value=v; };

  const bp = cfg.buildplate || {};
  set('s-bp-w', bp.w); set('s-bp-d', bp.d); set('s-bp-t', bp.t);
  set('s-bp-col', bp.color); set('s-bp-vis', bp.visible);
  document.getElementById('chip-bp')?.classList.toggle('on', !!bp.visible);

  const nz = cfg.nozzle || {};
  set('s-nz-tip', nz.tip); set('s-nz-base', nz.base);
  set('s-nz-ang', nz.angle); set('s-nz-len', nz.length);
  set('s-nz-col', nz.color); set('s-nz-vis', nz.visible);
  document.getElementById('chip-nz')?.classList.toggle('on', !!nz.visible);

  const lim = cfg.limits || {};
  ['x','y','z','b','c'].forEach(ax => {
    if(lim[ax]) { set('lim-'+ax+'min', lim[ax].min); set('lim-'+ax+'max', lim[ax].max); }
  });

  const mo = cfg.machineOffset || {};
  set('mc-ox', mo.x ?? 0); set('mc-oy', mo.y ?? 0); set('mc-oz', mo.z ?? 0);

  const ma = cfg.machineAppearance || {};
  ['Frame','Z','B','C','Y','X'].forEach(p => {
    if(ma[p]) { set('mc-'+p+'-col', ma[p].color); set('mc-'+p+'-op', ma[p].opacity); }
  });

  if(cfg.nozzleDiameter != null) {
    set('nozzle', cfg.nozzleDiameter);
    set('mob-nozzle', cfg.nozzleDiameter);
  }

  if(cfg.collisionProxies) {
    collProxies = cfg.collisionProxies.map(p => ({...p, id: nextProxyId++}));
    rebuildProxyWireframes();
    renderProxyList();
  }
  if(cfg.collisionEnabled != null)   set('coll-enabled',     cfg.collisionEnabled);
  if(cfg.collisionShowProxy != null) set('coll-show-proxies', cfg.collisionShowProxy);
  if(cfg.collisionPrintMesh != null) set('coll-print-enabled', cfg.collisionPrintMesh);

  // Apply all the visual changes
  buildBuildplate();
  buildNozzle();
  checkLimits();
  applyMachineAppearance();
  updateMachine(0);
}

document.getElementById('s-export-btn').addEventListener('click', () => {
  const cfg = collectMachineConfig();
  const blob = new Blob([JSON.stringify(cfg, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'machine.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

document.getElementById('s-import-btn').addEventListener('click', () => {
  document.getElementById('s-import-file').click();
});

document.getElementById('s-import-file').addEventListener('change', function() {
  const file = this.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const cfg = JSON.parse(e.target.result);
      applyMachineConfig(cfg);
      document.getElementById('settings-overlay').classList.remove('open');
    } catch(err) {
      alert('Failed to parse machine.json: ' + err.message);
    }
  };
  reader.readAsText(file);
  this.value = '';
});

// ── Mobile drawer system ──────────────────────────────────────────
