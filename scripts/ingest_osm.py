#!/usr/bin/env python3
"""OSM/ORM-native railway ETL: immutable source → indexed SQLite → aligned WGS84 world.
Standard library only. Never guesses survey geometry or uses diagram pixel coordinates.
"""
import argparse
import datetime as dt
import hashlib
import heapq
import json
import math
from collections import defaultdict
from pathlib import Path
import re
import sqlite3
import sys
from urllib.request import Request, urlopen
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data/reference/diagram-catalog.json'
REGIONS = {
    # Named overlapping corridor query envelopes, SEQ. Scoped to the 2012 diagram's extent.
    'sunshine-coast': (-26.10, 152.48, -27.12, 153.20),
    'brisbane': (-27.13, 152.60, -27.75, 153.43),
    'gold-coast': (-27.74, 153.04, -28.20, 153.58),
    'west-darling-downs': (-27.25, 151.95, -27.80, 152.65),
}


def normalized(name):
    return re.sub(r'[^a-z0-9]+', '', re.sub(r'(?i)\b(railway station|train station|station)\b', '', name or '').lower())


def distance(a, b):
    # Haversine metres, WGS84 spherical approximation; used ONLY for nearest-node matching and path ranking.
    p1,p2=map(math.radians,(a[0],b[0]))
    dlat=p2-p1; dlng=math.radians(b[1]-a[1]); x=math.sin(dlat/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dlng/2)**2
    return 12742000*math.asin(min(1,math.sqrt(x)))


def in_region(lat,lon):
    return any(south <= lat <= north and west <= lon <= east
               for north,west,south,east in REGIONS.values())


def overpass_query(box):
    north,west,south,east=box
    bbox=f'({south},{west},{north},{east})'
    # Include all railway line tags, station/halt/stop and attached OSM node references.
    # Full OSM tags and relation members are retained. Train route relations may span beyond bbox.
    return ('[out:json][timeout:180];('
            f'way["railway"]{bbox};'
            f'node["railway"]{bbox};'
            f'relation["railway"]{bbox};'
            f'relation["route"="train"]{bbox};'
            ');(._;>;);out body;')


def download_snapshots(out,endpoint='https://overpass-api.de/api/interpreter'):
    raw=out/'raw';raw.mkdir(parents=True,exist_ok=True)
    for region,bbox in REGIONS.items():
        target=raw/f'{region}.json'
        if target.exists():
            print(f'Reusing immutable snapshot {target}',file=sys.stderr);continue
        body=urlencode({'data':overpass_query(bbox)}).encode('utf-8')
        req=Request(endpoint,data=body,headers={'User-Agent':'TrainSim-Research-Prototype/0.2 (+https://github.com/EkimChau/TrainSim)', 'Accept':'application/json'})
        print(f'Fetching {region} from {endpoint}',file=sys.stderr)
        # Fail hard on upstream failure; never pass off the seed as extracted real infrastructure.
        with urlopen(req,timeout=240) as response: buf=response.read()
        snapshot=json.loads(buf)
        if not isinstance(snapshot.get('elements'),list) or snapshot.get('remark'):
            raise RuntimeError(f'Overpass returned an incomplete/invalid result for {region}: {snapshot.get("remark")}')
        target.write_bytes(buf)
        print(f'  {len(snapshot["elements"])} objects, sha256={hashlib.sha256(buf).hexdigest()}',file=sys.stderr)
    return sorted(raw.glob('*.json'))


def load_sources(paths):
    records={};evidence=[]
    for path in paths:
        data=path.read_bytes();root=json.loads(data)
        if not isinstance(root.get('elements'),list) or root.get('remark'):
            raise ValueError(f'Incomplete Overpass response: {path}: {root.get("remark")}')
        for obj in root['elements']:
            if obj.get('type') not in ('node','way','relation') or not isinstance(obj.get('id'),int):continue
            key=obj['type'],obj['id'];old=records.get(key)
            if old is None or (obj.get('version',0),obj.get('timestamp',''))>(old.get('version',0),old.get('timestamp','')):
                records[key]=obj
        evidence.append({'file':path.name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'elements':len(root['elements']),'osm3s':root.get('osm3s',{}),'fixture':str(root.get('generator','')).startswith('TrainSim synthetic')})
    return records,evidence


