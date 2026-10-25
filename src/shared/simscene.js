import {Train} from './models.js';

/** Pick the longest continuous piece of an OSM route path ([[lon,lat],...] segments). */
export function longestSegment(segments){
  let best=[];
  for(const seg of segments??[])if(seg.length>best.length)best=seg;
  return best;
}

/**
 * A scene with one train following an ingested OSM route relation.
 * The path is the route's real way-node geometry from the TrainSim database.
 */
export function createRouteScene(route,{speedMetersPerTick=10,color='#ffd400'}={}){
  const path=longestSegment(route?.segments).map(([lng,lat])=>({lat,lng}));
  if(path.length<2)throw new RangeError('Route has no continuous path in the database');
  return {id:`route:${route.id}`,trains:[new Train({id:`T-${route.ref||route.id}`,name:route.name||`Route ${route.id}`,path,color,speedMetersPerTick})]};
}
