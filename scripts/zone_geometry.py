# ── SHARED ZONE-GEOMETRY MACHINERY ────────────────────────────────────────────
# Every Serbian operator publishes the same thing in a different shape: a list of
# streets per zone, most entries bounded by the cross streets they run between.
# Turning that into geometry is the same job each time — match the name against
# OpenStreetMap, chain the ways, cut the run to the named span — so it lives here
# and each city's script only brings its own scraper and its own aliases.
#
# Used by build-nis-geometry.py and build-subotica-geometry.py.

import difflib, json, math, re, sys, urllib.parse, urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / 'data'
ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]

JOIN_TOL_M = 25    # ways of one street meeting across a junction, not at a node
CROSS_TOL_M = 130  # how far a bounding cross street may sit beside the run
# A cross street that "meets" the middle of a street from 150 m away is a false
# match. One that meets its END from 150 m away is a street OSM simply stops
# short of — Somborski put ends 152 m before Matka Vukovića, and rejecting that
# left the whole 1462 m drawn as Yellow, straight over the Green run inside it.
END_TOL_M = 200
END_SLACK_M = 15   # how close to an endpoint still counts as the end

CYR = "абвгдђежзијклљмнњопрстћуфхцчџш"
LAT = ["a","b","v","g","d","đ","e","ž","z","i","j","k","l","lj","m","n","nj",
       "o","p","r","s","t","ć","u","f","h","c","č","dž","š"]
TRANSLIT = dict(zip(CYR, LAT))


def norm(s: str) -> str:
    """Comparable form: latin, lowercase, no punctuation, no parenthetical.

    Unclosed brackets are stripped too — operators write "(nekadašnja ulica Franca
    Rozmana" and forget to close it, and leaving the old name glued to the new one
    silently costs a match.
    """
    s = re.sub(r'\([^)]*\)', '', s)
    s = re.sub(r'\(.*$', '', s).lower()
    s = ''.join(TRANSLIT.get(c, c) for c in s)
    s = re.sub(r'^\s*(ul\.|ulica|ulice|улица|улице)\s+', '', s)
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', s)).strip()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': 'Kerb/1.0 (+kerb.rs)'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')


def overpass(query: str, cache: str) -> dict:
    """Overpass with an on-disk cache in scripts/data/. Delete the file to refetch.

    The public instance is a shared volunteer resource and these queries pull
    megabytes; a rerun to fix an alias should cost nothing.
    """
    f = DATA / cache
    if f.exists():
        print(f'  cached: {f.name}')
        return json.loads(f.read_text(encoding='utf-8'))
    for ep in ENDPOINTS:
        try:
            body = urllib.request.urlopen(urllib.request.Request(
                ep, data=urllib.parse.urlencode({'data': query}).encode(),
                headers={'User-Agent': 'Kerb/1.0'}), timeout=240).read()
            f.write_bytes(body)
            return json.loads(body)
        except Exception as e:
            print(f'  {ep} failed: {e}', file=sys.stderr)
    raise SystemExit('every Overpass endpoint failed')


def streets_query(bbox) -> str:
    """Named streets in the box.

    `service` is in the list because short central streets are routinely tagged
    that way — Subotica's Albe Malagurskog, which the operator uses both as a
    charged street and as the boundary of another, is highway=service. Leaving it
    out cost two entries and drew Braće Radića at 1.83 km instead of 150 m.
    The `["name"]` filter is what keeps it safe: unnamed service ways are
    driveways and parking aisles, and none of those come back.
    """
    s, w, n, e = bbox
    return (f'[out:json][timeout:180];\n'
            f'way["highway"~"^(residential|tertiary|secondary|primary|unclassified'
            f'|living_street|pedestrian|trunk|service)$"]["name"]({s},{w},{n},{e});\n'
            f'out geom tags;')


def index_by_name(ways) -> dict:
    """Every name a street is known by → its ways.

    Bilingual towns matter here: Subotica carries name:hu on 589 streets, and an
    operator writing the Hungarian order ("Lanji Ernea") has to reach the way OSM
    files under the Serbian one.
    """
    by, seen = {}, {}
    for w in ways:
        if not w.get('geometry'):
            continue
        # One way carries the same street under name, name:sr, name:sr-Latn and
        # int_name, which all normalise to the same key. Appending per tag filed
        # it four times, and chain() then tried to join a polyline to copies of
        # itself — a 29-way street came back as 116 ways in 11 nonsense chains,
        # and every span across it failed to clip. Dedupe by way id.
        for k in ('name', 'name:sr', 'name:sr-Latn', 'name:hu', 'int_name',
                  'alt_name', 'old_name'):
            v = w['tags'].get(k)
            if not v:
                continue
            key = norm(v)
            if w['id'] in seen.setdefault(key, set()):
                continue
            seen[key].add(w['id'])
            by.setdefault(key, []).append(w)
    return by


def _m(lat):
    return 111320 * math.cos(math.radians(lat)), 111320


def dist_m(a, b):
    kx, ky = _m(a[1])
    return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky)


