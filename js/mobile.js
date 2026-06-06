// ── mobile.js ────────────────────────────────────────────
// ── Mobile drawer system ──────────────────────────────────────────
(function(){
  const isMob = () => window.innerWidth <= 900;
  let activeDrawer = null;

  window.mobDrawer = function(name) {
    if(!isMob()) return;
    const drawer = document.getElementById('mob-drawer-' + name);
    if(!drawer) return;

    // Same button again = close
    if(activeDrawer === name) { mobDrawerClose(); return; }

    // Switch to new panel
    document.querySelectorAll('.mob-drawer').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.mob-dock-btn').forEach(b => b.classList.remove('active'));

    drawer.classList.add('open');
    const btn = document.getElementById('mdBtn-' + name);
    if(btn) btn.classList.add('active');
    activeDrawer = name;

    // Sync content when opening
    if(name === 'gcode') syncMobGcode();
    if(name === 'axes') syncMobAxes();
    if(name === 'info') syncMobInfo();
    if(name === 'coll') syncMobColl();
  };

  window.mobDrawerClose = function() {
    document.querySelectorAll('.mob-drawer').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.mob-dock-btn').forEach(b => b.classList.remove('active'));
    activeDrawer = null;
  };

  // ── Sync axis readouts to mobile drawer ──
  window.syncMobAxes = function() {
    const ids = ['x','y','z','b','c','e'];
    ids.forEach(id => {
      const src = document.getElementById('ax-' + id);
      const dst = document.getElementById('mob-ax-' + id);
      if(src && dst) dst.textContent = src.textContent;
      const bsrc = document.getElementById('ax-bar-' + id);
      const bdst = document.getElementById('mob-ax-bar-' + id);
      if(bsrc && bdst) bdst.style.width = bsrc.style.width;
    });
    const tl = document.getElementById('type-label');
    const mtl = document.getElementById('mob-type-label');
    if(tl && mtl) mtl.textContent = tl.textContent;
    const td = document.getElementById('type-dot');
    const mtd = document.getElementById('mob-type-dot');
    if(td && mtd) mtd.style.background = td.style.background;
  };

  // ── Sync stats/print state ──
  window.syncMobInfo = function() {
    const pairs = [['c3ax','mob-c3ax'],['c5ax','mob-c5ax'],['ctrav','mob-ctrav'],['ctot','mob-ctot'],
                   ['ps-pos','mob-ps-pos'],['ps-emode','mob-ps-emode'],['ps-fan','mob-ps-fan'],
                   ['ps-hotend','mob-ps-hotend'],['ps-bed','mob-ps-bed']];
    pairs.forEach(([src,dst]) => {
      const s = document.getElementById(src), d = document.getElementById(dst);
      if(s && d) { d.textContent = s.textContent; if(s.style.color) d.style.color = s.style.color; }
    });
  };

  // ── Sync g-code view ──
  window.syncMobGcode = function() {
    const src = document.getElementById('gcode-ctx');
    const dst = document.getElementById('mob-gcode-ctx');
    if(src && dst) { dst.innerHTML = src.innerHTML; dst.scrollTop = src.scrollTop; }
  };

  // ── Sync violations ──
  window.syncMobColl = function() {
    const src = document.getElementById('coll-report');
    const dst = document.getElementById('mob-coll-report');
    if(src && dst) dst.innerHTML = src.innerHTML;
  };

  // Patch updateAxisBars to also update mob axes when drawer open
  const _origUpdateAxisBars = window.updateAxisBars;
  if(_origUpdateAxisBars) {
    window.updateAxisBars = function(move) {
      _origUpdateAxisBars(move);
      if(activeDrawer === 'axes') syncMobAxes();
    };
  }

  // ── Patch renderViolationPanel to update dock alert dot + mob coll ──
  const _origRVP = window.renderViolationPanel;
  if(_origRVP) {
    window.renderViolationPanel = function() {
      _origRVP();
      const hasViol = (window._collisionViolations||[]).length > 0 || (window._limitViolations||[]).length > 0;
      const btn = document.getElementById('mdBtn-coll');
      if(btn) btn.classList.toggle('coll-alert', hasViol);
      if(activeDrawer === 'coll') syncMobColl();
    };
  }

  // ── Jog panel in drawer ──
  // Build jog sliders into mob-drawer-jog
  function buildMobJog() {
    if(!isMob()) return;
    if(typeof JOG_AXES === 'undefined') { setTimeout(buildMobJog, 200); return; }
    const container = document.getElementById('mob-jog-axes');
    if(!container) return;
    container.innerHTML = '';
    JOG_AXES.forEach(ax => {
      const div = document.createElement('div');
      div.className = 'jog-axis';
      div.innerHTML = `
        <div class="jog-axis-head">
          <span class="jog-axis-name" style="color:${ax.color}">${ax.label}</span>
          <span class="jog-axis-val" id="mob-jog-val-${ax.key}">${(jogPos||{})[ax.key]?.toFixed(ax.deg?1:3)??'0'} ${ax.unit}</span>
        </div>
        <input type="range" class="jog-slider" id="mob-jog-${ax.key}"
          min="${ax.min}" max="${ax.max}" step="${ax.step}" value="${(jogPos||{})[ax.key]??0}"
          oninput="onJogInput('${ax.key}', this.value); document.getElementById('jog-${ax.key}')&&(document.getElementById('jog-${ax.key}').value=this.value);">
        <div class="jog-range-labels"><span>${ax.min}${ax.unit}</span><span>${ax.max}${ax.unit}</span></div>
      `;
      container.appendChild(div);
    });
  }

  // Hook home button in drawer
  const homeBtn = document.getElementById('jog-home-btn-mob');
  if(homeBtn) homeBtn.addEventListener('click', () => {
    const origBtn = document.getElementById('jog-home-btn');
    if(origBtn) origBtn.click();
    // Sync sliders back
    if(typeof JOG_AXES !== 'undefined') {
      JOG_AXES.forEach(ax => {
        const sl = document.getElementById('mob-jog-' + ax.key);
        const vl = document.getElementById('mob-jog-val-' + ax.key);
        if(sl && vl && typeof jogPos !== 'undefined') {
          sl.value = jogPos[ax.key];
          vl.textContent = jogPos[ax.key].toFixed(ax.deg?1:3) + ' ' + ax.unit;
        }
      });
    }
  });

  // Patch onJogInput to also update mob jog val label
  const _origJog = window.onJogInput;
  if(_origJog) {
    window.onJogInput = function(key, val) {
      _origJog(key, val);
      const vl = document.getElementById('mob-jog-val-' + key);
      const ax = typeof JOG_AXES !== 'undefined' ? JOG_AXES.find(a=>a.key===key) : null;
      if(vl && ax) vl.textContent = parseFloat(val).toFixed(ax.deg?1:3) + ' ' + ax.unit;
    };
  }

  // ── Display drawer — mirror checkboxes/selects to the main hidden ones ──
  function mirrorToggle(mobId, mainId) {
    const mob = document.getElementById(mobId);
    const main = document.getElementById(mainId);
    if(!mob || !main) return;
    mob.checked = main.checked;
    mob.addEventListener('change', () => { main.checked = mob.checked; main.dispatchEvent(new Event('change')); });
    main.addEventListener('change', () => { mob.checked = main.checked; });
  }
  function mirrorChip(mobChipId, mainChipId, mobCbId, mainCbId) {
    const mobChip = document.getElementById(mobChipId);
    const mainCb = document.getElementById(mainCbId);
    if(!mobChip || !mainCb) return;
    mobChip.classList.toggle('on', mainCb.checked);
    const mobCb = document.getElementById(mobCbId);
    if(mobCb) {
      mobCb.checked = mainCb.checked;
      mobCb.addEventListener('change', () => {
        mainCb.checked = mobCb.checked;
        mainCb.dispatchEvent(new Event('change'));
        mobChip.classList.toggle('on', mobCb.checked);
      });
      mainCb.addEventListener('change', () => {
        mobCb.checked = mainCb.checked;
        mobChip.classList.toggle('on', mainCb.checked);
      });
    }
  }

  mirrorChip('mob-chip-se','chip-se','mob-se','se');
  mirrorChip('mob-chip-s5','chip-s5','mob-s5','s5');
  mirrorChip('mob-chip-st','chip-st','mob-st','st');
  mirrorChip('mob-chip-sc','chip-sc','mob-sc','sc');
  mirrorChip('mob-chip-mach','chip-mach','mob-showMach','showMach');

  // Mirror example select into mob drawer
  function syncExampleSelect() {
    const main = document.getElementById('exampleSelect');
    const mob  = document.getElementById('mob-exampleSelect');
    if(!main || !mob) return;
    mob.innerHTML = main.innerHTML;
    mob.value = main.value;
    mob.addEventListener('change', () => { main.value = mob.value; main.dispatchEvent(new Event('change')); mob.value = ''; });
    main.addEventListener('change', () => { mob.value = main.value; });
  }
  setTimeout(syncExampleSelect, 800);

  // Mirror machine select
  function syncMachSelects() {
    const main = document.getElementById('machineSelect');
    const mob = document.getElementById('mob-machineSelect');
    if(!main || !mob) return;
    mob.innerHTML = main.innerHTML;
    mob.value = main.value;
    mob.addEventListener('change', () => { main.value = mob.value; main.dispatchEvent(new Event('change')); });
    main.addEventListener('change', () => { mob.value = main.value; });
  }
  // Sync once machines are loaded (slight delay)
  setTimeout(syncMachSelects, 1500);

  // Mirror nozzle
  const mobNozzle = document.getElementById('mob-nozzle');
  const mainNozzle = document.getElementById('nozzle');
  if(mobNozzle && mainNozzle) {
    mobNozzle.value = mainNozzle.value;
    mobNozzle.addEventListener('input', () => { mainNozzle.value = mobNozzle.value; mainNozzle.dispatchEvent(new Event('input')); });
    mainNozzle.addEventListener('input', () => { mobNozzle.value = mainNozzle.value; });
  }

  // Build jog panel when JOG_AXES is ready
  setTimeout(buildMobJog, 400);

  // Periodic sync for open drawer
  setInterval(() => {
    if(!activeDrawer) return;
    if(activeDrawer === 'axes') syncMobAxes();
    if(activeDrawer === 'info') syncMobInfo();
    if(activeDrawer === 'gcode') syncMobGcode();
    if(activeDrawer === 'coll') syncMobColl();
  }, 250);
})();

