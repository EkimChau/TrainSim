// OpenRailwayMap-style colour schemes for the deck.gl overlay.
// Colours follow the look of openrailwaymap.app's map styles; the definitions here
// are TrainSim's own (data comes from the local OSM database, not ORM tiles).

export const STYLES=[
  {id:'infrastructure',label:'Infrastructure',orm:'standard'},
  {id:'speed',label:'Max speed',orm:'maxspeed'},
  {id:'protection',label:'Train protection',orm:'signals'},
  {id:'electrification',label:'Electrification',orm:'electrification'},
  {id:'gauge',label:'Track gauge',orm:'gauge'},
];

export const hex=h=>{const v=h.replace('#','');return [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)];};

const USAGE={highspeed:'#ff0c00',main:'#ff8100',branch:'#c4b600',industrial:'#87491d',military:'#87491d',test:'#87491d',
  tourism:'#87491d',scientific:'#87491d'};
const TYPE={light_rail:'#00bd14',subway:'#0300c3',tram:'#d877b8',funicular:'#6e00ab',monorail:'#6e00ab',miniature:'#87491d'};
const STATE={disused:'#70584d',abandoned:'#8c7b73',razed:'#a8a29e',preserved:'#6e3b23'};

const SPEED_STOPS=[[0,'#0100cb'],[40,'#0060ff'],[60,'#00b7ff'],[80,'#00e391'],[100,'#62dd00'],[120,'#d7e600'],
  [140,'#ffb000'],[160,'#ff6200'],[200,'#ff0000'],[300,'#a00000']];
const PROTECTION={etcs:'#1f63ff',ptc:'#7b2cbf',ctcs:'#7b2cbf',lzb:'#00a0b0',atc:'#d6006e',atp:'#e05a00',ats:'#e05a00',
  pzb:'#00a0b0',aws:'#9b7a00',tpws:'#b8a000'};
const ELECTRIFICATION=[
  [v=>v.voltage===25000&&v.frequency===50,'#e3001b','25 kV 50 Hz AC'],
  [v=>v.voltage===15000,'#00a650','15 kV 16.7 Hz AC'],
  [v=>v.voltage===3000,'#0057e7','3 kV DC'],
  [v=>v.voltage===1500,'#ff4fa3','1.5 kV DC'],
  [v=>v.voltage>=600&&v.voltage<=900,'#ff9a00','600–900 V DC'],
  [v=>v.electrified==='no','#111111','Not electrified'],
  [v=>v.electrified&&v.electrified!=='no','#b04ccf','Electrified, voltage unknown'],
];
const GAUGES={1067:'#e8a02e',1435:'#0047ab',1000:'#9b59b6',1520:'#2e8b57',1600:'#ff4500',610:'#a52a2a',762:'#a52a2a'};
const UNKNOWN='#9e9e9e';

function speedColour(kmh){
  if(kmh==null)return UNKNOWN;
  let c=SPEED_STOPS[0][1];
  for(const [v,col] of SPEED_STOPS)if(kmh>=v)c=col;
  return c;
}
const protectionKey=t=>(t.train_protection||'').split(':')[0];

/** RGBA colour of a track for a style. */
export function trackColour(t,style){
  let c;
  if(t.state!=='present'&&t.state!=='construction'&&t.state!=='proposed'&&STATE[t.state])c=STATE[t.state];
  else if(style==='speed')c=speedColour(t.maxspeed??t.maxspeed_forward??t.maxspeed_backward);
  else if(style==='protection')c=PROTECTION[protectionKey(t)]??UNKNOWN;
  else if(style==='electrification')c=(ELECTRIFICATION.find(([f])=>f(t))??[0,UNKNOWN])[1];
  else if(style==='gauge')c=(t.gauge||'').includes(';')?'#000000':(GAUGES[t.gauge_mm]??UNKNOWN);
  else c=t.service?'#1a1a1a':(TYPE[t.railway]??USAGE[t.usage]??(t.railway==='rail'||t.railway==='narrow_gauge'?'#87491d':UNKNOWN));
  const alpha=t.state==='proposed'?140:t.tunnel?150:235;
  return [...hex(c),alpha];
}

