#!/usr/bin/env python3
"""Auditable manual transcription of stops and line ordering from the supplied 2012 diagram.
No lat/lon values are inferred from pixel positions.
"""
import json
from pathlib import Path

lines={
    'sunshine-coast':('Sunshine Coast line','train', '''Gympie North|Traveston|Cooran|Pomona|Cooroy|Eumundi|Yandina|Nambour|Woombye|Palmwoods|Eudlo|Mooloolah|Landsborough|Beerwah|Glasshouse Mountains|Beerburrum|Elimbah|Caboolture|Morayfield|Burpengary|Narangba|Dakabin|Petrie|Lawnton|Bray Park|Strathpine|Bald Hills|Carseldine|Zillmere|Geebung|Sunshine|Virginia|Northgate|Nundah|Toombul|Eagle Junction|Wooloowin|Albion|Bowen Hills|Fortitude Valley|Central|Roma Street'''),
    'caboolture':('Caboolture line','train','''Caboolture|Morayfield|Burpengary|Narangba|Dakabin|Petrie|Lawnton|Bray Park|Strathpine|Bald Hills|Carseldine|Zillmere|Geebung|Sunshine|Virginia|Northgate|Nundah|Toombul|Eagle Junction|Wooloowin|Albion|Bowen Hills|Fortitude Valley|Central|Roma Street'''),
    'ferny-grove':('Ferny Grove line','train','''Ferny Grove|Keperra|Grovely|Oxford Park|Mitchelton|Gaythorne|Enoggera|Alderley|Newmarket|Wilston|Windsor|Bowen Hills|Fortitude Valley|Central|Roma Street'''),
    'shorncliffe':('Shorncliffe line','train','''Shorncliffe|Sandgate|Deagon|North Boondall|Boondall|Nudgee|Banyo|Bindha|Northgate|Nundah|Toombul|Eagle Junction|Wooloowin|Albion|Bowen Hills|Fortitude Valley|Central|Roma Street'''),
    'airport':('Airport line','train','''Domestic Airport|International Airport|Eagle Junction|Wooloowin|Albion|Bowen Hills|Fortitude Valley|Central|Roma Street'''),
    'doomben':('Doomben line','train','''Doomben|Ascot|Hendra|Clayfield|Eagle Junction|Wooloowin|Albion|Bowen Hills|Fortitude Valley|Central|Roma Street'''),
    'cleveland':('Cleveland line','train','''Cleveland|Ormiston|Wellington Point|Birkdale|Thorneside|Lota|Manly|Wynnum Central|Wynnum|Wynnum North|Lindum|Hemmant|Murarrie|Cannon Hill|Morningside|Norman Park|Coorparoo|Buranda|Park Road|South Bank|South Brisbane|Roma Street'''),
    'ipswich':('Ipswich line','train','''Ipswich|East Ipswich|Booval|Bundamba|Ebbw Vale|Dinmore|Riverview|Redbank|Goodna|Gailes|Wacol|Darra|Oxley|Corinda|Sherwood|Graceville|Chelmer|Indooroopilly|Taringa|Toowong|Auchenflower|Milton|Roma Street'''),
    'rosewood':('Rosewood line','train','''Rosewood|Thagoona|Walloon|Karrabin|Wulkuraka|Thomas Street|Ipswich|East Ipswich|Booval|Bundamba|Ebbw Vale|Dinmore|Riverview|Redbank|Goodna|Gailes|Wacol|Darra|Oxley|Corinda|Sherwood|Graceville|Chelmer|Indooroopilly|Taringa|Toowong|Auchenflower|Milton|Roma Street'''),
    'beenleigh':('Beenleigh line','train','''Beenleigh|Holmview|Edens Landing|Bethania|Loganlea|Kingston|Woodridge|Trinder Park|Kuraby|Fruitgrove|Runcorn|Altandi|Sunnybank|Banoon|Coopers Plains|Salisbury|Rocklea|Moorooka|Yeerongpilly|Yeronga|Fairfield|Dutton Park|Park Road|South Bank|South Brisbane|Roma Street'''),
    'gold-coast':('Gold Coast line','train','''Varsity Lakes|Robina|Nerang|Helensvale|Coomera|Ormeau|Beenleigh|Park Road|South Bank|South Brisbane|Roma Street'''),
    'richlands':('Richlands line (as displayed in 2012)','train','''Richlands|Darra|Oxley|Corinda|Sherwood|Graceville|Chelmer|Indooroopilly|Taringa|Toowong|Auchenflower|Milton|Roma Street'''),
    'toogoolawah-railbus':('Toogoolawah railbus','railbus','''Toogoolawah|Esk|Coominya|Lowood|Fernvale|Borallon|Muirlea|Ipswich'''),
    'helidon-rosewood-railbus':('Helidon–Rosewood railbus','railbus','''Helidon|Grantham|Gatton|UQ Gatton Campus|Forest Hill|Laidley|Grandchester|Calvert|Lanefield|Rosewood'''),
    'australia-zoo-railbus':('Australia Zoo railbus','railbus','''Beerwah|Australia Zoo'''),
    'nambour-caboolture-railbus':('Nambour–Caboolture railbus','railbus','''Nambour|Woombye|Palmwoods|Eudlo|Mooloolah|Landsborough|Beerwah|Glasshouse Mountains|Beerburrum|Elimbah|Caboolture'''),
    'northern-busway':('Northern Busway','busway','''QUT Kelvin Grove|RCH Herston|RBWH|Normanby|Roma Street'''),
    'south-east-busway':('South East Busway','busway','''Queen Street|Cultural Centre|South Bank|Mater Hill|Woolloongabba|Buranda|Greenslopes|Holland Park West|Griffith University|Upper Mt Gravatt|Eight Mile Plains|Springwood'''),
    'eastern-busway':('Eastern Busway','busway','''Buranda|PA Hospital|Stones Corner|Langlands Park'''),
    'springfield-planned':('Springfield rail extension (2013 planned)','future','''Richlands|Springfield Central'''),
    'northern-busway-planned':('Planned Northern Busway extension','future','''Kedron'''),
    'moreton-bay-planned':('Moreton Bay Rail Link (planned on diagram)','future','''Kippa-Ring'''),
}

