// ── main.js — startup ─────────────────────────────────────────────
// All scripts are loaded before this runs (bottom of <body>).
// This is the single entry point that kicks everything off.

// Lock orientation on mobile
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('landscape').catch(() => {});
}

// Fullscreen toggle
(function () {
  const btn = document.getElementById('fsBtn');
  if (!btn) return;
  function isFS() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function updateBtn() { btn.title = isFS() ? 'Exit fullscreen' : 'Enter fullscreen'; btn.classList.toggle('active', isFS()); }
  btn.addEventListener('click', () => {
    const el = document.documentElement;
    if (!isFS()) (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el).catch(() => {});
    else (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document).catch(() => {});
  });
  document.addEventListener('fullscreenchange', updateBtn);
  document.addEventListener('webkitfullscreenchange', updateBtn);
  updateBtn();
})();

// Boot sequence
initThree();
initStaticSceneLate();
fetchMachineList();
buildJogPanel();
setJogEnabled(false);
