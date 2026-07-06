import glob, re, sys

def boundaries(t):
    # start: first <p ...> after </h1>
    mh=re.search(r"</h1>", t, re.I)
    if not mh: return None
    mp=re.search(r"<p[ >]", t[mh.end():], re.I)
    if not mp: return None
    start_pos=mh.end()+mp.start()
    # end boundary marker: first of these
    ends=[]
    for pat in [r"<!--\s*dca-email-capture\s*-->", r"<footer[ >]", r"</body>"]:
        m=re.search(pat, t, re.I)
        if m: ends.append(m.start())
    if not ends: return None
    bnd=min(ends)
    # last </p> before boundary
    last=None
    for m in re.finditer(r"</p>", t[:bnd], re.I):
        last=m
    if not last: return None
    end_pos=last.end()
    return start_pos, end_pos

def apply(t):
    b=boundaries(t)
    if not b: return None
    s,e=b
    # insert end first (higher index) then start
    t=t[:e]+"\n  <!-- Article End -->"+t[e:]
    t=t[:s]+"<!-- Article Start -->\n  "+t[s:]
    return t

dry = (len(sys.argv)>1 and sys.argv[1]=="dry")
sample={"solar-panels-worth-it-2026.html","decarbonarama-optimiser_4.html","smr-case-study.html","heatpumpmonitor-summary.html","ev-charger-decision-guide.html"}
changed=0
for f in sorted(glob.glob("articles/*.html")):
    t=open(f,encoding="utf-8",errors="ignore").read()
    if "<!-- Article Start -->" in t:
        continue
    b=boundaries(t)
    if not b:
        print("!! NO BOUNDARY:", f); continue
    if dry:
        if f.split("/")[-1] in sample:
            s,e=b
            print("="*70); print(f)
            print("  START ctx:", repr(t[max(0,s-60):s+40]))
            print("  END   ctx:", repr(t[e-60:e+40]))
    else:
        open(f,"w",encoding="utf-8").write(apply(t))
        changed+=1
if not dry: print(f"Tagged {changed} articles")