out={'source':{'title':'TransLink / Queensland Rail train and busway network map','effective':'2012-01','type':'user-provided-historical-schematic','file':'data/reference/translink-network-map-2012.png','method':'manual transcription, not georeferenced','authority':'reference only; verify each stop and route against current OSM','notes':'Train services, replacement railbuses, busways, and planned links are separate modes. Express lines may skip stations; order is schematic, not a timetable or a surveyed track route.'},
     'region':{'name':'Historical SE Queensland diagram railway coverage','bbox_wgs84':[-28.20,151.95,-26.10,153.58], 'bbox_order':'south,west,north,east','notes':'Conservative geographic fetch envelope for depicted railway endpoints. This is a query envelope, not drawn from pixels and not a formal administrative region.'}, 'lines':[], 'stops':[]}
stop_map={}
for id,(name,mode,raw) in lines.items():
    stations=[v.strip() for v in raw.split('|')]
    out['lines'].append({'id':id,'name':name,'mode':mode,'stops':stations,'geometry_status':'schematic-stop-order-only'})
    for n in stations:
        k=n.casefold()
        if k not in stop_map:stop_map[k]={'name':n,'modes':[],'lines':[],'source':'diagram-manual-transcription','wgs84':None,'osm_id':None,'match_status':'unverified'}
        if mode not in stop_map[k]['modes']:stop_map[k]['modes'].append(mode)
        stop_map[k]['lines'].append(id)
out['stops']=list(stop_map.values())
Path('data/reference/diagram-catalog.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(f"{len(out['lines'])} diagram lines; {sum('train' in s['modes'] for s in out['stops'])} distinct rail-listed stops; {len(out['stops'])} total named locations (all modes)")
