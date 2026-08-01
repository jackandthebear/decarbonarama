/* Decarbonarma dark mode
 * Single shared script. Include on every page with:
 *   <script src="/dark-mode.js" defer></script>
 * (the tiny inline bootstrap in <head> prevents a white flash on load)
 *
 * How it works: inverts the whole page and rotates hues back 180deg, so
 * white -> black, dark text -> light text, and the brand green stays green.
 * Photos, logos and other raster media are inverted a second time so they
 * render normally.
 */
(function () {
  'use strict';

  var KEY = 'dm-pref';           // 'dark' | 'light'
  var CLASS = 'dm-dark';
  var root = document.documentElement;

  /* ---------- styles ---------- */
  var css = [
    /* the invert engine */
    'html.' + CLASS + ' { filter: invert(1) hue-rotate(180deg); background: #000 !important; }',
    'html.' + CLASS + ' body { background-color: #fff; }',

    /* put media back the right way round */
    'html.' + CLASS + ' img,',
    'html.' + CLASS + ' picture,',
    'html.' + CLASS + ' video,',
    'html.' + CLASS + ' iframe,',
    'html.' + CLASS + ' embed,',
    'html.' + CLASS + ' object,',
    'html.' + CLASS + ' canvas,',
    'html.' + CLASS + ' .dm-keep,',
    'html.' + CLASS + ' [data-dm-keep] {',
    '  filter: invert(1) hue-rotate(180deg);',
    '}',

    /* sections that were ALREADY dark in light mode (article heroes, banners,
       stat bands, chips) get inverted back so they stay dark rather than
       flipping to a glaring pastel */
    'html.' + CLASS + ' .dm-keep-dark { filter: invert(1) hue-rotate(180deg); }',
    'html.' + CLASS + ' .dm-keep-dark img,',
    'html.' + CLASS + ' .dm-keep-dark picture,',
    'html.' + CLASS + ' .dm-keep-dark video,',
    'html.' + CLASS + ' .dm-keep-dark iframe,',
    'html.' + CLASS + ' .dm-keep-dark embed,',
    'html.' + CLASS + ' .dm-keep-dark object,',
    'html.' + CLASS + ' .dm-keep-dark canvas { filter: none; }',

    /* manual escape hatches you can add to any element by hand */
    'html.' + CLASS + ' .dm-invert { filter: none !important; }',

    /* keep native form controls light-scheme: the page filter is what darkens
       them, so letting the OS darken them too would flip them back to light */
    'html.' + CLASS + ' { color-scheme: light; }',

    /* the toggle button */
    '.dm-toggle {',
    '  -webkit-appearance: none; appearance: none;',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  width: 32px; height: 32px; padding: 0; margin-left: 10px;',
    '  border: 1px solid rgba(0,0,0,0.12); border-radius: 980px;',
    '  background: rgba(0,0,0,0.04); color: inherit; cursor: pointer;',
    '  flex-shrink: 0; line-height: 0;',
    '  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;',
    '}',
    '.dm-toggle:hover { background: rgba(0,0,0,0.09); transform: scale(1.05); }',
    '.dm-toggle:focus-visible { outline: 2px solid #1f8a4c; outline-offset: 2px; }',
    '.dm-toggle svg { width: 17px; height: 17px; display: block; }',
    '.dm-toggle .dm-moon { display: block; }',
    '.dm-toggle .dm-sun { display: none; }',
    'html.' + CLASS + ' .dm-toggle .dm-moon { display: none; }',
    'html.' + CLASS + ' .dm-toggle .dm-sun { display: block; }',

    /* floating fallback for pages with no nav bar */
    '.dm-toggle.dm-float {',
    '  position: fixed; top: 12px; right: 14px; z-index: 2147483000;',
    '  margin: 0; width: 36px; height: 36px;',
    '  background: rgba(255,255,255,0.82);',
    '  -webkit-backdrop-filter: saturate(180%) blur(14px);',
    '  backdrop-filter: saturate(180%) blur(14px);',
    '  box-shadow: 0 1px 4px rgba(0,0,0,0.14);',
    '}',
    '@media print { .dm-toggle { display: none !important; } }'
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'dm-style';
  style.textContent = css;
  (document.head || root).appendChild(style);

  /* ---------- state ---------- */
  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }
  function prefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function isDark() {
    return root.classList.contains(CLASS);
  }
  function apply(dark) {
    root.classList.toggle(CLASS, dark);
    var btns = document.querySelectorAll('.dm-toggle');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', dark ? 'true' : 'false');
      btns[i].setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btns[i].setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', dark ? '#000000' : '#ffffff');
  }

  /* first visit follows the visitor's device setting; after that their choice wins */
  var pref = stored();
  apply(pref ? pref === 'dark' : prefersDark());

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) { if (!stored()) apply(e.matches); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------- keep already-dark sections dark ----------
   * The whole page gets inverted, which means anything that was already dark
   * (navy article heroes, the orange stat band, dark chips) would come out
   * pale. We find the outermost elements with a genuinely dark, opaque
   * background and invert them a second time, so they render as designed.
   */
  var DARK_LIMIT = 0.28;   // relative luminance below this counts as "dark"
  var scanned = false;

  function luminance(r, g, b) {
    var a = [r, g, b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function parseColour(str) {
    var m = String(str).match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/);
    if (!m) return null;
    return {
      lum: luminance(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])),
      alpha: m[4] === undefined ? 1 : parseFloat(m[4])
    };
  }

  function darkBackground(el) {
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) return false;      // hairlines, dividers

    var solid = parseColour(cs.backgroundColor);
    if (solid && solid.alpha >= 0.85) {
      return solid.lum <= DARK_LIMIT;
    }

    /* gradients: average the colour stops (banners and hero bands use these) */
    var bgi = cs.backgroundImage;
    if (bgi && bgi.indexOf('gradient') !== -1) {
      var stops = bgi.match(/rgba?\([^)]+\)/g) || [];
      var lums = [], opaque = true;
      for (var i = 0; i < stops.length; i++) {
        var c = parseColour(stops[i]);
        if (!c) continue;
        if (c.alpha < 0.85) { opaque = false; break; }
        lums.push(c.lum);
      }
      if (opaque && lums.length) {
        var avg = lums.reduce(function (a, b) { return a + b; }, 0) / lums.length;
        return avg <= DARK_LIMIT;
      }
    }
    return false;
  }

  function scan() {
    if (!document.body) return;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest('.dm-toggle')) continue;
      if (el.classList.contains('dm-invert') || el.classList.contains('dm-keep')) continue;
      if (el.classList.contains('dm-keep-dark')) continue;
      /* only the outermost dark box — inverting a parent already flips children */
      if (el.parentElement && el.parentElement.closest('.dm-keep-dark')) continue;
      try {
        if (darkBackground(el)) el.classList.add('dm-keep-dark');
      } catch (e) {}
    }
    scanned = true;
  }

  function ensureScanned() {
    if (!scanned) scan();
  }
  window.dmRescan = function () { scanned = false; scan(); };

  /* ---------- button ---------- */
  var SVG_MOON = '<svg class="dm-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var SVG_SUN = '<svg class="dm-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 1.8v2.4M12 19.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M1.8 12h2.4M19.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>';

  function makeButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dm-toggle';
    b.innerHTML = SVG_MOON + SVG_SUN;
    b.addEventListener('click', function () {
      var next = !isDark();
      apply(next);
      save(next ? 'dark' : 'light');
    });
    return b;
  }

  function mount() {
    if (document.querySelector('.dm-toggle')) return;
    var btn = makeButton();

    /* prefer the nav bar; several page templates exist across the site */
    var navLinks = document.querySelector('nav .nav-links');
    var nav = document.querySelector('nav');

    if (navLinks) {
      var li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.appendChild(btn);
      navLinks.appendChild(li);
    } else if (nav) {
      nav.appendChild(btn);
    } else {
      btn.classList.add('dm-float');
      document.body.appendChild(btn);
    }
    ensureScanned();
    apply(isDark()); // refresh aria/title on the new button

    /* late-rendered content (carousels, live grid widgets, chart tools) */
    setTimeout(function () { window.dmRescan(); }, 1800);
    window.addEventListener('load', function () { window.dmRescan(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
