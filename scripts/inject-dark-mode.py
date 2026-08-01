#!/usr/bin/env python3
"""Idempotently add the dark-mode bootstrap + script include to every page."""
import os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SKIP_DIRS = {".git", "_to_delete", "_wt", "node_modules", ".netlify", "snippets"}
MARKER = "dm-bootstrap"

BOOTSTRAP = """<script>(function(){try{var p=localStorage.getItem('dm-pref');var d=p?p==='dark':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dm-dark');var s=document.createElement('style');s.id='dm-bootstrap';s.textContent='html.dm-dark{filter:invert(1) hue-rotate(180deg);background:#000!important}html.dm-dark img,html.dm-dark picture,html.dm-dark video,html.dm-dark iframe,html.dm-dark embed,html.dm-dark object,html.dm-dark canvas,html.dm-dark .dm-keep,html.dm-dark [data-dm-keep]{filter:invert(1) hue-rotate(180deg)}';document.head.appendChild(s);}}catch(e){}})();</script>
<script src="{PREFIX}dark-mode.js" defer></script>"""

changed, skipped = [], []

for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
    for fn in filenames:
        if not fn.endswith(".html"):
            continue
        path = os.path.join(dirpath, fn)
        with open(path, "r", encoding="utf-8", errors="surrogateescape") as f:
            html = f.read()
        if MARKER in html:
            skipped.append(path)
            continue
        if "</head>" not in html:
            skipped.append(path + "  (no </head>)")
            continue
        # site is served from the domain root, so an absolute path works everywhere
        block = BOOTSTRAP.replace("{PREFIX}", "/")
        new = html.replace("</head>", block + "\n</head>", 1)
        with open(path, "w", encoding="utf-8", errors="surrogateescape") as f:
            f.write(new)
        changed.append(path)

print("updated %d page(s)" % len(changed))
for p in changed:
    print("  +", p)
if skipped:
    print("skipped %d:" % len(skipped))
    for p in skipped:
        print("  -", p)
