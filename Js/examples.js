// ── examples.js ────────────────────────────────────────────
const REPO_API = 'https://api.github.com/repos/Koaladeen/5-axis-3D-print-G-code-simulator/contents/Example%20G-Codes';
const REPO_RAW = 'https://raw.githubusercontent.com/Koaladeen/5-axis-3D-print-G-code-simulator/main/Example%20G-Codes';

(async()=>{
  try{
    const res = await fetch(REPO_API);
    if(!res.ok) throw new Error('GitHub API '+res.status);
    const files = await res.json();
    const sel = document.getElementById('exampleSelect');
    files
      .filter(f=>f.type==='file' && /\.(gcode|nc|txt|g)$/i.test(f.name))
      .forEach(f=>{
        const opt=document.createElement('option');
        opt.value=f.name;
        opt.textContent=f.name;
        sel.appendChild(opt);
      });
  }catch(e){
    // CORS only works when hosted — silently hide dropdown when running locally
    const sel=document.getElementById('exampleSelect');
    sel.style.display='none';
    console.info('Example files unavailable (open via GitHub Pages to use):', e.message);
  }
})();

document.getElementById('exampleSelect').addEventListener('change', async function(){
  const name=this.value; if(!name) return;
  document.getElementById('tb-status').textContent='fetching…';
  document.getElementById('tb-fname').textContent=name;
  try{
    const res = await fetch(`${REPO_RAW}/${encodeURIComponent(name)}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    cachedText=await res.text();
    rebuildAll(true);
  }catch(e){
    document.getElementById('tb-status').textContent='fetch failed';
    console.error(e);
  }
  this.value='';
});
// ── Version check & service worker ───────────────────────────────
