"""Fetch and parse OpenStreetMap railway data.

Three interchangeable sources, all producing the same element dictionaries
(Overpass JSON shape: type, id, lat/lon, nodes, members, tags, version, ...):

  overpass   tiled Overpass API queries over the scope (default; no tools needed)
  file       existing Overpass JSON or OSM XML (.osm / .osm.gz) files
  pbf        a local .osm.pbf (e.g. Geofabrik) clipped and filtered with osmium-tool
  geofabrik  downloads queensland-latest.osm.pbf, then behaves like `pbf`
"""
import gzip
import hashlib
import json
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

USER_AGENT = 'TrainSim-ingest/2.0 (+https://github.com/EkimChau/TrainSim)'
OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
GEOFABRIK_URL = 'https://download.geofabrik.de/australia-oceania/australia/queensland-latest.osm.pbf'

LIFECYCLE = ('disused', 'abandoned', 'razed', 'construction', 'proposed', 'preserved')
ROUTE_TYPES = 'train|railway|light_rail|subway|tram|tracks'

# osmium tags-filter expressions equivalent to the Overpass railway query.
OSMIUM_FILTERS = (
    ['nwr/railway'] + [f'nwr/{p}:railway' for p in LIFECYCLE] +
    ['nwr/public_transport', 'r/route=train,railway,light_rail,subway,tram,tracks',
     'r/route_master', 'nwr/landuse=railway', 'nwr/power=substation', 'nwr/building=train_station',
     'nwr/amenity=bus_station']
)


def _bbox(b):
    s, w, n, e = b
    return f'({s},{w},{n},{e})'


def station_query(bbox):
    """Phase 1: every station-like object (incl. busway stations) to locate the sheet's stations."""
    b = _bbox(bbox)
    return ('[out:json][timeout:300];('
            f'nwr["railway"~"^(station|halt|stop|tram_stop)$"]{b};'
            f'nwr["public_transport"="station"]{b};'
            f'nwr["amenity"="bus_station"]{b};'
            ');out center tags;')