/** Line width in pixels: running lines thick, service tracks thin (like ORM). */
export function trackWidth(t,zoom){
  const base=t.service?1.2:t.usage==='main'?3.2:t.usage==='branch'?2.6:2;
  return base*(zoom>=15?1.5:zoom>=12?1.15:0.9);
}

/** Dash pattern [dash, gap] for lifecycle states (PathStyleExtension). */
export function trackDash(t){
  if(t.state==='construction')return [4,3];
  if(t.state==='proposed')return [2,4];
  if(t.state==='disused')return [6,3];
  if(t.state==='abandoned'||t.state==='razed')return [1,3];
  return [0,0];
}

const SIGNAL={main:'#e00000',combined:'#ff6a00',distant:'#e8b400',main_repeated:'#e8b400',shunting:'#1f6fff',minor:'#1f6fff',
  speed_limit:'#0a8f2f',speed_limit_distant:'#0a8f2f',crossing:'#8a2be2',route:'#555555'};
export const signalColour=s=>[...hex(SIGNAL[s.category]??'#7a3cff'),s.deactivated?110:255];

const POI={milestone:'#2e7d32',level_crossing:'#c62828',crossing:'#c62828',buffer_stop:'#111111',derail:'#6d4c41',
  signal_box:'#5e35b1',stop_position:'#00838f',traction_substation:'#d500f9',station_building:'#455a64',owner_change:'#8d6e63'};
export const poiColour=p=>hex(POI[p.kind]??'#607d8b');

export const STATION_COLOUR={station:'#0a7cba',halt:'#3fa2d9',tram_stop:'#d877b8',junction:'#555555',yard:'#87491d',
  crossover:'#555555',spur_junction:'#555555',service_station:'#87491d',site:'#777777',stop:'#3fa2d9'};

/** Legend rows for the active style. */
export function legend(style){
  switch(style){
    case 'speed':return [...SPEED_STOPS.map(([v,c],i)=>[c,i<SPEED_STOPS.length-1?`${v}–${SPEED_STOPS[i+1][0]-1} km/h`:`≥ ${v} km/h`]),[UNKNOWN,'Unknown']];
    case 'protection':return [[PROTECTION.etcs,'ETCS'],[PROTECTION.atp,'ATP / ATS'],[PROTECTION.atc,'ATC'],[PROTECTION.aws,'AWS'],
      [PROTECTION.tpws,'TPWS'],[PROTECTION.pzb,'PZB / LZB'],[PROTECTION.ptc,'PTC / CTCS'],[UNKNOWN,'None tagged']];
    case 'electrification':return [...ELECTRIFICATION.map(([,c,l])=>[c,l]),[UNKNOWN,'Untagged']];
    case 'gauge':return [[GAUGES[1067],'1067 mm (Cape)'],[GAUGES[1435],'1435 mm (standard)'],[GAUGES[1000],'1000 mm'],
      [GAUGES[1520],'1520 mm'],[GAUGES[1600],'1600 mm'],[GAUGES[610],'≤ 762 mm'],['#000000','Dual gauge'],[UNKNOWN,'Untagged']];
    default:return [[USAGE.highspeed,'High-speed line'],[USAGE.main,'Main line'],[USAGE.branch,'Branch line'],
      [USAGE.industrial,'Industrial / other'],['#1a1a1a','Siding, yard, spur'],[TYPE.light_rail,'Light rail'],
      [TYPE.subway,'Subway'],[TYPE.tram,'Tram'],[STATE.disused,'Disused (dashed)'],[STATE.preserved,'Preserved']];
  }
}

export const SIGNAL_LEGEND=Object.entries(SIGNAL).slice(0,6);
