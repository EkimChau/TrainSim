// Fixed-step, deterministic *illustrative* replay; no train dynamics or RBC model.
export class SimRun {
  constructor(scene) {this.scene=scene;this.tick=0;}
  step() {
    this.tick++;
    const events=[];
    for (const train of this.scene.trains) {
      if (train.path.length===1) {events.push({type:'occupancy',id:train.id,message:`${train.id}: Static block occupancy`});continue;}
      train.progress+=train.speed;
      while (train.progress >= 1) {
        train.progress-=1;
        train.segment=(train.segment+1)%(train.path.length-1);
      }
      const a=train.path[train.segment],b=train.path[train.segment+1];
      train.position={lat:a.lat+(b.lat-a.lat)*train.progress,lng:a.lng+(b.lng-a.lng)*train.progress};
      train.alert=!!(train.hasCollisionRisk && train.segment===0 && train.progress>0.6);
      events.push({type:train.alert?'demo-warning':'position',id:train.id,position:{...train.position},message:train.alert?`${train.id}: Illustrative occupancy intervention (not ETCS braking)`:`${train.id}: ${train.position.lat.toFixed(4)}, ${train.position.lng.toFixed(4)}`});
    }
    return {tick:this.tick,events,trains:this.scene.trains};
  }
}
