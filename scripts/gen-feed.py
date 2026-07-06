#!/usr/bin/env python3
"""Regenerate feed.xml (RSS 2.0) for Decarbonarma from articles/*.html.
Run from repo root. Requires a FULL git clone (not --depth 1): each item's
pubDate is the article's ORIGINAL (first) commit date, which is stable across
later edits. New articles automatically get their own dates."""
import os, re, glob, subprocess, html
from email.utils import formatdate
from datetime import datetime, timezone

BASE="https://decarbonarma.com"
arts=sorted(glob.glob("articles/*.html"))

def field(txt, pat):
    m=re.search(pat, txt, re.I|re.S)
    return m.group(1).strip() if m else ""

items=[]
for f in arts:
    txt=open(f, encoding="utf-8", errors="ignore").read()
    title=field(txt, r"<title>(.*?)</title>")
    # strip trailing site name in any form: "| Decarbonarma", "— Decarbonarama", "&mdash; Decarbonarma", etc.
    title=re.sub(r"\s*(?:\||-|–|—|&mdash;|&ndash;)\s*Decarbonar\w*\s*$","",title,flags=re.I).strip()
    m=re.search(r'<meta[^>]*name=(["\'])description\1[^>]*content=(["\'])(.*?)\2', txt, re.I|re.S)
    desc=m.group(3).strip() if m else ""
    if not desc:
        p=field(txt, r"<p[^>]*>(.*?)</p>")
        desc=re.sub("<[^>]+>","",p).strip()[:300]
    desc=re.sub(r"\s+"," ",desc)
    # ORIGINAL commit date (oldest commit touching the file) = stable publish date
    try:
        log=subprocess.check_output(["git","log","--format=%cI","--",f],text=True).strip().splitlines()
        d=log[-1] if log else ""
        dt=datetime.fromisoformat(d) if d else datetime.fromtimestamp(os.path.getmtime(f),timezone.utc)
    except Exception:
        dt=datetime.fromtimestamp(os.path.getmtime(f),timezone.utc)
    items.append((dt,title,desc,f"{BASE}/{f}"))

items.sort(key=lambda x:x[0], reverse=True)
now=formatdate(datetime.now(timezone.utc).timestamp())
esc=lambda s: html.escape(s, quote=False)

out=['<?xml version="1.0" encoding="UTF-8"?>',
     '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">','<channel>',
     '<title>Decarbonarma</title>',f'<link>{BASE}/</link>',
     '<description>Clear, no-nonsense analysis of UK home decarbonisation - heat pumps, solar, EVs, batteries and the grid.</description>',
     '<language>en-gb</language>',f'<lastBuildDate>{now}</lastBuildDate>',
     f'<atom:link href="{BASE}/feed.xml" rel="self" type="application/rss+xml" />']
for dt,title,desc,url in items:
    out+=['<item>',f'<title>{esc(title)}</title>',f'<link>{url}</link>',
          f'<guid isPermaLink="true">{url}</guid>',
          f'<pubDate>{formatdate(dt.timestamp())}</pubDate>',
          f'<description>{esc(desc)}</description>','</item>']
out+=['</channel>','</rss>']
open("feed.xml","w",encoding="utf-8").write("\n".join(out))
print(f"Wrote feed.xml with {len(items)} items")