def chain(ways):
    """Join a street's ways into ordered polylines.

    Endpoints match with a tolerance rather than exactly: OSM splits a street at
    junctions and the halves often stop either side of the crossing instead of
    sharing a node. Requiring exactness left streets as two chains, and a span
    whose ends landed on different chains could never resolve.
    """
    parts = [[(p['lon'], p['lat']) for p in w['geometry']] for w in ways]
    out = []
    while parts:
        cur = parts.pop(0)
        joined = True
        while joined:
            joined = False
            for i, q in enumerate(parts):
                for a, b in ((cur[-1], q[0]), (cur[-1], q[-1]),
                             (cur[0], q[0]), (cur[0], q[-1])):
                    if dist_m(a, b) <= JOIN_TOL_M:
                        if cur[-1] == a and q[0] == b:    cur = cur + q[1:]
                        elif cur[-1] == a and q[-1] == b: cur = cur + q[::-1][1:]
                        elif cur[0] == a and q[0] == b:   cur = q[::-1] + cur[1:]
                        else:                             cur = q + cur[1:]
                        parts.pop(i); joined = True; break
                if joined: break
        out.append(cur)
    return out


def _cum(ch):
    out = [0.0]
    for i in range(len(ch) - 1):
        out.append(out[-1] + dist_m(ch[i], ch[i + 1]))
    return out


def _closest_along(ch, cum, cross_pts):
    best = (1e9, None)
    for i, p in enumerate(ch):
        for c in cross_pts:
            d = dist_m(p, c)
            if d < best[0]:
                best = (d, cum[i])
    return best


def clip_between(ways, ends_pts):
    """Ways cut to the run between two cross streets, or None if unresolvable.

    `ends_pts` is a pair of point lists — every vertex of each bounding street.
    """
    out = []
    for ch in chain(ways):
        if len(ch) < 2:
            continue
        cum = _cum(ch)
        (dA, tA) = _closest_along(ch, cum, ends_pts[0])
        (dB, tB) = _closest_along(ch, cum, ends_pts[1])
        if tA is None or tB is None:
            continue

        def ok(d, t):
            at_end = t <= END_SLACK_M or t >= cum[-1] - END_SLACK_M
            return d <= (END_TOL_M if at_end else CROSS_TOL_M)

        if not (ok(dA, tA) and ok(dB, tB)):
            continue
        lo, hi = sorted((tA, tB))
        if hi - lo < 20:
            continue
        kept = [p for p, t in zip(ch, cum) if lo <= t <= hi]
        if len(kept) >= 2:
            out.append(kept)
    return out or None


def near_centre(ways, centre, radius_m, spread_m):
    """Drop namesakes in outlying villages, keeping the run nearest the centre.

    A charged street runs in one piece. Where the name also belongs to a street in
    a village the city administers, OSM hands back both, and the far one gets drawn
    as paid parking across farmland. Returns (kept_ways, None) or (None, 'far').
    """
    cand = [(min(dist_m((p['lon'], p['lat']), centre) for p in w['geometry']), w)
            for w in ways]
    here = min(d for d, _ in cand)
    if here > radius_m:
        return None, 'far'
    return [w for d, w in cand if d <= here + spread_m], None


# Operators write the bounding streets in the genitive — "od Somborskog puta do
# Sivačkog puta" — while OSM files the nominative. The feminine forms are close
# enough that the fuzzy pass catches them ("Zagrebačke" → "Zagrebačka"), but the
# masculine ones change two words at once and fall outside any safe cutoff. These
# are the regular endings, tried as extra candidates before giving up.
_DEINFLECT = [
    (re.compile(r'ог\s+пута$', re.I), 'и пут'),
    (re.compile(r'ог\s+трга$', re.I), 'и трг'),
    (re.compile(r'ог\s+пролаза$', re.I), 'и пролаз'),
    (re.compile(r'ог$', re.I), 'и'),
    (re.compile(r'ег$', re.I), 'и'),
    (re.compile(r'е$', re.I), 'а'),
]


def candidates(name: str):
    """The name as written, then its plausible nominative forms."""
    yield name
    for pat, repl in _DEINFLECT:
        alt = pat.sub(repl, name)
        if alt != name:
            yield alt
    # "Trga Lazara Nešića" is the square "Trg Lazara Nešića", not a street named
    # after him — restore the dropped head rather than searching without it.
    for head, nom in (('Трга ', 'Трг '), ('Улице ', 'Улица '), ('Булевара ', 'Булевар ')):
        if name.startswith(head):
            yield nom + name[len(head):]


def resolve(name, by_name, aliases=None, cutoff=0.9):
    """A street name → its ways, via aliases then a conservative fuzzy pass."""
    raw = (aliases or {}).get(name.strip(), name)
    for cand in candidates(raw):
        n = norm(cand)
        if n in by_name:
            return by_name[n], n
    n = norm(raw)
    c = difflib.get_close_matches(n, list(by_name), n=1, cutoff=cutoff)
    return (by_name[c[0]], c[0]) if c else (None, n)


def to_geometry(coords):
    """GeoJSON geometry from a list of coordinate rings."""
    rounded = [[[round(x, 6), round(y, 6)] for x, y in c] for c in coords]
    return ({'type': 'LineString', 'coordinates': rounded[0]} if len(rounded) == 1
            else {'type': 'MultiLineString', 'coordinates': rounded})
