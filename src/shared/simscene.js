import {Train} from './models.js';
export const SCENES = Object.freeze([
  {id:'bne-morning-peak',label:'Brisbane Central Morning Peak (demo)'},
  {id:'gold-coast-express',label:'Gold Coast to Roma Street Express (demo)'},
  {id:'ipswich-maintenance',label:'Ipswich Corridor Block Event (demo)'}
]);
export function createScene(id,world) {
  const t=world.tracks;
  const defs={
    'bne-morning-peak':[
      {id:'TRAIN-QR-01',name:'Nambour Service (Inbound)',path:t[0].coords,speed:0.04,color:'#f6d73b'},
      {id:'TRAIN-QR-02',name:'Ipswich Flyer (Outbound)',path:t[2].coords,speed:0.03,color:'#24d3f3'}
    ],
    'gold-coast-express':[{id:'TRAIN-GEXP-05',name:'Gold Coast Express',path:t[3].coords,speed:0.06,color:'#d780ff'}],
    'ipswich-maintenance':[
      {id:'TRAIN-MAINT-01',name:'Work Train Block',path:[t[2].coords[1]],speed:0,color:'#ffa64d'},
      {id:'TRAIN-QR-03',name:'Approaching Passenger Service',path:t[2].coords,speed:0.02,color:'#f6d73b',hasCollisionRisk:true}
    ]
  };
  if (!Object.hasOwn(defs,id)) throw new RangeError(`Unknown scenario: ${id}`);
  return {id,trains:defs[id].map(d=>new Train(d))};
}
