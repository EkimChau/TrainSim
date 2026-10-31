/**
 * Pure in-motion projections of an already evaluated simulator step.
 *
 * The lesson reducer remains the only authority for the end state; this
 * module interpolates an educational moving train and reveals track-detector
 * and BTM passage observations at their physical fixture coordinates.
 *
 * Pausing may checkpoint any returned intermediate world and resume the same
 * scenario command without inventing new signalling logic.
 */
import {TRACK_WORLD,occupancy} from './world.js';

const limit=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
export const isMovement=(before,after)=>after.trains.some(train=>{
  const previous=before.trains.find(item=>item.id===train.id);
  return previous&&(previous.position!==train.position||previous.track!==train.track);
});
const crossed=(oldPosition,newPosition,threshold)=>
  oldPosition<threshold&&newPosition>=threshold||
  oldPosition>threshold&&newPosition<=threshold;
const touchesBalise=(train,bg)=>{
  if(train.track===bg.track)return true;
  return train.track==='diverge'&&bg.track==='main'&&bg.metres<=TRACK_WORLD.point.metres;
};
export function motionThresholds(before,after){
  const events=[];
  for(const next of after.trains){
    const prev=before.trains.find(train=>train.id===next.id);
    if(!prev||next.position===prev.position)continue;
    const delta=next.position-prev.position;
    const push=(metres,type,id)=>{
      if(!crossed(prev.position,next.position,metres))return;
      const fraction=(metres-prev.position)/delta;
      if(fraction>=0&&fraction<=1)events.push({fraction,type,id,trainId:next.id,metres});
    };
    for(const bg of TRACK_WORLD.balises){
      if(touchesBalise(next,bg))push(bg.metres+next.direction*TRACK_WORLD.antennaOffset,'balise',bg.id);
    }
    for(const section of TRACK_WORLD.sections){
      // A section changes state at train front entry and rear clearance.
      if(next.track===section.track||next.track==='diverge'&&section.track==='main'){
        if(next.direction<0){
          push(section.to,'section-front',section.id);
          push(section.from-TRACK_WORLD.trainLength,'section-rear',section.id);
        }else{
          push(section.from,'section-front',section.id);
          push(section.to+TRACK_WORLD.trainLength,'section-rear',section.id);
        }
      }
    }
    if(next.id==='A'){
      push(TRACK_WORLD.point.metres,'point','P1');
      push(TRACK_WORLD.point.metres+110,'point','P1');
      push(TRACK_WORLD.levelBoundary.metres,'boundary','boundary');
    }
  }
  return events.sort((a,b)=>a.fraction-b.fraction||a.id.localeCompare(b.id));
}
export function motionFrame(before,after,fraction){
  const ratio=limit(fraction);
  if(ratio>=1||!isMovement(before,after))return ratio>=1?after:before;
  const trains=after.trains.map(target=>{
    const old=before.trains.find(t=>t.id===target.id);
    if(!old)return {...target};
    return {...old,
      position:Math.round((old.position+(target.position-old.position)*ratio)*10)/10,
      speed:Math.round((old.speed+(target.speed-old.speed)*ratio)*10)/10,
      track:target.track,direction:target.direction
    };
  });
  const balises=Object.fromEntries(Object.entries(before.balises).map(([id,state])=>[id,{...state}]));
  const events=[...before.events];
  for(const bg of TRACK_WORLD.balises){
    if(after.balises[bg.id].count===before.balises[bg.id].count)continue;
    const target=after.trains.find(t=>touchesBalise(t,bg));
    const old=target&&before.trains.find(t=>t.id===target.id);
    const current=target&&trains.find(t=>t.id===target.id);
    if(!old||!current||!crossed(old.position,current.position,
      bg.metres+target.direction*TRACK_WORLD.antennaOffset))continue;
    balises[bg.id]={...after.balises[bg.id]};
    if(target.id==='A')current.lrbg=bg.id;
    const matching=after.events.slice(before.events.length).filter(event=>
      event.actor==='BTM'&&event.message.includes(bg.id));
    for(const event of matching)events.push(event);
  }
  const last=events.at(-1)??before.last;
  const result={...before,trains,balises,events,last,
    tick:last?.tick??before.tick,
    // In an in-flight frame an unissued report remains the older RBC report.
    rbc:before.rbc,
    ma:before.ma
  };
  return result;
}
export function motionReadings(before,after,fraction){
  const world=motionFrame(before,after,fraction);
  return {world,occupancy:occupancy(world),triggers:motionThresholds(before,after).filter(x=>x.fraction<=fraction)};
}
