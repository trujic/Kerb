#!/usr/bin/env python3
# ── BUILD NIŠ ZONE GEOMETRY ───────────────────────────────────────────────────
# Niš used to ship as 14 polygons traced off the operator's My Maps overlay —
# 1.72 km² of solid colour, of which two blobs (a 1.11 km² Green and a 0.43 km²
# Red) swallowed whole districts. Almost none of that area is parking. It told a
# driver standing in the middle of a park that they were in a paid zone.
#
# What the operator actually publishes is a street list per zone, many entries
# carrying the cross streets that bound them ("od Trga kralja Milana do Kralja
# Stevana Prvovenčanog"). This turns that list into real geometry: the street
# centrelines from OpenStreetMap, clipped to the named span where one is given.
#
# Run:  python3 scripts/build-nis-geometry.py
# Out:  public/zones/nis.json
#
# Sources: nisparking.rs (street lists) + OpenStreetMap via Overpass (geometry,
# © OpenStreetMap contributors, ODbL).

import json, re, math, sys, unicodedata, difflib, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'public/zones/nis.json'
BBOX = (43.28, 21.85, 43.36, 21.96)   # S, W, N, E — around Niš's charged area
ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]
ZONES = {
    'extra': ('Extra Zone', '#E6A700', 'паркинг-зоне-екстра-жута-зона'),
    'red':   ('Red Zone',   '#E25141', 'паркинг-зоне-прва-црвена-зона'),
    'green': ('Green Zone', '#2FB36B', 'паркинг-зоне-друга-зелена-зона'),
}

# The operator's list against OSM's naming. Every one of these was confirmed by
# looking at both spellings, not guessed: most are the operator's typos (Књегиње
# for Кнегиње, Кез for Кеј), a couple are genuine variants (Стевана/Стефана).
ALIASES = {
    'Поп Луке Лазаревић': 'Поп Луке Лазаревића',
    'Књегиње Љубице': 'Кнегиње Љубице',
    'Краља Стевана Првовенчаног': 'Краља Стефана Првовенчаног',
    'Трг учитеља Тасе': 'Трг учитељ Тасе',
    'Пријезднина': 'Пријездина',
    'Ратка Вукићевића': 'Ратка Вукичевића',
    'Трг краља Александра': 'Краља Александра',
    'Кез 29. децембра': 'Кеј 29. децембар',
    '7.јула': '7. јули',
    'улица 9. бригаде са прилазима': '9. бригаде',
}

# The cross streets that bound a span are written in the genitive ("do Dušanove",
# "do Obrenovićeve"), while OSM carries the nominative. Only these needed naming;
# the rest resolve on their own or through the fuzzy pass.
CROSS_ALIASES = {
    'Душанове': 'Душанова',
    'Обреновићеве': 'Обреновићева',
    'Кеја 29. децембра': 'Кеј 29. децембар',
    '7. јула': '7. јули',
    'Стевана Првовенчаног': 'Краља Стефана Првовенчаног',
    'Краља Стевана Првовенчаног': 'Краља Стефана Првовенчаног',
    'Књегиње Љубице': 'Кнегиње Љубице',
    'Кнегиње Љубице': 'Кнегиње Љубице',
    'Булевара 12. фебруар': 'Булевар 12. фебруар',
    'Трга Павла Стојковића': 'Трг Павла Стојковића',
    'Обилићевог венца': 'Обилићев венац',
    'Генерала Милојка Лешјанина': 'Генерала Милојка Лешјанина',
    'Ћирила и Методија': 'Ћирила и Методија',
    'Војводе Мишића': 'Војводе Мишића',
    'Булевара Немањића': 'Булевар Немањића',
    'Ђуке Динић': 'Ђуке Динић',
    'Љиljане Спасић': 'Љиљане Спасић',
}

# Entries that are car parks, not streets. The operator describes them by how you
# reach them ("plato beside the Čair hall, approached from 9. brigade"), which no
# street lookup can resolve — they are matched against amenity=parking instead.
# "Bulevar Nemanjića (pijaca 'Krive livade')" is the market's car park, not the
# boulevard. Read as a street it painted four kilometres of road as Extra Zone —
# the strictest and dearest of the three — when only the market is.
LOT_RE = re.compile(r'паркирал|плато|простор|са прилаз|пијац', re.I)

