#!/usr/bin/env python3
"""Build Belgrade zone geometry from the operator's own street list.

  python3 scripts/build-belgrade-from-official.py

Replaces the hand-traced approximation in public/zones/belgrade.json.

WHY THIS EXISTS
---------------
Belgrade publishes its zones only as a raster image, so the first version of this
file was six polygons traced over that image by eye. Traced areas cannot express
what Belgrade's zoning actually does: 508 of the operator's 872 entries are
house-number ranges, and Bulevar despota Stefana alone runs through FOUR zones
along its length. No area drawn around it can be right for more than a quarter of
it. The audit caught the cost of that — a purple polygon sitting over fourteen
officially-red streets, charging +160 RSD/h on every one.

So this builds the map the other way round: from parking-servis's published
street list (scripts/data/belgrade-official-streets.json, 872 rows), placed on
real OpenStreetMap street geometry, cut where the operator cuts — at the house
number.

HOW A STREET IS CUT
-------------------
Nearest-address voting, per segment. Every OSM address point on the street knows
its house number; every official row knows which numbers it covers. For each
segment of the street we look at the closest few address points and take the row
they agree on.

The important half of that is what it REFUSES to do. If the nearest address is
too far, or its number falls in no official range, the segment is left unzoned —
because a street listed as "1-17" is genuinely not a parking zone at number 45,
and quietly extending it there would invent a charge the operator never made.

WHAT IT CANNOT DO, AND SAYS SO
------------------------------
  * `blok N` (39 Novi Beograd entries) is a block, not a number range — cut
    against the block's OSM boundary where one exists, skipped where it does not.
  * A same-named street in Zemun or Novi Beograd is a DIFFERENT street. Rows say
    so with a -ZEMUN / -NBGD suffix; unsuffixed rows are disambiguated by their
    own address points, and by the subzone anchor when they have none.
  * Streets OSM does not carry under the operator's spelling are reported at the
    end rather than guessed at.

Geometry is buffered to polygons because the resolver, the renderer and the audit
all work in areas — but ONE STRIP PER SIDE of the street, not one around the
centreline. Kneza Miloša is why: for a long stretch the odd side is Green (37-103)
while the even side is Yellow (24-92), and a single strip covering both cannot be
right for either. Each side is voted on only by the addresses standing on it,
decided geometrically rather than by parity, so the map splits exactly where the
operator's price does.
"""
import json, math, re, sys, os, collections, unicodedata, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f'{ROOT}/public/zones/belgrade.json'
OFF = json.load(open(f'{ROOT}/scripts/data/belgrade-official-streets.json'))

# Half-width of the strip we draw around a street centreline. Belgrade's centre
# blocks are 60-80 m across, so 15 m keeps opposite sides of a block distinct
# while still covering both kerbs of the street itself.
BUF_M = 15.0
# Beyond this, an address is not evidence about this segment.
MAX_ADDR_M = 90.0
# How many neighbouring addresses vote on a segment. They vote by inverse square
# distance, not one-each: at a split, a flat vote let three houses from the far
# side outnumber the one house actually next to the segment, and Kneza Miloša 4
# came back Yellow when the operator sells it as Zone A.
K_VOTES = 5

ZMAP = {'Crvena': 'Zone 1 — Red', 'Žuta': 'Zone 2 — Yellow', 'Zelena': 'Zone 3 — Green',
        'Bela': 'Zone B — White', 'Zona A': 'Zone A — Purple',
        'Opšta parkirališta': 'Blue Zone — Unlimited'}
COLOR = {'Zone A — Purple': '#7C3AED', 'Zone 1 — Red': '#DC2626', 'Zone B — White': '#6B7280',
         'Zone 2 — Yellow': '#D97706', 'Zone 3 — Green': '#16A34A', 'Blue Zone — Unlimited': '#2563EB'}