def create_db(path,objects,diagram,evidence):
    if path.exists():path.unlink()
    con=sqlite3.connect(path)
    con.executescript('''
      PRAGMA journal_mode=WAL;
      CREATE TABLE source_snapshot(file TEXT PRIMARY KEY,sha256 TEXT NOT NULL,bytes INTEGER,objects INTEGER,osm3s_json TEXT NOT NULL);
      CREATE TABLE osm_objects(type TEXT NOT NULL,id INTEGER NOT NULL,version INTEGER,timestamp TEXT,tags_json TEXT NOT NULL,object_json TEXT NOT NULL,PRIMARY KEY(type,id));
      CREATE TABLE osm_nodes(id INTEGER PRIMARY KEY,lat REAL NOT NULL,lon REAL NOT NULL);
      CREATE TABLE osm_ways(id INTEGER PRIMARY KEY,railway TEXT,nodes_json TEXT NOT NULL);
      CREATE TABLE osm_relations(id INTEGER PRIMARY KEY,tags_json TEXT NOT NULL,members_json TEXT NOT NULL);
      CREATE TABLE diagram_stops(name TEXT PRIMARY KEY,modes_json TEXT NOT NULL,lines_json TEXT NOT NULL,match_status TEXT NOT NULL,osm_type TEXT,osm_id INTEGER,match_distance_m REAL);
      CREATE TABLE diagram_lines(id TEXT PRIMARY KEY,mode TEXT NOT NULL,stops_json TEXT NOT NULL);
      CREATE TABLE graph_edges(way_id INTEGER NOT NULL,seq INTEGER NOT NULL,source_node INTEGER NOT NULL,target_node INTEGER NOT NULL,length_m REAL NOT NULL,PRIMARY KEY(way_id,seq));
      CREATE INDEX osm_tags_type ON osm_objects(type);
      CREATE INDEX edges_source ON graph_edges(source_node);
      CREATE INDEX edges_target ON graph_edges(target_node);
      CREATE INDEX nodes_latlon ON osm_nodes(lat,lon);
    ''')
    con.executemany('INSERT INTO source_snapshot VALUES(?,?,?,?,?)',[(i['file'],i['sha256'],i['bytes'],i['elements'],json.dumps(i['osm3s'])) for i in evidence])
    for (kind,id),obj in sorted(objects.items()):
        tags=obj.get('tags',{})
        con.execute('INSERT INTO osm_objects VALUES(?,?,?,?,?,?)',(kind,id,obj.get('version'),obj.get('timestamp'),json.dumps(tags,sort_keys=True),json.dumps(obj,separators=(',',':'))))
        if kind=='node' and all(k in obj for k in ('lat','lon')):
            con.execute('INSERT INTO osm_nodes VALUES(?,?,?)',(id,obj['lat'],obj['lon']))
        elif kind=='way':
            con.execute('INSERT INTO osm_ways VALUES(?,?,?)',(id,tags.get('railway'),json.dumps(obj.get('nodes',[]))))
        elif kind=='relation':
            con.execute('INSERT INTO osm_relations VALUES(?,?,?)',(id,json.dumps(tags),json.dumps(obj.get('members',[]))))
    for line in diagram['lines']:con.execute('INSERT INTO diagram_lines VALUES(?,?,?)',(line['id'],line['mode'],json.dumps(line['stops'])))
    con.commit()
    return con