# Niš the city administers villages several kilometres out, and street names
# repeat: there is a Prvomajska in half of them, and a Kralja Aleksandra 7.5 km
# from the centre. Matching by name alone dragged those in, drawing charged
# parking across the countryside. The operator's own overlay fits inside 1.61 km
# of the centre, so anything past twice that is a namesake, not the street.
CENTRE = (43.3209, 21.8958)
CENTRE_RADIUS_M = 2000   # a street with nothing this close to the centre is a namesake
SPREAD_M = 1200          # …and a piece this far from the rest of it is a different street

CYR = "абвгдђежзијклљмнњопрстћуфхцчџш"
LAT = ["a","b","v","g","d","đ","e","ž","z","i","j","k","l","lj","m","n","nj",
       "o","p","r","s","t","ć","u","f","h","c","č","dž","š"]
TRANSLIT = dict(zip(CYR, LAT))


def norm(s: str) -> str:
    """Comparable form: latin, lowercase, no punctuation, no parenthetical.

    The operator's own text is not always well formed — the Đuke Dinić span opens
    a bracket it never closes ("do ulice Ljiljane Spasić (nekadašnja ulica Franca
    Rozmana"). Stripping only balanced brackets left the old name glued to the new
    one, no street matched, and the span silently fell back to the whole street.
    """
    s = re.sub(r'\([^)]*\)', '', s)
    s = re.sub(r'\(.*$', '', s).lower()
    s = ''.join(TRANSLIT.get(c, c) for c in s)
    s = re.sub(r'^\s*(ul\.|ulica)\s+', '', s)
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', s)).strip()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': 'Kerb/1.0 (+kerb.rs)'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')


DATA = Path(__file__).resolve().parent / 'data'


def overpass(query: str, cache: str) -> dict:
    """Overpass with an on-disk cache.

    The public instance is a shared volunteer resource and answers these two
    queries with several megabytes each. Cached so a rerun — to re-parse the
    street list, to adjust an alias — costs nothing. Delete the file in
    scripts/data/ to refetch.
    """
    f = DATA / cache
    if f.exists():
        print(f'  cached: {f.name}')
        return json.loads(f.read_text(encoding='utf-8'))
    for ep in ENDPOINTS:
        try:
            data = urllib.parse.urlencode({'data': query}).encode()
            body = urllib.request.urlopen(
                urllib.request.Request(ep, data=data,
                                       headers={'User-Agent': 'Kerb/1.0'}), timeout=240).read()
            f.write_bytes(body)
            return json.loads(body)
        except Exception as e:
            print(f'  {ep} failed: {e}', file=sys.stderr)
    raise SystemExit('every Overpass endpoint failed')


def street_lists() -> dict:
    """Scrape nisparking.rs for each zone's street list, with any span note."""
    out = {}
    for key, (_, _, slug) in ZONES.items():
        url = 'https://www.nisparking.rs/sr/' + urllib.parse.quote(f'паркирање/паркинг-зоне/{slug}')
        html = fetch(url)
        html = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', html)
        html = re.sub(r'(?is)<br\s*/?>|</p>|</li>|</td>|</tr>|</h[1-6]>|</div>', '\n', html)
        text = re.sub(r'(?is)<[^>]+>', ' ', html)
        import html as H
        lines = [re.sub(r'\s+', ' ', l).strip() for l in H.unescape(text).split('\n')]
        lines = [l for l in lines if l and l not in ('!--', '-->')]
        i = next(k for k, l in enumerate(lines) if l.startswith('Улице у'))
        j = next((k for k in range(i, len(lines))
                  if lines[k] in ('Претходна', 'Следећа', 'Брза навигација')), len(lines))
        items = []
        for l in lines[i + 1:j]:
            # A line that opens with "od" or a bracket qualifies the street above it.
            if (l.startswith('(') or l.lower().startswith('од ')) and items:
                items[-1]['span'] = l.strip('()')
            else:
                items.append({'street': l, 'span': None})
        out[key] = items
        print(f'  {key:6} {len(items):3} entries')
    return out


# ── clipping a street to the span the operator names ──────────────────────────
# Roughly half the list reads "Vardarska, od Obilićevog venca do Generala Milojka
# Lešjanina" — only that run is charged, and drawing the whole street tells a
# driver parked past the end that they owe money. So the street's ways are
# chained end to end, the two cross streets are located along that chain, and
# everything outside is dropped.

def _dist_centre(lat, lon):
    return math.hypot((lat - CENTRE[0]) * 111320,
                      (lon - CENTRE[1]) * 111320 * math.cos(math.radians(lat)))


def _m(lat):
    return 111320 * math.cos(math.radians(lat)), 111320


JOIN_TOL_M = 25   # ways of one street meeting across a junction, not at a node
CROSS_TOL_M = 130 # how far a bounding cross street may sit from the street's end


