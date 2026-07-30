#!/usr/bin/env python3
"""Audit traced zone geometry against a city's official street→zone list.

  python3 scripts/audit-zones-vs-official.py belgrade

Answers one question: standing on a street the operator has published a zone
for, does our map name that same zone? Anything else is noise.

Three traps cost real accuracy here, and all three produced phantom errors
before they were handled:

  * a "-ZEMUN" / "-NBGD" suffix marks a SAME-NAMED street in another
    neighbourhood — substring matching sent them to the city centre
  * zone labels arrive with trailing whitespace ('Opšta parkirališta ')
  * a street split across zones by house number is not a mismatch, and 10% of
    Belgrade's streets are split that way

Needs an OSM extract for the city's bbox (cached in /tmp for a day).
"""
import json, math, re, sys, unicodedata, collections, os, urllib.request, urllib.parse

CITY = sys.argv[1] if len(sys.argv) > 1 else 'belgrade'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GEO = json.load(open(f'{ROOT}/public/zones/{CITY}.json'))['features']
OFF = json.load(open(f'{ROOT}/scripts/data/{CITY}-official-streets.json'))

# Operator label → our zone name, and the hourly cost a driver actually bears
# (Zone A sells 30 min for 120, so an hour there is 240 — if it were allowed).
ZMAP = {'Crvena': 'Zone 1 — Red', 'Žuta': 'Zone 2 — Yellow', 'Zelena': 'Zone 3 — Green',
        'Bela': 'Zone B — White', 'Zona A': 'Zone A — Purple',
        'Opšta parkirališta': 'Blue Zone — Unlimited'}
RATE = {'Zone A — Purple': 240, 'Zone 1 — Red': 80, 'Zone B — White': 65,
        'Zone 2 — Yellow': 65, 'Zone 3 — Green': 55, 'Blue Zone — Unlimited': None}
HOOD = {'ZEMUN': (44.8430, 20.4090), 'NBGD': (44.8180, 20.4200), 'NOVI BEOGRAD': (44.8180, 20.4200)}

CYR = {'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'}
def norm(s):
    s = s.lower()
    s = ''.join(CYR.get(c, c) for c in s)
    s = s.replace('đ','dj').replace('ć','c').replace('č','c').replace('š','s').replace('ž','z')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = re.sub(r'^(bulevar|bul\.?|ulica|ul\.?|trg)\s+', '', s)
    return ' '.join(s.replace('.', '').replace(',', '').split())

bare = lambda n: re.sub(r'\s*\(.*$', '', n).strip()
def split_hood(name):
    m = re.search(r'^(.*?)-(ZEMUN|NBGD|NOVI BEOGRAD)\s*$', name, re.I)
    return (m.group(1).strip(), m.group(2).upper()) if m else (name, None)

M = 110540
K = lambda lat: 111320 * math.cos(math.radians(lat))
ring = lambda f: f['geometry']['coordinates'][0]
def bbox(r):
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    return min(xs), min(ys), max(xs), max(ys)
def inside(pt, r):
    x, y = pt; c = False
    for i in range(len(r) - 1):
        x1, y1 = r[i]; x2, y2 = r[i+1]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: c = not c
    return c

P = [{'z': f['properties']['zone'], 'r': ring(f), 'b': bbox(ring(f))} for f in GEO]
def zone_at(pt):
    for p in P:
        if p['b'][0] <= pt[0] <= p['b'][2] and p['b'][1] <= pt[1] <= p['b'][3] and inside(pt, p['r']):
            return p['z']
    return None

def osm_ways():
    la = [c[1] for p in P for c in p['r']]; ln = [c[0] for p in P for c in p['r']]
    pad = 0.01
    q = (f'[out:json][timeout:180];(way["highway"]["name"]'
         f'({min(la)-pad:.4f},{min(ln)-pad:.4f},{max(la)+pad:.4f},{max(ln)+pad:.4f}););out geom;')
    cache = f'/tmp/kerb-audit-osm-{CITY}.json'
    if os.path.exists(cache) and (os.path.getmtime(cache) > __import__('time').time() - 86400):
        return json.load(open(cache))['elements']
    for m in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        try:
            req = urllib.request.Request(m, data=urllib.parse.urlencode({'data': q}).encode())
            d = json.load(urllib.request.urlopen(req, timeout=240))
            if d.get('elements'):
                json.dump(d, open(cache, 'w')); return d['elements']
        except Exception:
            continue
    sys.exit('OSM nedostupan — probaj ponovo')

