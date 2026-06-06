// ── version.js ────────────────────────────────────────────────────
// Version check via fetch — runs on load and every 5 minutes

async function checkVersionViaFetch() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/Koaladeen/5-axis-3D-print-G-code-simulator/main/version.txt?nocache=' + Date.now());
    if (!res.ok) return;
    const remote = (await res.text()).trim();
    const local  = document.querySelector('meta[name="app-version"]')?.content || '';
    if (remote && local && remote !== local) showUpdateBanner();
  } catch(e) { /* offline — silent */ }
}

function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.add('visible');
}

// Wire dismiss/reload buttons
document.addEventListener('DOMContentLoaded', () => {
  const reloadBtn  = document.getElementById('ub-reload-btn');
  const dismissBtn = document.getElementById('ub-dismiss-btn');
  if (reloadBtn)  reloadBtn.addEventListener('click', () => { location.reload(true); });
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    const b = document.getElementById('update-banner');
    if (b) b.classList.remove('visible');
  });
  setTimeout(checkVersionViaFetch, 4000);
  setInterval(checkVersionViaFetch, 5 * 60 * 1000);
});
