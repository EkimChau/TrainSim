// Fixed-step, deterministic *illustrative* replay; no train dynamics or RBC model.
function metres(a,b) {
  const dlat=(b.lat-a.lat)*Math.PI/180, dlng=(b.lng-a.lng)*Math.PI/180;
  const c1=a.lat*Math.PI/180,c2=b.lat*Math.PI/180;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(c1)*Math.cos(c2)*Math.sin(dlng/2)**2)));
}
const pathDistances=new WeakMap();
function cumulativeDistances(path){
  let distances=pathDistances.get(path);
  if(!distances){
    distances=[0];
    for(let i=1;i<path.length;i++)distances.push(distances[i-1]+metres(path[i-1],path[i]));
    pathDistances.set(path,distances);
  }
  return distances;
}
export class SimRun {
  constructor(scene) {this.scene=scene;this.tick=0;}
  step() {
    this.tick++;
    const events=[];
    for (const train of this.scene.trains) {
      if (train.path.length===1) {events.push({type:'occupancy',id:train.id,message:`${train.id}: Static block occupancy`});continue;}
      if(train.speedMetersPerTick!==null) {
        // Traverse complete OSM way-node segments by distance; never linearly interpolate across gaps.
        let remaining=train.speedMetersPerTick;
        let safetySteps=0;
        while(remaining>0 && safetySteps++ < train.path.length*2){
          const a=train.path[train.segment],b=train.path[train.segment+1];
          const length=metres(a,b);
          const left=length*(1-train.progress);
          if(length<.001 || remaining>=left){
            remaining-=left;train.segment=(train.segment+1)%(train.path.length-1);train.progress=0;
            if(length<.001 && remaining<.001)break;
          }else {train.progress+=remaining/length;remaining=0;}
        }
      }else {
        train.progress+=train.speed;
        while(train.progress>=1){train.progress-=1;train.segment=(train.segment+1)%(train.path.length-1);}
      }
      const a=train.path[train.segment],b=train.path[train.segment+1];
      train.position={lat:a.lat+(b.lat-a.lat)*train.progress,lng:a.lng+(b.lng-a.lng)*train.progress};
      const distances=cumulativeDistances(train.path);
      const currentDistance=distances[train.segment]+(distances[train.segment+1]-distances[train.segment])*train.progress;
      train.nextStop=train.stops.find(stop=>stop.chainage>currentDistance)?.name??train.stops[0]?.name??null;
      train.alert=!!(train.hasCollisionRisk && train.segment===0 && train.progress>0.6);
      events.push({type:train.alert?'demo-warning':'position',id:train.id,position:{...train.position},message:train.alert?`${train.id}: Illustrative occupancy intervention (not ETCS braking)`:`${train.id}: ${train.position.lat.toFixed(4)}, ${train.position.lng.toFixed(4)}`});
    }
    return {tick:this.tick,events,trains:this.scene.trains};
  }
}