# ── names ─────────────────────────────────────────────────────────────────────
CYR = {'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'}
# The operator writes some names out in words, or abbreviated, where OSM uses the
# other form. Each of these was a street that would otherwise have been dropped.
ALIAS = {
    'dvadesetdrugog oktobra': '22 oktobra',
    'dvadesetprve divizije': '21 divizije',
    'dvadesetsedmog marta': '27 marta',
    'hiljadutrista kaplara': '1300 kaplara',
    'kr a i karadjordjevica': 'kralja aleksandra i karadjordjevica',
    'kr aleksandra': 'kralja aleksandra',
    'cara nikolaja drugog': 'cara nikolaja ii',
    'skender begova': 'skenderbegova',
    'petra zrinjskog': 'petra zrinskog',
    'brace krsmanovica': 'brace krsmanovic',
}

def norm(s: str) -> str:
    s = s.lower()
    s = ''.join(CYR.get(c, c) for c in s)
    s = s.replace('đ', 'dj').replace('ć', 'c').replace('č', 'c').replace('š', 's').replace('ž', 'z')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('-', ' ')
    s = re.sub(r'^(bulevar|bul\.?|ulica|ul\.?|trg)\s+', '', s)
    s = ' '.join(s.replace('.', ' ').replace(',', ' ').split())
    return ALIAS.get(s, s)

def split_hood(name: str):
    """-ZEMUN / -NBGD marks a same-named street somewhere else entirely."""
    m = re.search(r'^(.*?)[\s-]*(?:-|\s)(ZEMUN|NBGD|NOVI BEOGRAD)\s*$', name, re.I)
    return (m.group(1).strip(' -'), m.group(2).upper()) if m else (name, None)

HOOD_AT = {'ZEMUN': (44.8430, 20.4090), 'NBGD': (44.8180, 20.4200), 'NOVI BEOGRAD': (44.8180, 20.4200)}
# Terazije. An unsuffixed row means the city proper: the operator suffixes the
# outlying namesakes and leaves the central one plain.
CENTRE = (44.8140, 20.4600)

# ── house-number ranges ───────────────────────────────────────────────────────
def parse_ranges(spec: str):
    """'(1-17 10-24)' → [(1,17,side), ...]. Letter suffixes (42A) round to the number.
    Returns None for a block spec, [] when there is nothing to parse.

''' + PARITY_DOC + '''
    """
    if not spec:
        return []
    if re.search(r'blok', spec, re.I):
        return None
    out = []
    for tok in re.findall(r'\d+\s*[A-ZŠĐČĆŽa-z]?\s*-\s*\d+\s*[A-ZŠĐČĆŽa-z]?|\d+\s*[A-ZŠĐČĆŽa-z]?', spec):
        nums = [int(x) for x in re.findall(r'\d+', tok)]
        if not nums:
            continue
        lo, hi = min(nums), max(nums)
        out.append((lo, hi, lo % 2 if lo % 2 == hi % 2 else None))
    return out

# ── geometry ──────────────────────────────────────────────────────────────────
M_LAT = 110540.0
def m_lng(lat): return 111320.0 * math.cos(math.radians(lat))

def dist_m(a, b):
    return math.hypot((a[1] - b[1]) * m_lng(a[0]), (a[0] - b[0]) * M_LAT)

def load_osm():
    cache = '/tmp/kerb-audit-osm-belgrade.json'
    if os.path.exists(cache):
        return json.load(open(cache))['elements']
    sys.exit('nema OSM kesa — pokreni prvo audit-zones-vs-official.py')

def load_addr():
    cache = '/tmp/kerb-belgrade-addr.json'
    if os.path.exists(cache):
        return json.load(open(cache))['elements']
    q = ('[out:json][timeout:300];'
         '(node["addr:housenumber"]["addr:street"](44.76,20.36,44.87,20.53);'
         ' way["addr:housenumber"]["addr:street"](44.76,20.36,44.87,20.53););out center;')
    for m in ('https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'):
        try:
            req = urllib.request.Request(m, data=urllib.parse.urlencode({'data': q}).encode())
            d = json.load(urllib.request.urlopen(req, timeout=320))
            if d.get('elements'):
                json.dump(d, open(cache, 'w'))
                return d['elements']
        except Exception:
            continue
    sys.exit('Overpass nedostupan')

