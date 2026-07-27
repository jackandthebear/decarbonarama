/* Decarbonarma — floating Home Energy Adviser launcher (bottom-left, site-wide).
   Injects a bubble that opens the adviser in an in-place slide-up panel (iframe,
   embed mode). Include with: <script defer src="/adviser-widget.js"></script> */
(function () {
  // Don't show inside an iframe, or on the adviser page itself.
  if (window.self !== window.top) return;
  if (/home-energy-adviser\.html/i.test(location.pathname)) return;
  if (document.getElementById('dca-launcher')) return;

  var GREEN = '#1f8a4c', GREEN_D = '#14622f';
  var Z = 2147483000;
  var open = false, loaded = false;

  var css = ''
    + '#dca-launcher{position:fixed;left:20px;bottom:20px;z-index:' + Z + ';display:flex;align-items:center;gap:9px;'
    + 'background:' + GREEN + ';color:#fff;border:none;border-radius:30px;padding:13px 18px 13px 15px;cursor:pointer;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;'
    + 'box-shadow:0 6px 22px rgba(0,0,0,.22);transition:transform .15s,background .15s;}'
    + '#dca-launcher:hover{background:' + GREEN_D + ';transform:translateY(-2px);}'
    + '#dca-launcher .ic{font-size:20px;line-height:1;}'
    + '#dca-launcher .dot{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,.3);}'
    + '#dca-panel{position:fixed;left:20px;bottom:20px;z-index:' + Z + ';width:390px;max-width:calc(100vw - 40px);'
    + 'height:640px;max-height:calc(100vh - 40px);background:#fff;border-radius:18px;overflow:hidden;display:none;'
    + 'flex-direction:column;box-shadow:0 12px 44px rgba(0,0,0,.28);opacity:0;transform:translateY(14px);transition:opacity .2s,transform .2s;}'
    + '#dca-panel.show{display:flex;opacity:1;transform:translateY(0);}'
    + '#dca-bar{background:' + GREEN + ';color:#fff;padding:13px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}'
    + '#dca-bar .av{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:17px;}'
    + '#dca-bar .t{font-weight:600;font-size:15px;line-height:1.1;}'
    + '#dca-bar .s{font-size:11px;opacity:.85;}'
    + '#dca-x{margin-left:auto;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px;}'
    + '#dca-x:hover{background:rgba(255,255,255,.15);}'
    + '#dca-frame{flex:1;border:none;width:100%;background:#fff;}'
    + '#dca-foot{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:10.5px;color:#86868b;'
    + 'text-align:center;padding:7px 10px;border-top:1px solid #ececf0;flex-shrink:0;}'
    + '@media (max-width:640px){#dca-panel{left:0;bottom:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0;}'
    + '#dca-launcher{left:14px;bottom:14px;padding:12px 16px 12px 13px;font-size:14px;}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var launcher = document.createElement('button');
  launcher.id = 'dca-launcher';
  launcher.setAttribute('aria-label', 'Open the Home Energy Adviser');
  launcher.innerHTML = '<span class="ic">🌿</span><span>Home Energy Adviser</span><span class="dot"></span>';

  var panel = document.createElement('div');
  panel.id = 'dca-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Home Energy Adviser');
  panel.innerHTML =
      '<div id="dca-bar"><span class="av">🌿</span><div><div class="t">Home Energy Adviser</div>'
    + '<div class="s">Plan · quote-check · grid help</div></div><button id="dca-x" aria-label="Close">×</button></div>'
    + '<iframe id="dca-frame" title="Home Energy Adviser" loading="lazy"></iframe>'
    + '<div id="dca-foot">Guidance only — not financial advice. Confirm with your DNO / MCS installer.</div>';

  function setOpen(v) {
    open = v;
    if (v && !loaded) {
      document.getElementById('dca-frame').src = '/home-energy-adviser.html?embed=1';
      loaded = true;
    }
    panel.classList.toggle('show', v);
    launcher.style.display = v ? 'none' : 'flex';
  }

  launcher.addEventListener('click', function () { setOpen(true); });
  document.addEventListener('click', function (e) { if (e.target && e.target.id === 'dca-x') setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false); });

  function mount() {
    document.body.appendChild(launcher);
    document.body.appendChild(panel);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
