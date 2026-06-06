// ── ui.js ──────────────────────────────────────────
let _limitViolations   = []; // strings
let _collisionViolations = []; // strings

function renderViolationPanel(){
  const panel = document.getElementById('coll-report-panel');
  const badge = document.getElementById('coll-report-badge');
  const report = document.getElementById('coll-report');

  const hasCollisions = _collisionViolations.length > 0;
  const hasLimits     = _limitViolations.length > 0;
  const hasAny        = hasCollisions || hasLimits;

  panel.classList.toggle('alert', hasAny);
  badge.textContent = hasAny
    ? (hasCollisions && hasLimits ? `${_collisionViolations.length} COLL · ${_limitViolations.length} LIM`
      : hasCollisions ? `${_collisionViolations.length} COLLISION${_collisionViolations.length>1?'S':''}`
      : `${_limitViolations.length} LIMIT${_limitViolations.length>1?'S':''}`)
    : 'OK';

  if(!hasAny){
    report.innerHTML = '<span class="ok-msg">No violations</span>';
    return;
  }
  const rows = [
    ..._collisionViolations.map(v=>`<div class="coll-item">${v}</div>`),
    ..._limitViolations.map(v=>`<div class="limit-item">${v}</div>`),
  ];
  report.innerHTML = rows.join('');
}


function getLimits(){
  return {
    xmin: parseFloat(document.getElementById('lim-xmin').value),
    xmax: parseFloat(document.getElementById('lim-xmax').value),
    ymin: parseFloat(document.getElementById('lim-ymin').value),
    ymax: parseFloat(document.getElementById('lim-ymax').value),
    zmin: parseFloat(document.getElementById('lim-zmin').value),
    zmax: parseFloat(document.getElementById('lim-zmax').value),
    bmin: parseFloat(document.getElementById('lim-bmin').value),
    bmax: parseFloat(document.getElementById('lim-bmax').value),
    cmin: parseFloat(document.getElementById('lim-cmin').value),
    cmax: parseFloat(document.getElementById('lim-cmax').value),
  };
}

// ── Experimental: print mesh convex hull collision (group 3) ────
let printHullPts   = null;  // cached world-space hull points for current moveIdx
