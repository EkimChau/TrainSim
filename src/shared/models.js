// Provider-independent simulation models (WGS84 lat/lng).
export function coordinate(point){
  if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))throw new TypeError('Invalid WGS84 coordinate');
  return {lat:point.lat,lng:point.lng};
}

export class Train{
  constructor({id,name,path,speed=0,color,hasCollisionRisk=false,speedMetersPerTick=null}){
    if(!id||!Array.isArray(path)||path.length<1||!Number.isFinite(speed)||speed<0)throw new TypeError('Invalid train');
    Object.assign(this,{id,name,path:path.map(coordinate),speed,color,hasCollisionRisk,speedMetersPerTick,segment:0,progress:0,alert:false,position:coordinate(path[0])});
  }
}
