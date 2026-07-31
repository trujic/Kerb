#!/usr/bin/env python3
"""Check Belgrade's map at the granularity the operator actually charges at.

  python3 scripts/audit-belgrade-housenumbers.py

The street-level audit cannot judge this build. build-belgrade-from-official.py
draws the map from the official list on OSM geometry, and the street audit reads
the map back against the same list on the same geometry — so it agrees by
construction and would keep agreeing if the house-number logic were wrong.

This asks a question the builder cannot answer for itself. Take a real OSM
address point. Its house number decides its official zone directly, by lookup, no
voting. Then ask the map what zone that exact coordinate is in. The builder chose
each segment from the nearest few addresses, so a boundary smeared by a house or
two shows up here as a disagreement at the addresses either side of a split.

The test point is NOT the address itself. OSM address points are building
centroids sitting inside the block — median 27.6 m from their own street's
centreline — so testing there measures how deep a courtyard is, not whether the
map is right. Each address is projected onto its street's centreline, then nudged
KERB_M back towards its own building: that is where the car stands, and on
streets whose two sides carry different zones (Kneza Miloša odd is Green while
even is Yellow) it is the only test point that can tell them apart. Landing
exactly on the centreline sits on the seam between both sides and scores noise.

Same-named streets are the trap here, and they cost me a full wrong diagnosis.
Belgrade has a Beogradska in the centre (Yellow) and one in Zemun (Green), and
merging their rows under one name made the audit report 144 correct addresses as
errors — the map had them both right. An address is therefore matched to the
cluster it stands in, and clusters that answer to no official row are skipped
rather than scored.

It also reports the two failure modes the street audit is blind to:
  * a point sitting inside two polygons that disagree (buffers meet at corners)
  * an address the operator lists that the map does not cover at all
"""
import json, math, re, os, sys, collections, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = json.load(open(f'{ROOT}/public/zones/belgrade.json'))['features']
OFF = json.load(open(f'{ROOT}/scripts/data/belgrade-official-streets.json'))
ADDR = json.load(open('/tmp/kerb-belgrade-addr.json'))['elements']
OSM = json.load(open('/tmp/kerb-audit-osm-belgrade.json'))['elements']

M_LAT = 110540.0
def m_lng(lat): return 111320.0 * math.cos(math.radians(lat))

ZMAP = {'Crvena': 'Zone 1 — Red', 'Žuta': 'Zone 2 — Yellow', 'Zelena': 'Zone 3 — Green',
        'Bela': 'Zone B — White', 'Zona A': 'Zone A — Purple',
        'Opšta parkirališta': 'Blue Zone — Unlimited'}
RATE = {'Zone A — Purple': 240, 'Zone 1 — Red': 80, 'Zone B — White': 65,
        'Zone 2 — Yellow': 65, 'Zone 3 — Green': 55, 'Blue Zone — Unlimited': None}

CYR = {'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'}
ALIAS = {'dvadesetdrugog oktobra':'22 oktobra','dvadesetprve divizije':'21 divizije',
         'dvadesetsedmog marta':'27 marta','hiljadutrista kaplara':'1300 kaplara',
         'kr a i karadjordjevica':'kralja aleksandra i karadjordjevica',
         'kr aleksandra':'kralja aleksandra','cara nikolaja drugog':'cara nikolaja ii',
         'skender begova':'skenderbegova','petra zrinjskog':'petra zrinskog',
         'brace krsmanovica':'brace krsmanovic'}
def norm(s):
    s = s.lower(); s = ''.join(CYR.get(c, c) for c in s)
    s = s.replace('đ','dj').replace('ć','c').replace('č','c').replace('š','s').replace('ž','z')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('-', ' ')
    s = re.sub(r'^(bulevar|bul\.?|ulica|ul\.?|trg)\s+', '', s)
    s = ' '.join(s.replace('.',' ').replace(',',' ').split())
    return ALIAS.get(s, s)