def load_blocks():
    """Novi Beograd blocks, for the 39 `blok N` rows."""
    cache = '/tmp/kerb-belgrade-blocks.json'
    if os.path.exists(cache):
        els = json.load(open(cache))['elements']
    else:
        q = ('[out:json][timeout:180];'
             '(way["name"~"^Blok",i](44.78,20.36,44.85,20.47);'
             ' relation["name"~"^Blok",i](44.78,20.36,44.85,20.47);'
             ' node["name"~"^Blok",i](44.78,20.36,44.85,20.47););out geom center;')
        els = []
        for m in ('https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'):
            try:
                req = urllib.request.Request(m, data=urllib.parse.urlencode({'data': q}).encode())
                d = json.load(urllib.request.urlopen(req, timeout=200))
                els = d.get('elements', [])
                json.dump(d, open(cache, 'w'))
                break
            except Exception:
                continue
    blocks = {}
    for e in els:
        nm = e.get('tags', {}).get('name', '')
        m = re.search(r'blok\s*(\d+)', nm, re.I)
        if not m:
            continue
        n = int(m.group(1))
        if e.get('geometry'):
            pts = [(g['lat'], g['lon']) for g in e['geometry']]
        elif e.get('center'):
            pts = [(e['center']['lat'], e['center']['lon'])]
        elif e.get('lat'):
            pts = [(e['lat'], e['lon'])]
        else:
            continue
        blocks.setdefault(n, []).extend(pts)
    return {n: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v),
                max((dist_m(v[0], p) for p in v), default=0))
            for n, v in blocks.items()}

def side_of(seg, pt):
    """+1 / -1: which hand of the segment the point falls on."""
    (y1, x1), (y2, x2) = seg
    k = m_lng(y1)
    ax, ay = (x2 - x1) * k, (y2 - y1) * M_LAT
    bx, by = (pt[1] - x1) * k, (pt[0] - y1) * M_LAT
    return 1 if ax * by - ay * bx >= 0 else -1


def buffer_side(pts, half_m, hand):
    """A strip from the centreline out to half_m on ONE side.

    The two sides of a Belgrade street can be sold at different prices, so a strip
    that straddles the centreline would be wrong on whichever side lost."""
    if len(pts) < 2:
        return None
    lat0, lng0 = pts[0][0], pts[0][1]
    k = m_lng(lat0)
    xy = [((p[1] - lng0) * k, (p[0] - lat0) * M_LAT) for p in pts]
    off = []
    for i in range(len(xy) - 1):
        (x1, y1), (x2, y2) = xy[i], xy[i + 1]
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy)
        if ln < 1e-9:
            continue
        nx, ny = -dy / ln * half_m * hand, dx / ln * half_m * hand
        off += [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny)]
    if not off:
        return None
    ring = xy + off[::-1]
    ring.append(ring[0])
    return [[lng0 + x / k, lat0 + y / M_LAT] for x, y in ring]

def cluster_ways(ways_list, radius_m=800.0):
    """Split same-named ways into the separate streets they really are.

    Belgrade has a Beogradska in the centre and a Beogradska in Zemun, and the
    operator prices them differently. Averaging all their address points put the
    anchor in the river between them, so a 3 km radius caught both and the Zemun
    row painted green over the centre — 144 wrong addresses from one bug."""
    groups = []
    for w in ways_list:
        hit = [i for i, g in enumerate(groups)
               if any(dist_m(p, q) < radius_m for p in (w[0], w[-1]) for gw in g for q in (gw[0], gw[-1]))]
        if not hit:
            groups.append([w])
        else:
            merged = [w]
            for i in sorted(hit, reverse=True):
                merged += groups.pop(i)
            groups.append(merged)
    return groups


def centroid(ways_list):
    pts = [p for w in ways_list for p in w]
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def chains(segments):
    """Group segments that touch into runs, so a cut street becomes a few strips
    rather than hundreds of stubs."""
    out = []
    cur = list(segments[0]) if segments else []
    for a, b in segments[1:]:
        if cur and dist_m(cur[-1], a) < 1.0:
            cur.append(b)
        else:
            out.append(cur)
            cur = [a, b]
    if cur:
        out.append(cur)
    return out