def _chain(ways):
    """Join a street's ways into ordered polylines.

    Endpoints are matched with a tolerance rather than exactly: OSM splits a
    street at junctions, and the two halves often stop either side of the
    crossing instead of sharing a node. Requiring an exact match left streets
    like Jovana Skerlića as two chains, and a span whose ends landed on
    different chains could never be resolved.
    """
    parts = [[(p['lon'], p['lat']) for p in w['geometry']] for w in ways]
    chains = []
    while parts:
        cur = parts.pop(0)
        joined = True
        while joined:
            joined = False
            for i, q in enumerate(parts):
                for a, b in ((cur[-1], q[0]), (cur[-1], q[-1]), (cur[0], q[0]), (cur[0], q[-1])):
                    kx, ky = _m(a[1])
                    if math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky) <= JOIN_TOL_M:
                        if cur[-1] == a and q[0] == b:   cur = cur + q[1:]
                        elif cur[-1] == a and q[-1] == b: cur = cur + q[::-1][1:]
                        elif cur[0] == a and q[0] == b:   cur = q[::-1] + cur[1:]
                        else:                             cur = q + cur[1:]
                        parts.pop(i); joined = True; break
                if joined: break
        chains.append(cur)
    return chains


def _cum(chain):
    kx, ky = _m(chain[0][1])
    out = [0.0]
    for i in range(len(chain) - 1):
        (x1, y1), (x2, y2) = chain[i], chain[i + 1]
        out.append(out[-1] + math.hypot((x2 - x1) * kx, (y2 - y1) * ky))
    return out


def _closest_along(chain, cum, cross_pts):
    """Distance along `chain` of its closest approach to a cross street, and how
    close that approach actually is — a big gap means the two never meet."""
    kx, ky = _m(chain[0][1])
    best = (1e9, None)
    for i, (x, y) in enumerate(chain):
        for cx, cy in cross_pts:
            d = math.hypot((x - cx) * kx, (y - cy) * ky)
            if d < best[0]: best = (d, cum[i])
    return best


def clip_to_span(ways, span, by_name):
    """Ways clipped to the span, or None when the span cannot be resolved."""
    names = re.findall(r'(?:од|до)\s+(?:раскрснице\s+са\s+улицом\s+|улице\s+)?([^,]+?)(?=\s+до\s|\s*$|\s*\))',
                       span, re.I)
    if len(names) != 2:
        return None
    ends = []
    for nm in names:
        nm = nm.strip().strip('.,);')
        key = norm(CROSS_ALIASES.get(nm, ALIASES.get(nm, nm)))
        if key not in by_name:
            c = difflib.get_close_matches(key, list(by_name), n=1, cutoff=0.86)
            if not c: return None
            key = c[0]
        ends.append([(p['lon'], p['lat']) for w in by_name[key] for p in w['geometry']])

    out = []
    for chain in _chain(ways):
        if len(chain) < 2: continue
        cum = _cum(chain)
        (dA, tA), (dB, tB) = _closest_along(chain, cum, ends[0]), _closest_along(chain, cum, ends[1])
        # Both ends must actually touch this chain; 60 m allows for a junction
        # drawn as a small square rather than a single shared node.
        if dA > CROSS_TOL_M or dB > CROSS_TOL_M or tA is None or tB is None: continue
        lo, hi = sorted((tA, tB))
        if hi - lo < 20: continue
        kept = [pt for pt, t in zip(chain, cum) if lo <= t <= hi]
        if len(kept) >= 2: out.append(kept)
    return out or None


RENAME_RE = re.compile(r'\((?:некадашња|бивша)\s*(?:улица\s*)?([^)]+)', re.I)


def harvest_renames(lists) -> dict:
    """Old name → current name, taken from the operator's own annotations.

    Niš has been renaming streets, and the three sources are at different stages:
    the operator writes "Ljiljane Spasić (nekadašnja ulica Franca Rozmana)", OSM
    has already moved to the new name, and Google still labels the old one. Where
    OSM is the one lagging, the operator has handed us the mapping for free —
    so read it rather than hard-coding another alias by hand.
    """
    out = {}
    for items in lists.values():
        for it in items:
            for txt in (it['street'], it['span'] or ''):
                m = RENAME_RE.search(txt)
                if m:
                    current = re.sub(r'\s*\(.*$', '', it['street']).strip()
                    out[m.group(1).strip()] = current
    return out