def railway_query(bbox):
    """Phase 2: every railway element in a tile, with way nodes and relation memberships."""
    b = _bbox(bbox)
    infra = [f'nwr["railway"]{b};']
    infra += [f'nwr["{p}:railway"]{b};' for p in LIFECYCLE]
    infra += [
        f'nwr["public_transport"]["train"="yes"]{b};',
        f'nwr["public_transport"]["light_rail"="yes"]{b};',
        f'nwr["public_transport"]["tram"="yes"]{b};',
        f'nwr["landuse"="railway"]{b};',
        f'nwr["power"="substation"]["substation"="traction"]{b};',
        f'nwr["building"="train_station"]{b};',
        f'rel["route"~"^({ROUTE_TYPES})$"]{b};',
    ]
    return ('[out:json][timeout:600][maxsize:536870912];'
            '(' + ''.join(infra) + ')->.infra;'
            '(rel(bn.infra)["type"~"^(route|public_transport|railway|site|route_master)$"];'
            'rel(bw.infra)["type"~"^(route|public_transport|railway|site|route_master)$"];)->.rels;'
            'rel(br.rels)["type"="route_master"]->.masters;'
            '(.infra;.rels;.masters;)->.all;'
            '.all out meta;'
            'way.all;node(w)->.wn;'
            '.wn out meta;')


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def overpass_post(query, endpoints=None, attempts=6):
    """POST a query, honouring 429/504 with exponential back-off and endpoint rotation.
    An HTTP 200 carrying a 'remark' runtime error is treated as failure."""
    endpoints = endpoints or OVERPASS_ENDPOINTS
    body = urlencode({'data': query}).encode()
    delay = 15
    last = None
    for attempt in range(attempts):
        url = endpoints[attempt % len(endpoints)]
        try:
            req = Request(url, data=body, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
            with urlopen(req, timeout=900) as res:
                raw = res.read()
            doc = json.loads(raw)
            remark = doc.get('remark') or ''
            if not isinstance(doc.get('elements'), list) or 'error' in remark.lower():
                raise RuntimeError(f'Overpass incomplete result: {remark[:200]}')
            return raw
        except (HTTPError, URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            last = exc
            code = getattr(exc, 'code', None)
            log(f'  overpass attempt {attempt + 1}/{attempts} on {url} failed: {code or ""} {exc}')
            if code in (400,):
                break
            time.sleep(delay)
            delay = min(delay * 2, 240)
    raise RuntimeError(f'Overpass failed after {attempts} attempts: {last}')


def cached_overpass(query, cache_dir, label, refresh=False, endpoints=None):
    """Run a query once and keep the raw bytes as an immutable snapshot keyed by the query hash."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(query.encode()).hexdigest()[:16]
    path = cache_dir / f'{label}-{key}.json'
    if path.exists() and not refresh:
        return path
    raw = overpass_post(query, endpoints)
    tmp = path.with_suffix('.part')
    tmp.write_bytes(raw)
    tmp.replace(path)
    return path


# ---------------------------------------------------------------- parsing
def _int(v, default=None):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def parse_overpass_json(path):
    raw = Path(path).read_bytes()
    doc = json.loads(raw)
    remark = doc.get('remark') or ''
    if not isinstance(doc.get('elements'), list) or 'error' in remark.lower():
        raise ValueError(f'Incomplete Overpass response: {path}: {remark}')
    elements = [e for e in doc['elements'] if e.get('type') in ('node', 'way', 'relation') and isinstance(e.get('id'), int)]
    meta = {'osm_timestamp': (doc.get('osm3s') or {}).get('timestamp_osm_base'),
            'generator': doc.get('generator', '')}
    return elements, raw, meta


def parse_osm_xml(path):
    """Stream-parse OSM XML (.osm or .osm.gz), as written by osmium or the OSM API."""
    path = Path(path)
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rb') as fh:
        raw = fh.read()
    elements, meta = [], {'osm_timestamp': None, 'generator': ''}
    import io
    for _event, el in ET.iterparse(io.BytesIO(raw), events=('end',)):
        tag = el.tag
        if tag == 'osm':
            meta['generator'] = el.get('generator', '')
        elif tag == 'meta':
            meta['osm_timestamp'] = el.get('osm_base')
        elif tag in ('node', 'way', 'relation'):
            item = {'type': tag, 'id': int(el.get('id')), 'version': _int(el.get('version'), 0),
                    'timestamp': el.get('timestamp'), 'changeset': _int(el.get('changeset')),
                    'user': el.get('user')}
            tags = {t.get('k'): t.get('v') for t in el.findall('tag')}
            if tags:
                item['tags'] = tags
            if tag == 'node':
                if el.get('lat') is None:
                    el.clear()
                    continue
                item['lat'], item['lon'] = float(el.get('lat')), float(el.get('lon'))
            elif tag == 'way':
                item['nodes'] = [int(nd.get('ref')) for nd in el.findall('nd')]
            else:
                item['members'] = [{'type': m.get('type'), 'ref': int(m.get('ref')), 'role': m.get('role') or ''}
                                   for m in el.findall('member')]
            if el.get('visible') == 'false' or el.get('action') == 'delete':
                el.clear()
                continue
            elements.append(item)
            el.clear()
    return elements, raw, meta


def parse_file(path):
    path = Path(path)
    name = path.name.lower()
    if name.endswith('.json'):
        return parse_overpass_json(path)
    if name.endswith(('.osm', '.osm.gz', '.xml')):
        return parse_osm_xml(path)
    if name.endswith('.pbf'):
        raise ValueError('Use --source pbf for .osm.pbf files (needs osmium-tool)')
    raise ValueError(f'Unsupported OSM file type: {path}')


# ---------------------------------------------------------------- PBF via osmium
def require_osmium():
    exe = shutil.which('osmium')
    if not exe:
        raise RuntimeError('osmium-tool is required for PBF input. Install it with '
                           '`brew install osmium-tool` (macOS) or `apt install osmium-tool` (Debian/Ubuntu), '
                           'or use --source overpass.')
    return exe


def pbf_to_osm(pbf, bbox, work_dir):
    """Clip a PBF to the scope envelope (complete ways/relations) and keep railway tags only."""
    exe = require_osmium()
    work_dir.mkdir(parents=True, exist_ok=True)
    s, w, n, e = bbox
    clipped = work_dir / 'scope.osm.pbf'
    filtered = work_dir / 'scope-railway.osm'
    log(f'osmium extract {pbf} -> {clipped}')
    subprocess.run([exe, 'extract', '--overwrite', '-s', 'smart', '-b', f'{w},{s},{e},{n}',
                    str(pbf), '-o', str(clipped)], check=True)
    log(f'osmium tags-filter -> {filtered}')
    subprocess.run([exe, 'tags-filter', '--overwrite', str(clipped), *OSMIUM_FILTERS,
                    '-o', str(filtered)], check=True)
    return filtered


def download_geofabrik(cache_dir, url=GEOFABRIK_URL, refresh=False):
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / url.rsplit('/', 1)[1]
    md5_url = url + '.md5'
    expected = None
    try:
        with urlopen(Request(md5_url, headers={'User-Agent': USER_AGENT}), timeout=60) as res:
            expected = res.read().decode().split()[0]
    except (HTTPError, URLError) as exc:
        log(f'warning: could not fetch {md5_url}: {exc}')
    if target.exists() and not refresh and expected and _md5(target) == expected:
        log(f'Reusing {target} (md5 ok)')
        return target
    log(f'Downloading {url}')
    tmp = target.with_suffix('.part')
    with urlopen(Request(url, headers={'User-Agent': USER_AGENT}), timeout=3600) as res, open(tmp, 'wb') as out:
        shutil.copyfileobj(res, out, 1 << 20)
    if expected and _md5(tmp) != expected:
        tmp.unlink()
        raise RuntimeError('Geofabrik download failed md5 verification')
    tmp.replace(target)
    return target


def _md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def merge_elements(batches):
    """Merge element lists from several snapshots, keeping the newest version of each (type, id)."""
    records = {}
    for elements in batches:
        for obj in elements:
            key = (obj['type'], obj['id'])
            old = records.get(key)
            if old is None or (obj.get('version') or 0, obj.get('timestamp') or '') >= (old.get('version') or 0, old.get('timestamp') or ''):
                if old is not None and obj['type'] == 'node' and 'lat' not in obj:
                    continue
                records[key] = obj
    return records