def prepare_world(objects,diagram,con,max_station_m=450):
    nodes={id:o for (kind,id),o in objects.items() if kind=='node' and 'lat' in o and 'lon' in o}
    tracks=[];stations=[];signals=[];graph=defaultdict(list);rail_nodes={}
    for (kind,id),obj in sorted(objects.items()):
        tags=obj.get('tags',{});railway=tags.get('railway')
        if kind=='way' and railway in {'rail','narrow_gauge','light_rail','subway'}:
            node_ids=obj.get('nodes',[])
            if len(node_ids)<2 or any(n not in nodes for n in node_ids):
                # Never use a broken/partial way for a real track.
                continue
            coords=[{'lat':nodes[n]['lat'],'lng':nodes[n]['lon']} for n in node_ids]
            if not any(in_region(p['lat'],p['lng']) for p in coords):continue
            tracks.append({'id':f'way/{id}','osmId':id,'type':railway,'tags':tags,'nodeIds':node_ids,'coords':coords,'source':'OSM'})
            for n,p in zip(node_ids,coords):rail_nodes[n]=(p['lat'],p['lng'])
            for i,(a,b) in enumerate(zip(node_ids,node_ids[1:])):
                length=distance(rail_nodes[a],rail_nodes[b]);graph[a].append((b,length));graph[b].append((a,length))
                con.execute('INSERT INTO graph_edges VALUES(?,?,?,?,?)',(id,i,a,b,length))
        if kind=='node' and railway=='signal' and in_region(obj['lat'],obj['lon']):
            signals.append({'id':f'node/{id}','lat':obj['lat'],'lng':obj['lon'],'tags':tags,'source':'OSM'})
    candidates=defaultdict(list)
    for (kind,id),obj in objects.items():
        tags=obj.get('tags',{}); rail=tags.get('railway')
        if rail not in ('station','halt') and not (tags.get('public_transport')=='station' and tags.get('train')=='yes'):continue
        if tags.get('disused')=='yes' or tags.get('abandoned')=='yes':continue
        pos=(obj.get('lat'),obj.get('lon'))
        if None in pos and kind=='way':
            pts=[nodes[n] for n in obj.get('nodes',[]) if n in nodes]
            if pts:pos=(sum(p['lat'] for p in pts)/len(pts),sum(p['lon'] for p in pts)/len(pts))
        if None in pos or not in_region(*pos):continue
        names=[tags.get(t,'') for t in ('name','official_name','alt_name','short_name','name:en')]
        info={'id':f'{kind}/{id}','name':tags.get('name') or 'Unnamed station','lat':pos[0],'lng':pos[1],'tags':tags,'source':'OSM'}
        stations.append(info)
        for name in names:
            if name:candidates[normalized(name)].append(info)
    seen_routes=[];matched={};matched_count=0;ambiguous=0
    # Catalog kept separately from current OSM station data; no coordinate guesses.
    for stop in diagram['stops']:
        name=stop['name'];key=normalized(name)
        opts=list({c['id']:c for c in candidates.get(key,[])}.values())
        status='unmatched';chosen=None;nearest=None
        if len(opts)==1:chosen=opts[0];status='matched'
        elif len(opts)>1:
            # Multiple platform/platform-area objects: mark ambiguous instead of silently guessing.
            status='ambiguous';ambiguous+=1
        if chosen:
            matched[name]=chosen;matched_count+=1
            if rail_nodes:
                nearest=min(distance((chosen['lat'],chosen['lng']),pos) for pos in rail_nodes.values())
        con.execute('INSERT INTO diagram_stops VALUES(?,?,?,?,?,?,?)',(name,json.dumps(stop['modes']),json.dumps(stop['lines']),status,*((chosen['id'].split('/')[0],int(chosen['id'].split('/')[1])) if chosen else (None,None)),nearest))
    
    def shortest(src,dst):
        if src==dst:return [src]
        visited=set();prev={};heap=[(0,src)]
        while heap:
            d,n=heapq.heappop(heap)
            if n in visited:continue
            visited.add(n)
            if n==dst:
                path=[n]
                while path[-1]!=src:path.append(prev[path[-1]])
                return path[::-1]
            for other,length in graph[n]:
                if other not in visited and (other not in prev or d+length < cost.get(other,float('inf'))):
                    cost[other]=d+length;prev[other]=n;heapq.heappush(heap,(d+length,other))
        return None
    # Faster and deterministic nearest rail nodes, with strict maximum snap distance.
    def snap(s):
        pos=s['lat'],s['lng'];best=min(((distance(pos,p),n) for n,p in rail_nodes.items()),default=(float('inf'),None))
        return best[1] if best[0] <= max_station_m else None
    snapped={name:snap(station) for name,station in matched.items()}
    lines=[];not_connected=[]
    for line in diagram['lines']:
        if line['mode']!='train':continue
        stages=[]
        for a,b in zip(line['stops'],line['stops'][1:]):
            src=snapped.get(a);dst=snapped.get(b)
            if src is None or dst is None:
                not_connected.append({'line':line['id'],'from':a,'to':b,'reason':'missing station/railway snap'});continue
            cost={src:0}
            route=shortest(src,dst)
            if not route or len(route)<2:
                not_connected.append({'line':line['id'],'from':a,'to':b,'reason':'OSM ways are not topologically connected'});continue
            stages.append({'from':a,'to':b,'nodeIds':route})
        # Only contiguous complete routes produce a playable simulated path.
        if len(stages)==len(line['stops'])-1 and stages:
            chain=stages[0]['nodeIds'][:]
            for s in stages[1:]:chain.extend(s['nodeIds'][1:])
            # Simplifying the graph would lose exact geometry. Keep every real OSM node.
            lines.append({'id':line['id'],'name':line['name'],'stops':line['stops'],'nodeIds':chain,'coords':[{'lat':rail_nodes[n][0],'lng':rail_nodes[n][1]} for n in chain],'source':'OSM path via shared node IDs','status':'connected','note':'Topological approximation; service routing, direction and turnouts not validated'})
    con.commit()
    return {'source':'OSM-derived','dataset_status':'real-source' if tracks and stations else 'empty','region':diagram['region'],
            'tracks':tracks,'stations':stations,'signals':signals,'routes':lines,
            'coverage':{'osm_nodes':len(nodes),'track_ways':len(tracks),'osm_stations':len(stations),'diagram_stops':len(diagram['stops']),'matched_diagram_stops':matched_count,'ambiguous_diagram_stops':ambiguous,'connected_service_routes':len(lines),'unresolved_pairs':not_connected}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--download',action='store_true',help='Fetch 4 regional Overpass query windows to immutable raw/ (needs internet)')
    group.add_argument('--osm-json',type=Path,nargs='+',help='Import existing unmodified Overpass JSON snapshot(s)')
    parser.add_argument('--out',type=Path,default=ROOT/'data/current',help='Output location: SQLite and derived world JSON')
    parser.add_argument('--endpoint',default='https://overpass-api.de/api/interpreter')
    args=parser.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    if args.download:paths=download_snapshots(out,args.endpoint)
    else:
        paths=[];(out/'raw').mkdir(exist_ok=True)
        for p in args.osm_json:
            target=out/'raw'/p.name
            if p.resolve()!=target.resolve():target.write_bytes(p.read_bytes())
            paths.append(target)
    diagram=json.loads(CATALOG.read_text());objects,evidence=load_sources(paths)
    if not objects:raise ValueError('No OSM objects received; leaving no publishable world')
    con=create_db(out/'rail.sqlite3',objects,diagram,evidence)
    world=prepare_world(objects,diagram,con);con.close()
    if world['dataset_status']!='real-source':raise ValueError('No complete OSM track/station features; refusing to publish')
    if evidence and all(i['fixture'] for i in evidence):world['dataset_status']='synthetic-fixture'
    manifest={'name':'TrainSim OSM railway snapshot','created_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
              'license':'OpenStreetMap contributors © ODbL 1.0 (see https://www.openstreetmap.org/copyright)','raw_snapshots':evidence,'coverage':world['coverage'],
              'warning':'Schematic 2012 service diagram != survey. Railway tags and geometry are a reproducible OpenStreetMap snapshot. Interlocking and service routes remain unvalidated.'}
    (out/'world.json').write_text(json.dumps(world,separators=(',',':')),encoding='utf-8')
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'output':str(out),'tracks':len(world['tracks']),'stations':len(world['stations']),'routes_playable':len(world['routes']),
                     'diagram_stations_matched':world['coverage']['matched_diagram_stops'],'unresolved_pairs':len(world['coverage']['unresolved_pairs'])},indent=2))

if __name__=='__main__':main()