def main():
    print('nisparking.rs — street lists')
    lists = street_lists()
    renames = harvest_renames(lists)
    for old, new in renames.items():
        print(f'  rename: {old} -> {new}')

    print('Overpass — street centrelines')
    ways = overpass(f'''[out:json][timeout:180];
way["highway"~"^(residential|tertiary|secondary|primary|unclassified|living_street|pedestrian|trunk)$"]["name"]
  ({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
out geom tags;''', 'nis-osm-streets.json')['elements']
    print(f'  {len(ways)} segments')

    print('Overpass — car parks')
    lots = [e for e in overpass(f'''[out:json][timeout:120];
way["amenity"="parking"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
out geom tags;''', 'nis-osm-parking.json')['elements'] if e.get('geometry')]
    print(f'  {len(lots)} car parks')

    by_name = {}
    for w in ways:
        if w.get('geometry'):
            by_name.setdefault(norm(w['tags']['name']), []).append(w)
    keys = list(by_name)

    features, report = [], {'matched': [], 'lots': [], 'missing': [], 'far': []}
    for key, items in lists.items():
        zone, color, _ = ZONES[key]
        for it in items:
            raw = it['street']
            # An alias settles it: "ulica 9. brigade sa prilazima" reads like a car
            # park to LOT_RE but is a street the operator described by its approaches.
            # The qualifier counts too: the market entry carries "Bulevar Nemanjića"
            # on one line and "(pijaca ...)" on the next, and only the second says
            # what it actually is.
            if raw not in ALIASES and LOT_RE.search(f"{raw} {it['span'] or ''}"):
                report['lots'].append((zone, raw))
                continue
            name = ALIASES.get(raw, raw)
            n = norm(name)
            if n not in by_name:
                # OSM may still carry the pre-rename name.
                old_for = next((o for o, cur in renames.items() if norm(cur) == n), None)
                if old_for and norm(old_for) in by_name:
                    n = norm(old_for)
            if n not in by_name:
                c = difflib.get_close_matches(n, keys, n=1, cutoff=0.9)
                if not c:
                    report['missing'].append((zone, raw))
                    continue
                n = c[0]
            # A charged street runs in one piece. Where the name also belongs to a
            # street in one of the villages Niš administers, OSM hands back both,
            # and the far one used to be drawn as paid parking across farmland.
            cand = [(min(_dist_centre(p['lat'], p['lon']) for p in w['geometry']), w)
                    for w in by_name[n]]
            here = min(d for d, _ in cand)
            if here > CENTRE_RADIUS_M:
                report['far'].append((zone, raw))
                continue
            segs = [w for d, w in cand if d <= here + SPREAD_M]
            clipped = clip_to_span(segs, it['span'], by_name) if it['span'] else None
            if clipped:
                coords = [[[round(x, 6), round(y, 6)] for x, y in c] for c in clipped]
            else:
                coords = [[[round(p['lon'], 6), round(p['lat'], 6)] for p in w['geometry']]
                          for w in segs]
            features.append({
                'type': 'Feature',
                'properties': {
                    'name': segs[0]['tags']['name'],
                    'zone': zone,
                    'color': color,
                    # The operator bounds many streets by cross street. Kept as the
                    # source wrote it and flagged, rather than silently drawing the
                    # whole street as if all of it were charged.
                    # `clipped` — the geometry is the span the operator named.
                    # `partial` — a span was given but could not be resolved, so
                    # this draws the whole street and over-claims at its ends.
                    **({'span': it['span'],
                        **({'clipped': True} if clipped else {'partial': True})}
                       if it['span'] else {}),
                },
                'geometry': {'type': 'MultiLineString', 'coordinates': coords}
                            if len(coords) > 1 else
                            {'type': 'LineString', 'coordinates': coords[0]},
            })
            report['matched'].append((zone, raw, segs[0]['tags']['name'], bool(clipped)))

    OUT.write_text(json.dumps({
        'type': 'FeatureCollection',
        'attribution': 'Streets © OpenStreetMap contributors (ODbL); zones from nisparking.rs',
        'features': features,
    }, ensure_ascii=False), encoding='utf-8')

    print(f'\nwrote {len(features)} features -> {OUT}')
    print(f'  matched {len(report["matched"])}, car parks {len(report["lots"])}, '
          f'unmatched {len(report["missing"])}')
    for zone, raw in report['far']:
        print(f'    OUT OF TOWN  {zone:11} {raw}')
    for zone, raw in report['missing']:
        print(f'    MISSING  {zone:11} {raw}')
    for zone, raw in report['lots']:
        print(f'    CAR PARK {zone:11} {raw[:70]}')


if __name__ == '__main__':
    main()
