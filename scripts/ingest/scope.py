"""Locate the sheet's scope stations in OSM and build the 20 km scope area."""
import re
import statistics

from .geo import Scope, haversine

# Sheet spelling -> OSM spelling(s). Keys and values are normalised names.
ALIASES = {
    'glasshousemtns': ['glasshousemountains', 'glasshousemtns'],
    'coarparoo': ['coorparoo'],
    'airportdomestic': ['domesticairport', 'domestic', 'brisbanedomesticairport'],
    'airportinternational': ['internationalairport', 'international', 'brisbaneinternationalairport'],
    'central': ['central', 'brisbanecentral'],
    'romastreet': ['romastreet', 'brisbaneromastreet'],
    'kinggeorgesquare': ['kinggeorgesquare', 'kinggeorgesquarebusway'],
    'queenstreet': ['queenstreet', 'queenstreetbusstation', 'queenstreetbusway'],
    'culturalcentre': ['culturalcentre', 'culturalcentrebusway'],
}

STATION_WORDS = re.compile(r"(?i)\b(railway station|train station|station|platforms?|busway|bus station)\b")


def normalise(name):
    name = STATION_WORDS.sub('', name or '')
    name = name.replace('&', 'and').replace('Mt ', 'Mount ').replace('Mtns', 'Mountains')
    return re.sub(r'[^a-z0-9]+', '', name.lower())


def _centre(el, nodes):
    if 'lat' in el and 'lon' in el:
        return el['lat'], el['lon']
    if 'center' in el:
        return el['center']['lat'], el['center']['lon']
    pts = [nodes[n] for n in el.get('nodes', []) if n in nodes]
    if pts:
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    return None


def _rank(tags, busway):
    """Lower is better: prefer the canonical station node over areas/stop_areas."""
    rail = tags.get('railway')
    if busway:
        if tags.get('amenity') == 'bus_station' or (tags.get('public_transport') == 'station' and tags.get('bus') == 'yes'):
            return 0
        return 5
    if rail == 'station':
        return 0
    if rail == 'halt':
        return 1
    if tags.get('public_transport') == 'station' and tags.get('train') == 'yes':
        return 2
    if tags.get('public_transport') == 'station':
        return 3
    return 4


def candidate_index(elements, nodes=None):
    """name -> [(rank_key, type, id, lat, lon, tags)] for station-like OSM objects."""
    nodes = nodes or {}
    index = {}
    for el in elements:
        tags = el.get('tags') or {}
        stationish = (tags.get('railway') in ('station', 'halt', 'stop', 'tram_stop')
                      or tags.get('public_transport') == 'station' or tags.get('amenity') == 'bus_station')
        if not stationish or tags.get('disused') == 'yes' or tags.get('abandoned') == 'yes':
            continue
        pos = _centre(el, nodes)
        if not pos:
            continue
        for key in ('name', 'official_name', 'alt_name', 'short_name', 'name:en', 'old_name'):
            if tags.get(key):
                for part in tags[key].split(';'):
                    index.setdefault(normalise(part), []).append((el['type'], el['id'], pos[0], pos[1], tags))
    return index


def match_stations(stations, index, max_cluster_m=1500):
    """Resolve every sheet station to one OSM object.

    Candidates within `max_cluster_m` of each other are one physical station (node,
    area and stop_area); the best-ranked object wins. Several distant clusters are
    disambiguated by proximity to already-matched stations on the same line,
    otherwise marked ambiguous."""
    results = {}
    pending = []
    for st in stations:
        busway = (st.get('line') or '').lower() == 'busway'
        keys = ALIASES.get(normalise(st['name']), [normalise(st['name'])])
        cands = []
        for k in keys:
            cands.extend(index.get(k, []))
        uniq = {(c[0], c[1]): c for c in cands}
        cands = sorted(uniq.values(), key=lambda c: (_rank(c[4], busway), c[0] != 'node', c[1]))
        if busway:
            cands = [c for c in cands if _rank(c[4], True) == 0] or cands
        else:
            rail = [c for c in cands if _rank(c[4], False) <= 2]
            cands = rail or cands
        clusters = []
        for c in cands:
            for cl in clusters:
                if haversine(c[2], c[3], cl[0][2], cl[0][3]) <= max_cluster_m:
                    cl.append(c)
                    break
            else:
                clusters.append([c])
        if not clusters:
            results[st['name']] = {'status': 'unmatched', 'note': 'no OSM station with this name in the fetched envelope'}
        elif len(clusters) == 1:
            best = clusters[0][0]
            results[st['name']] = {'status': 'matched', 'osm_type': best[0], 'osm_id': best[1], 'lat': best[2], 'lon': best[3],
                                   'note': f'{len(clusters[0])} OSM object(s) at this station'}
        else:
            pending.append((st, clusters))
    for st, clusters in pending:
        same_line = [r for s in stations if s.get('line') == st.get('line') and s['name'] != st['name']
                     for r in [results.get(s['name'])] if r and r['status'] == 'matched']
        if same_line:
            mlat = statistics.median(r['lat'] for r in same_line)
            mlon = statistics.median(r['lon'] for r in same_line)
            clusters.sort(key=lambda cl: haversine(cl[0][2], cl[0][3], mlat, mlon))
            best = clusters[0][0]
            results[st['name']] = {'status': 'matched', 'osm_type': best[0], 'osm_id': best[1], 'lat': best[2], 'lon': best[3],
                                   'note': f'{len(clusters)} same-name places; chose the one nearest the {st.get("line")}'}
        else:
            results[st['name']] = {'status': 'ambiguous', 'note': f'{len(clusters)} OSM places share this name'}
    return results


def build_scope(matches, radius_m):
    centres = [(m['lat'], m['lon']) for m in matches.values() if m['status'] == 'matched']
    return Scope(centres, radius_m)