def parse_ranges(spec):
    if not spec or re.search(r'blok', spec, re.I): return None
    out = []
    for tok in re.findall(r'\d+\s*[A-ZŠĐČĆŽa-z]?\s*-\s*\d+\s*[A-ZŠĐČĆŽa-z]?|\d+\s*[A-ZŠĐČĆŽa-z]?', spec):
        n = [int(x) for x in re.findall(r'\d+', tok)]
        if n:
            lo, hi = min(n), max(n)
            out.append((lo, hi, lo % 2 if lo % 2 == hi % 2 else None))
    return out

# ── put each address where its car would be ───────────────────────────────────
STREET_WAYS = collections.defaultdict(list)

KERB_M = 5.0

def project_to_street(lat, lon, key):
    """Nearest point on the street's centreline, nudged back to this house's kerb."""
    ws = STREET_WAYS.get(key)
    if not ws: return None
    k = m_lng(lat)
    best, bd = None, 1e18
    for w in ws:
        for i in range(len(w) - 1):
            (y1, x1), (y2, x2) = w[i], w[i + 1]
            ax, ay = (x1 - lon) * k, (y1 - lat) * M_LAT
            bx, by = (x2 - lon) * k, (y2 - lat) * M_LAT
            dx, dy = bx - ax, by - ay
            l2 = dx * dx + dy * dy
            t = 0.0 if l2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / l2))
            cx, cy = ax + t * dx, ay + t * dy
            dd = cx * cx + cy * cy
            if dd < bd:
                bd, best = dd, (lat + cy / M_LAT, lon + cx / k)
    # An address more than a block from its namesake street is a different street.
    if best is None or bd >= 200 ** 2:
        return None
    d = math.sqrt(bd)
    if d < 1e-6:
        return best
    t = min(KERB_M / d, 1.0)
    return (best[0] + (lat - best[0]) * t, best[1] + (lon - best[1]) * t)

# ── the map, as the app reads it ──────────────────────────────────────────────
def bbox(r):
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    return min(xs), min(ys), max(xs), max(ys)
def inside(pt, r):
    x, y = pt; c = False
    for i in range(len(r) - 1):
        x1, y1 = r[i]; x2, y2 = r[i+1]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: c = not c
    return c
P = [{'z': f['properties']['zone'], 'n': f['properties'].get('name',''),
      'r': f['geometry']['coordinates'][0], 'b': bbox(f['geometry']['coordinates'][0])} for f in GEO]

def zones_at(pt):
    """Every zone covering this point — the app takes the first, so >1 distinct is a real hazard."""
    out = []
    for p in P:
        if p['b'][0] <= pt[0] <= p['b'][2] and p['b'][1] <= pt[1] <= p['b'][3] and inside(pt, p['r']):
            out.append(p['z'])
    return out

# ── official: house number → zone, per street AND neighbourhood ───────────────
HOOD_AT = {'ZEMUN': (44.8430, 20.4090), 'NBGD': (44.8180, 20.4200), 'NOVI BEOGRAD': (44.8180, 20.4200)}
CENTRE = (44.8125, 20.4612)

per_street = collections.defaultdict(list)
for r in OFF:
    raw = r['street'].strip()
    nm = re.sub(r'\s*\(.*', '', raw).strip()
    m_h = re.search(r'\s*-\s*(ZEMUN|NBGD|NOVI BEOGRAD)\s*$', nm, flags=re.I)
    hood = m_h.group(1).upper() if m_h else None
    nm = re.sub(r'\s*-\s*(ZEMUN|NBGD|NOVI BEOGRAD)\s*$', '', nm, flags=re.I)
    z = ZMAP.get(r['zoneDescription'].strip())
    if not z: continue
    spec = (re.search(r'\((.*)\)', raw).group(1) if '(' in raw else '')
    per_street[(norm(nm), hood)].append({'zone': z, 'ranges': parse_ranges(spec), 'spec': spec})

VARIANTS = collections.defaultdict(list)
for (nm, hood) in per_street:
    VARIANTS[nm].append(hood)

def variant_for(street_key, lat, lon):
    """Which listing this address answers to — or None if it is a third street of
    the same name that the operator does not price at all."""
    hoods = VARIANTS.get(street_key)
    if hoods is None: return None
    def d(a): return math.hypot((lon - a[1]) * m_lng(lat), (lat - a[0]) * M_LAT)
    named = [h for h in hoods if h]
    for h in named:
        if d(HOOD_AT[h]) < 2500: return h
    if None in hoods:
        # An unsuffixed row means the city proper. Far outside it, and outside every
        # named neighbourhood, this is a namesake street with no listing of its own.
        if d(CENTRE) < 6000 and all(d(HOOD_AT[h]) >= 2500 for h in named): return None
        return '<none>'
    return '<none>'

