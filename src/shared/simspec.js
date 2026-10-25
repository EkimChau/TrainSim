import {Balise} from './models.js';
// Seed heuristic only. NOT a standards-based ETCS/UNISIG or interlocking compiler.
export function compileDemoInstruments(world) {
  const devices=[];
  for (const track of world.tracks) {
    for (let i=0;i<track.coords.length-1;i++) {
      const a=track.coords[i],b=track.coords[i+1];
      devices.push(new Balise({id:`DEMO-BG-${String(devices.length+1).padStart(3,'0')}`,trackId:track.id,position:{lat:(a.lat+b.lat)/2,lng:(a.lng+b.lng)/2}}));
    }
  }
  world.setTrackside(devices);
  return {devices,standardCompliant:false,method:'synthetic-segment-midpoint'};
}
