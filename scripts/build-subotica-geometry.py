#!/usr/bin/env python3
# ── BUILD SUBOTICA ZONE GEOMETRY ──────────────────────────────────────────────
# suparking.rs publishes the cleanest source of the three cities so far: a real
# table per zone, "Назив улице" beside "Део улице", where the second column is
# either "цела улица" or the run between two named cross streets. No guessing at
# what a line means — the operator has already separated the street from its span.
#
# Run:  python3 scripts/build-subotica-geometry.py
# Out:  public/zones/subotica.json
#
# Sources: suparking.rs (street tables) + OpenStreetMap via Overpass (geometry,
# © OpenStreetMap contributors, ODbL).

import html, json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zone_geometry as G

OUT = Path(__file__).resolve().parent.parent / 'public/zones/subotica.json'
BBOX = (46.05, 19.60, 46.15, 19.73)
CENTRE = (19.6651, 46.1005)   # (lon, lat) — Trg slobode
CENTRE_RADIUS_M, SPREAD_M = 3000, 1200

ZONES = {
    'crvena': ('Red Zone',    '#E25141', 'crvena-zona'),
    'zuta':   ('Yellow Zone', '#E6A700', 'zuta-zona'),
    'zelena': ('Green Zone',  '#2FB36B', 'zelena-zona'),
    'plava':  ('Blue Zone',   '#2F6BE0', 'plava-zona'),
}

# Subotica is bilingual, and the operator writes several names in Hungarian order
# — surname first — while OSM files them in Serbian order. Not typos: the same
# street, read the other way round. Each confirmed by finding the OSM street and
# checking it is the same person and the same place.
ALIASES = {
    'Лањи Ернеа': 'Ернеа Лањиа',
    'Кошут Лајоша': 'Трг Лајоша Кошута',
    'Парка Рајхла Ференца': 'Парк Ференца Рајхла',
    'Парк Рајхл Ференца': 'Парк Ференца Рајхла',
    'Ендреа Бајчи Жилинског': 'Ендре Бајчи Жилинског',
    'Шандор Петефија': 'Шандора Петефија',
    'Браће Радић': 'Браће Радића',
    'Рудић улица': 'Рудић',
    'Дуриторске': 'Дурмиторска',   # operator's typo — the street is Durmitorska
}

# Entries that describe an area rather than a street: "the space between the
# streets X, Y and Z" is a block interior, and no street lookup reaches it.
AREA_RE = re.compile(r'простор\s+између|плато|паркирал', re.I)

WHOLE_RE = re.compile(r'цела\s+улица', re.I)
# "od A do B", and sometimes "... i deo od B do C" — a second span continuing the
# first. Both ends of the whole run are what matters, so every name is collected
# and the outermost pair used.
# The whole phrase after "od"/"do" is captured — including a leading "Trga" or
# "ulice". Stripping those here turned "od Trga Sinagoge" into "Sinagoge", which
# matches nothing; G.candidates() already knows how to turn "Trga X" back into
# "Trg X", and doing it in one place beats doing it in two.
SPAN_RE = re.compile(r'(?:од|до)\s+([^,]+?)'
                     r'(?=\s+до\s|\s+и\s+део\s|\s*$|\s*\))', re.I)


def street_tables() -> dict:
    """Scrape each zone page's street table."""
    out = {}
    for key, (_, _, slug) in ZONES.items():
        page = G.fetch(f'https://suparking.rs/{slug}/')
        tab = next((t for t in re.findall(r'(?is)<table.*?</table>', page)
                    if 'Назив улице' in t), None)
        if not tab:
            print(f'  {key}: no street table'); continue
        rows = []
        for tr in re.findall(r'(?is)<tr.*?</tr>', tab):
            cells = [re.sub(r'\s+', ' ', html.unescape(
                        re.sub(r'(?is)<[^>]+>', ' ', td))).strip()
                     for td in re.findall(r'(?is)<t[dh][^>]*>(.*?)</t[dh]>', tr)]
            if cells and cells[0] and cells[0] != 'Назив улице':
                rows.append({'street': cells[0], 'part': cells[1] if len(cells) > 1 else ''})
        out[key] = rows
        print(f'  {key:7} {len(rows):3} streets')
    return out


BAY_MAX_M = 40   # a bay further than this from a charged street serves another one


