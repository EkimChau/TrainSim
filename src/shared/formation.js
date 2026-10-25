const EARTH_RADIUS_M=6371000;
const PIXEL_SIZE_M=156543.03392;
const lengthsByPath=new WeakMap();

function distance(a,b){
  const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
  const dlat=lat2-lat1,dlng=(b.lng-a.lng)*Math.PI/180;
  const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;
  return 2*EARTH_RADIUS_M*Math.asin(Math.min(1,Math.sqrt(h)));
}

function pathLengths(path){
  let lengths=lengthsByPath.get(path);
  if(lengths)return lengths;
  const cumulative=[0];
  for(let i=1;i<path.length;i++)cumulative.push(cumulative[i-1]+distance(path[i-1],path[i]));
  lengths={cumulative,total:cumulative.at(-1)};
  lengthsByPath.set(path,lengths);
  return lengths;
}

function pointAtDistance(path,cumulative,total,distanceAlong){
  const d=((distanceAlong%total)+total)%total;
  let low=0,high=cumulative.length-1;
  while(low<high){
    const mid=Math.floor((low+high)/2);
    if(cumulative[mid+1]<d)low=mid+1;
    else high=mid;
  }
  while(low<path.length-2&&cumulative[low+1]===cumulative[low])low++;
  const length=cumulative[low+1]-cumulative[low];
  const fraction=length?(d-cumulative[low])/length:0;
  const a=path[low],b=path[low+1];
  return {lat:a.lat+(b.lat-a.lat)*fraction,lng:a.lng+(b.lng-a.lng)*fraction};
}

function bearing(a,b){
  const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180,dlng=(b.lng-a.lng)*Math.PI/180;
  return (Math.atan2(Math.sin(dlng)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-
    Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlng))*180/Math.PI+360)%360;
}

/** Convert north-clockwise track bearing to IconLayer's screen-space clockwise angle. */
export function trainIconAngle(trackBearing,axisOffset=0){
  if(!Number.isFinite(trackBearing)||!Number.isFinite(axisOffset))throw new TypeError('Invalid train icon angle');
  return ((axisOffset-trackBearing)%360+360)%360;
}

/** Place one fixed-pixel three-car set per unit behind the lead cab. */
export function trainFormation(train,zoom=10,sizeScale=1){
  const {path,carriages=3}=train;
  if(!Array.isArray(path)||path.length<2||![3,6].includes(carriages)||!Number.isFinite(sizeScale)||sizeScale<=0)
    throw new TypeError('Invalid train formation');
  const {cumulative,total}=pathLengths(path);
  if(total<=0)throw new RangeError('Train route has no measurable length');

  const segment=Math.max(0,Math.min(path.length-2,train.segment??0));
  const segmentLength=cumulative[segment+1]-cumulative[segment];
  const headDistance=cumulative[segment]+segmentLength*(train.progress??0);
  const metersPerPixel=PIXEL_SIZE_M*Math.max(0.01,Math.cos(train.position.lat*Math.PI/180))/2**zoom;
  const unitLength=18*metersPerPixel*sizeScale;
  const directionSample=unitLength/3;
  const units=carriages/3;

  return Array.from({length:units},(_,index)=>{
    const centerDistance=headDistance-(index+0.5)*unitLength;
    const before=pointAtDistance(path,cumulative,total,centerDistance-directionSample);
    const after=pointAtDistance(path,cumulative,total,centerDistance+directionSample);
    const position=pointAtDistance(path,cumulative,total,centerDistance);
    return {id:`${train.id}-${index+1}`,trainId:train.id,name:train.name,skin:train.skin??'3a',
      position:[position.lng,position.lat],angle:bearing(before,after),iconSize:18*sizeScale,unit:index+1};
  });
}

function stopChainage(path,cumulative,stop){
  let closest={distance:Infinity,chainage:0};
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1],meanLat=(a.lat+b.lat+stop.lat)/3*Math.PI/180;
    const dx=(b.lng-a.lng)*Math.cos(meanLat),dy=b.lat-a.lat;
    const px=(stop.lng-a.lng)*Math.cos(meanLat),py=stop.lat-a.lat;
    const fraction=Math.max(0,Math.min(1,(dx*px+dy*py)/(dx*dx+dy*dy||1)));
    const x=px-dx*fraction,y=py-dy*fraction;
    const d=x*x+y*y;
    if(d<closest.distance){
      closest={distance:d,chainage:cumulative[i]+distance(a,b)*fraction};
    }
  }
  return closest.chainage;
}

/** Attach ordered stop positions to a path so the simulator can show the next stop. */
export function locateRouteStops(path,stops=[]){
  if(!Array.isArray(path)||path.length<2)throw new TypeError('Invalid route path');
  const cumulative=[0];
  for(let i=1;i<path.length;i++)cumulative.push(cumulative[i-1]+distance(path[i-1],path[i]));
  return stops.filter(s=>s.name&&Number.isFinite(s.lat)&&Number.isFinite(s.lon))
    .map(s=>({...s,lng:s.lon,chainage:stopChainage(path,cumulative,{lat:s.lat,lng:s.lon})}))
    .sort((a,b)=>a.chainage-b.chainage);
}