segs = collections.defaultdict(list)
for e in osm_ways():
    n = e.get('tags', {}).get('name')
    if n and e.get('geometry'):
        segs[norm(n)].append([(g['lon'], g['lat']) for g in e['geometry']])

# Names that ALSO exist with a neighbourhood suffix. For the plain variant we
# must exclude segments in that neighbourhood, or we grade the centre's street
# against the suburb's zone (or, when OSM only knows the suburb's, invent an
# error outright — Fruškogorska did exactly that).
AMBIGUOUS = {norm(split_hood(bare(r['street']))[0])
             for r in OFF if split_hood(bare(r['street']))[1]}

def pts_for(street):
    core, hood = split_hood(bare(street))
    k = norm(core)
    cands = segs.get(k)
    if not cands:
        alt = [kk for kk in segs if k and (k in kk or kk in k)]
        if not alt: return None
        cands = segs[alt[0]]
    if hood and hood in HOOD:
        hla, hln = HOOD[hood]
        cands = [s for s in cands
                 if min(math.hypot((p[0]-hln)*K(p[1]), (p[1]-hla)*M) for p in s) < 2500]
    elif hood is None and k in AMBIGUOUS:
        for hla, hln in HOOD.values():
            cands = [s for s in cands
                     if min(math.hypot((p[0]-hln)*K(p[1]), (p[1]-hla)*M) for p in s) >= 2500]
    return [p for s in cands for p in s] or None

official = collections.defaultdict(set)
for r in OFF:
    z = ZMAP.get(r['zoneDescription'].strip())   # labels carry trailing spaces
    if z: official[bare(r['street'])].add(z)

ok = bad = nocov = multi_ok = multi_part = unmatched = 0
bads = []
for st, wants in official.items():
    pts = pts_for(st)
    if not pts: unmatched += 1; continue
    got = collections.Counter(zone_at(p) for p in pts)
    cov = [z for z in got if z]
    if not cov: nocov += 1; continue
    if len(wants) > 1:
        if wants <= set(cov): multi_ok += 1
        else: multi_part += 1
        continue
    w = next(iter(wants))
    if w in cov: ok += 1
    else:
        bad += 1
        top = max(cov, key=lambda z: got[z])
        bads.append((st, w, top, got[top] / len(pts)))

tot = ok + bad
print('=' * 74)
print(f'{CITY.upper()} — traced geometry vs official street list')
print('=' * 74)
print(f'  streets with one official zone : {tot}')
print(f'    ✓ map agrees                 : {ok}  ({100*ok//max(tot,1)}%)')
print(f'    ✗ map disagrees              : {bad}  ({100*bad//max(tot,1)}%)')
print(f'  split by house number          : {multi_ok} fully / {multi_part} partly covered')
print(f'  covered by no polygon          : {nocov}')
print(f'  not found in OSM by that name  : {unmatched}')
if not bads: sys.exit(0)

print('\n  what each mistake costs a driver:')
c = collections.Counter()
for st, w, g, f in bads:
    rw, rg = RATE.get(w), RATE.get(g)
    c[(w, g, (rg - rw) if (rw is not None and rg is not None) else None)] += 1
for (w, g, d), n in sorted(c.items(), key=lambda x: -x[1]):
    s = ('no published rate — the driver cannot pay at all' if d is None
         else (f'OVERPAYS +{d} RSD/h' if d > 0 else f'underpays {d} RSD/h'))
    print(f'    {n:>3}×  {w:<20} → {g:<22} {s}')

print('\n  every disagreeing street (% of sampled points on the wrong zone):')
for st, w, g, f in sorted(bads, key=lambda x: -x[3]):
    print(f'    {f*100:>5.0f}%  {st[:30]:<32} official {w:<20} map {g}')