def _seg_dist(p, a, b):
    """Metres from point p to segment a–b, all as (lon, lat)."""
    import math
    kx = 111320 * math.cos(math.radians(p[1]))
    px, py = p[0] * kx, p[1] * 111320
    ax, ay = a[0] * kx, a[1] * 111320
    bx, by = b[0] * kx, b[1] * 111320
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def main():
    print('suparking.rs — street tables')
    lists = street_tables()

    print('Overpass — street centrelines')
    ways = G.overpass(G.streets_query(BBOX), 'subotica-osm-streets.json')['elements']
    print(f'  {len(ways)} segments')
    by_name = G.index_by_name(ways)

    features, report = [], {'clipped': 0, 'whole': 0, 'partial': [], 'area': [], 'missing': []}
    for key, rows in lists.items():
        zone, color, _ = ZONES[key]
        for row in rows:
            raw, part = row['street'], row['part']
            if AREA_RE.search(f'{raw} {part}'):
                report['area'].append((zone, f'{raw} {part}'.strip()))
                continue

            segs, _ = G.resolve(raw, by_name, ALIASES)
            if not segs:
                report['missing'].append((zone, raw))
                continue
            segs, far = G.near_centre(segs, CENTRE, CENTRE_RADIUS_M, SPREAD_M)
            if far:
                report['missing'].append((zone, f'{raw} (only outside town)'))
                continue

            clipped = None
            if part and not WHOLE_RE.search(part):
                names = [n.strip().strip('.,);') for n in SPAN_RE.findall(part)]
                ends = []
                for nm in (names[0], names[-1]) if len(names) >= 2 else ():
                    w, _ = G.resolve(nm, by_name, ALIASES, cutoff=0.86)
                    if w:
                        ends.append([(p['lon'], p['lat']) for x in w for p in x['geometry']])
                if len(ends) == 2:
                    clipped = G.clip_between(segs, ends)

            coords = clipped or [[(p['lon'], p['lat']) for p in w['geometry']] for w in segs]
            props = {'name': segs[0]['tags']['name'], 'zone': zone, 'color': color}
            if part and not WHOLE_RE.search(part):
                props['span'] = part
                if clipped:
                    props['clipped'] = True
                    report['clipped'] += 1
                else:
                    # Drawn full length, so it over-claims at the ends. Said out
                    # loud rather than passed off as the operator's own span.
                    props['partial'] = True
                    report['partial'].append((zone, raw, part))
            else:
                report['whole'] += 1

            features.append({'type': 'Feature', 'properties': props,
                             'geometry': G.to_geometry(coords)})

    # ── the bays themselves ───────────────────────────────────────────────────
    # The street list says WHICH streets are charged; it cannot say where along
    # them the bays are, and a centreline is half a road width off the kerb by
    # construction. Subotica has been mapped properly — 311 parking objects, 105
    # of them fee=yes, and 92 carrying the city's exact charging hours — so the
    # bays are drawn as themselves and take their zone from the nearest charged
    # street. OSM knows where; the operator knows which zone. Neither alone does.
    print('Overpass — parking bays')
    bays = [e for e in G.overpass(
        f'[out:json][timeout:180];\n'
        f'(way["amenity"="parking"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});\n'
        f' node["amenity"="parking"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););\n'
        f'out geom tags;', 'subotica-osm-parking.json')['elements'] if e.get('geometry')]
    print(f'  {len(bays)} parking objects')

    lines = [(f['properties']['zone'], bool(f['properties'].get('partial')),
              [f['geometry']['coordinates']] if f['geometry']['type'] == 'LineString'
              else f['geometry']['coordinates']) for f in features]

    def zone_at(lat, lon):
        """Nearest charged street, preferring one whose extent is actually known.

        A street whose span could not be resolved is drawn full length and admits
        it (`partial`). Letting one win on distance alone cost real errors: the
        Yellow run of Somborski put covered the whole 1462 m and so lay on top of
        the Green run inside it, taking three of Green's bays with it. An exact
        line beats a partial one at any distance inside the threshold; a partial
        line is used only when nothing exact is near.
        """
        best = {False: (1e9, None), True: (1e9, None)}
        for zone, partial, rings in lines:
            for ring in rings:
                for i in range(len(ring) - 1):
                    d = _seg_dist((lon, lat), ring[i], ring[i + 1])
                    if d < best[partial][0]:
                        best[partial] = (d, zone)
        return best[False] if best[False][0] <= BAY_MAX_M else best[True]

    added, orphan = 0, 0
    for e in bays:
        t = e['tags']
        if t.get('fee') != 'yes':
            continue
        g = e['geometry']
        lat = sum(p['lat'] for p in g) / len(g)
        lon = sum(p['lon'] for p in g) / len(g)
        d, zone = zone_at(lat, lon)
        # Beyond this the nearest charged street is not the one the bay serves —
        # squares are the usual case, where the bays ring a centreline that runs
        # through the middle. Left out rather than guessed onto a zone.
        if d > BAY_MAX_M or not zone:
            orphan += 1
            continue
        ring = [[round(p['lon'], 6), round(p['lat'], 6)] for p in g]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        colour = next(c for z2, c, _ in ZONES.values() if z2 == zone)
        features.append({'type': 'Feature', 'properties': {
            'name': '', 'zone': zone, 'color': colour,
            'bay': True, 'osm': f"way/{e['id']}",
            'parking': t.get('parking'),
            **({'hours': t['fee:conditional']} if 'fee:conditional' in t else {}),
        }, 'geometry': {'type': 'Polygon', 'coordinates': [ring]}})
        added += 1
    print(f'  {added} paid bays placed, {orphan} too far from any charged street')

    OUT.write_text(json.dumps({
        'type': 'FeatureCollection',
        'attribution': 'Streets © OpenStreetMap contributors (ODbL); zones from suparking.rs',
        'features': features,
    }, ensure_ascii=False), encoding='utf-8')

    print(f'\nwrote {len(features)} features -> {OUT}')
    print(f'  whole streets {report["whole"]}, clipped to span {report["clipped"]}, '
          f'span unresolved {len(report["partial"])}')
    for zone, raw, part in report['partial']:
        print(f'    UNRESOLVED  {zone:12} {raw[:26]:28} {part[:44]}')
    for zone, raw in report['area']:
        print(f'    AREA        {zone:12} {raw[:66]}')
    for zone, raw in report['missing']:
        print(f'    MISSING     {zone:12} {raw}')


if __name__ == '__main__':
    main()
