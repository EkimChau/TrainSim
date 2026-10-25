// Component model definitions stay map/provider-independent.
function coordinate(point) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) throw new TypeError('Invalid WGS84 coordinate');
  return {lat:point.lat,lng:point.lng};
}
export class Track {
  constructor({id,type='main',coords}) {
    if (!id || !Array.isArray(coords) || coords.length < 2) throw new TypeError('Track requires id and >=2 nodes');
    this.id=id; this.type=type; this.coords=coords.map(coordinate);
  }
}
export class Station {
  constructor({id,name,lat,lng}) { if (!id || !name) throw new TypeError('Station requires id/name'); Object.assign(this,{id,name,...coordinate({lat,lng})}); }
}
export class Balise {
  constructor({id,trackId,position,provenance='synthetic-demo'}) {this.id=id; this.trackId=trackId; this.position=coordinate(position);this.provenance=provenance;}
}
export class Train {
  constructor({id,name,path,speed,color,hasCollisionRisk=false,speedMetersPerTick=null}) {
    if (!id || !Array.isArray(path) || path.length<1 || !Number.isFinite(speed) || speed<0) throw new TypeError('Invalid train');
    Object.assign(this,{id,name,path:path.map(coordinate),speed,color,hasCollisionRisk,speedMetersPerTick,segment:0,progress:0,alert:false,position:coordinate(path[0])});
  }
}