def official_zone(street_key, hood, num):
    rows = per_street.get((street_key, hood))
    if not rows: return None
    numbered = [r for r in rows if r['ranges']]
    for r in numbered:
        if any(lo <= num <= hi and (side is None or num % 2 == side)
                                   for lo, hi, side in r['ranges']): return r['zone']
    if numbered: return '<outside listing>'
    whole = [r for r in rows if r['ranges'] == [] and not r['spec']]
    return whole[0]['zone'] if whole else None

# ── run ───────────────────────────────────────────────────────────────────────
for w in OSM:
    n = w.get('tags', {}).get('name')
    if n and w.get('geometry'):
        STREET_WAYS[norm(n)].append([(g['lat'], g['lon']) for g in w['geometry']])

checked = agree = offscope = 0
wrong = collections.Counter()
wrong_ex = collections.defaultdict(list)
uncovered = collections.Counter()
conflict = collections.Counter()
outside_but_charged = collections.Counter()

for e in ADDR:
    t = e.get('tags', {})
    st, hn = t.get('addr:street'), t.get('addr:housenumber')
    if not st or not hn: continue
    m = re.match(r'(\d+)', hn)
    if not m: continue
    lat = e.get('lat') or (e.get('center') or {}).get('lat')
    lon = e.get('lon') or (e.get('center') or {}).get('lon')
    if lat is None: continue
    key = norm(st)
    hood = variant_for(key, lat, lon)
    if hood == '<none>':
        offscope += 1
        continue
    off = official_zone(key, hood, int(m.group(1)))
    if off is None: continue

    on_street = project_to_street(lat, lon, key)
    if on_street is None: continue
    got = zones_at((on_street[1], on_street[0]))
    distinct = set(got)
    if len(distinct) > 1:
        conflict[' + '.join(sorted(distinct))] += 1

    if off == '<outside listing>':
        # The operator does not list this number. The map charging here would be
        # an invented fee, which is worse than a gap.
        if got: outside_but_charged[got[0]] += 1
        continue

    checked += 1
    if not got:
        uncovered[off] += 1
    elif off in distinct:
        agree += 1
    else:
        wrong[(off, got[0])] += 1
        if len(wrong_ex[(off, got[0])]) < 3:
            wrong_ex[(off, got[0])].append(f'{st} {hn}')

print('=' * 74)
print('BELGRADE — map checked at every listed house number')
print('=' * 74)
print(f'  addresses the operator prices  : {checked}')
print(f'    ✓ map gives the same zone    : {agree}  ({agree*100//max(checked,1)}%)')
print(f'    ✗ map gives a different zone : {sum(wrong.values())}')
print(f'    · not covered by any polygon : {sum(uncovered.values())}')
print(f'  same-named streets the operator does not list : {offscope} (skipped)')

if wrong:
    print('\n  what each disagreement costs the driver:')
    for (off, got), n in wrong.most_common(12):
        a, b = RATE.get(off), RATE.get(got)
        if a is None or b is None: cost = 'no published rate — cannot pay'
        else: cost = f'{"OVERPAYS" if b>a else "underpays"} {b-a:+} RSD/h'
        print(f'    {n:5}×  {off:22} → {got:22}  {cost}')
        print(f'            e.g. {", ".join(wrong_ex[(off,got)])}')

if uncovered:
    print('\n  listed but not on the map (driver is told there is no zone):')
    for z, n in uncovered.most_common(8): print(f'    {n:5}×  {z}')

if outside_but_charged:
    print('\n  NOT in the operator listing, yet the map names a zone:')
    for z, n in outside_but_charged.most_common(8): print(f'    {n:5}×  {z}')

if conflict:
    print('\n  points inside two disagreeing polygons (app takes the first):')
    for k, n in conflict.most_common(8): print(f'    {n:5}×  {k}')

sys.exit(1 if wrong else 0)