# ── build ─────────────────────────────────────────────────────────────────────
def main():
    osm = load_osm()
    addr_els = load_addr()
    blocks = load_blocks()

    ways = collections.defaultdict(list)
    for w in osm:
        n = w.get('tags', {}).get('name')
        if n and w.get('geometry'):
            ways[norm(n)].append([(g['lat'], g['lon']) for g in w['geometry']])

    addrs = collections.defaultdict(list)
    for e in addr_els:
        t = e.get('tags', {})
        st, hn = t.get('addr:street'), t.get('addr:housenumber')
        if not st or not hn:
            continue
        m = re.match(r'(\d+)', hn)
        if not m:
            continue
        lat = e.get('lat') or (e.get('center') or {}).get('lat')
        lon = e.get('lon') or (e.get('center') or {}).get('lon')
        if lat is None:
            continue
        addrs[norm(st)].append((int(m.group(1)), lat, lon))

    # group official rows by street
    per_street = collections.defaultdict(list)
    for r in OFF:
        raw = r['street'].strip()
        nm, hood = split_hood(re.sub(r'\s*\(.*', '', raw).strip())
        spec = (re.search(r'\((.*)\)', raw) or [None, ''])[1] if '(' in raw else ''
        zone = ZMAP.get(r['zoneDescription'].strip())
        if not zone:
            continue
        per_street[(norm(nm), hood)].append({
            'zone': zone, 'ranges': parse_ranges(spec), 'spec': spec, 'raw': raw,
            'group': r.get('parkingLotGroupDescription', '')})

    features = []
    stats = collections.Counter()
    unmatched, unblocked, contested = [], [], []

    for (nm, hood), rows in sorted(per_street.items(), key=lambda kv: (kv[0][0], kv[0][1] or '')):
        cand = ways.get(nm)
        if not cand:
            unmatched.append(rows[0]['raw'])
            stats['ulica bez OSM geometrije'] += 1
            continue

        pts_all = addrs.get(nm, [])

        # Pick the right same-named street, by choosing a whole cluster rather
        # than a radius — a radius around an averaged anchor spans both.
        groups = cluster_ways(cand)
        # Run this even for a single cluster. Guarding it behind "more than one"
        # let Fruškogorska through: it has exactly one cluster, in Zemun, and the
        # unsuffixed Zone A row sailed past every check straight onto it.
        if True:
            if hood:
                # The suffix names the neighbourhood: take the cluster in it.
                cand = min(groups, key=lambda g: dist_m(HOOD_AT[hood], centroid(g)))
            else:
                # No suffix means the city proper, so distance to the centre decides
                # — not cluster size. Cara Dušana runs through both Dorćol and
                # Zemun, the Zemun one is longer, and picking by size put all 17 red
                # polygons 6.6 km out while central Cara Dušana got none at all.
                # House numbers only qualify a cluster; they do not rank it.
                wanted = set()
                for r in rows:
                    for lo, hi, _side in (r['ranges'] or []):
                        wanted.update(range(lo, hi + 1))
                excluded = {h for (n2, h) in per_street if n2 == nm and h}

                def usable(g):
                    c = centroid(g)
                    if excluded and any(dist_m(HOOD_AT[h], c) < 2500 for h in excluded):
                        return False
                    if not wanted:
                        return True
                    return any(p[0] in wanted and dist_m(c, (p[1], p[2])) < 2500 for p in pts_all)

                ok = [g for g in groups if usable(g)]
                cand = min(ok, key=lambda g: dist_m(CENTRE, centroid(g))) if ok else []
        if not cand:
            # Fruškogorska is the shape of this: the operator lists it as Zone A and
            # separately as FRUŠKOGORSKA-ZEMUN in Green, but OSM has exactly one
            # Fruškogorska, in Zemun. Two rows cannot both be that street. Painting
            # Zone A over it would sell 240 RSD/h on a suburban kerb, so the
            # unresolvable row is dropped and named rather than guessed.
            contested.append(f"{rows[0]['raw']}  ({rows[0]['zone']})")
            stats['nerazresivo — ista ulica u dva reda'] += 1
            continue
        anchor = centroid(cand)

        whole = [r for r in rows if not r['spec']]
        block_rows = [r for r in rows if r['ranges'] is None]
        numbered = [r for r in rows if r['ranges']]

        # Only addresses on the cluster we picked may vote on it.
        street_pts = [p for p in pts_all
                      if min(dist_m((p[1], p[2]), q) for w in cand for q in (w[0], w[-1])) < 600]

        # (zone, hand) → segments. Both hands are decided independently.
        assigned = collections.defaultdict(list)
        for way in cand:
            for i in range(len(way) - 1):
                a, b = way[i], way[i + 1]
                mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

                z = None
                if whole:
                    z = whole[0]['zone']
                elif block_rows:
                    hit = None
                    for r in block_rows:
                        bn = re.search(r'blok\s*(\d+)', r['spec'], re.I)
                        if not bn:
                            continue
                        blk = blocks.get(int(bn.group(1)))
                        if blk and dist_m(mid, (blk[0], blk[1])) < max(blk[2], 250) + 150:
                            hit = r['zone']
                            break
                    z = hit
                if z is not None:
                    assigned[(z, 1)].append((a, b))
                    assigned[(z, -1)].append((a, b))
                    continue

                if not (numbered and street_pts):
                    continue
                # Vote each hand of the street separately, using only the houses
                # standing on that hand.
                near = sorted(street_pts, key=lambda p: dist_m(mid, (p[1], p[2])))[:K_VOTES * 4]
                for hand in (1, -1):
                    votes = collections.Counter()
                    used = 0
                    for num, plat, plon in near:
                        if used >= K_VOTES:
                            break
                        d = dist_m(mid, (plat, plon))
                        if d > MAX_ADDR_M or side_of((a, b), (plat, plon)) != hand:
                            continue
                        for r in numbered:
                            if any(lo <= num <= hi and (sd is None or num % 2 == sd)
                                   for lo, hi, sd in r['ranges']):
                                votes[r['zone']] += 1.0 / max(d, 5.0) ** 2
                                used += 1
                                break
                    # No vote is a real answer: this stretch is outside the listing.
                    if votes:
                        assigned[(votes.most_common(1)[0][0], hand)].append((a, b))

        if not assigned:
            if block_rows:
                unblocked.append(rows[0]['raw'])
                stats['blok bez granice u OSM'] += 1
            else:
                stats['ulica bez upotrebljivih adresa'] += 1
            continue

        for (zone, hand), segs in assigned.items():
            for chain in chains(segs):
                ring = buffer_side(chain, BUF_M, hand)
                if ring:
                    features.append({
                        'type': 'Feature',
                        'properties': {'name': rows[0]['raw'].split('(')[0].strip(),
                                       'zone': zone, 'color': COLOR[zone]},
                        'geometry': {'type': 'Polygon', 'coordinates': [ring]}})
            stats[zone] += 1

    # Six decimals is ~11 cm — far finer than the geometry is honest to, and it
    # cuts the file by two thirds. This ships to phones and into the offline cache,
    # so the difference is a real one for the person loading it.
    for f in features:
        f['geometry']['coordinates'] = [[[round(x, 6), round(y, 6)] for x, y in ring]
                                        for ring in f['geometry']['coordinates']]

    fc = {'type': 'FeatureCollection', 'features': features}
    json.dump(fc, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))

    print(f'  zapisano {len(features)} poligona → public/zones/belgrade.json')
    for k, v in sorted(stats.items(), key=lambda x: -x[1]):
        print(f'    {v:4}  {k}')
    if unmatched:
        print(f'\n  bez OSM geometrije ({len(unmatched)}):')
        for u in unmatched[:20]:
            print('     ', u)
    if unblocked:
        print(f'\n  blok bez granice ({len(unblocked)}): {unblocked[:10]}')
    if contested:
        print(f'\n  nerazresivo, ispusteno ({len(contested)}):')
        for c in contested:
            print('     ', c)

if __name__ == '__main__':
    main()
