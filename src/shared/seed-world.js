// Synthetic seed geometry; NOT fetched from ORM/OSM and not validated against rail assets.
export const SEED_REGION = Object.freeze({name: 'Brisbane demo', center: {lat: -27.4661, lng: 153.0244}});
export const SEED_WORLD = Object.freeze({
  tracks: [
    {id:'way/101', type:'main', coords:[{lat:-27.4674,lng:153.0142},{lat:-27.4661,lng:153.0244},{lat:-27.4598,lng:153.0353},{lat:-27.4431,lng:153.0421}]},
    {id:'way/102', type:'branch', coords:[{lat:-27.4431,lng:153.0421},{lat:-27.4385,lng:153.0289},{lat:-27.4262,lng:153.0112}]},
    {id:'way/103', type:'main', coords:[{lat:-27.4674,lng:153.0142},{lat:-27.4682,lng:152.9981},{lat:-27.5012,lng:152.9734}]},
    {id:'way/104', type:'main', coords:[{lat:-27.4674,lng:153.0142},{lat:-27.4754,lng:153.0202},{lat:-27.4815,lng:153.0261},{lat:-27.5255,lng:153.0331}]}
  ],
  stations: [
    {id:'node/s1',name:'Roma Street Station',lat:-27.4674,lng:153.0142},
    {id:'node/s2',name:'Brisbane Central Station',lat:-27.4661,lng:153.0244},
    {id:'node/s3',name:'Fortitude Valley Station',lat:-27.4598,lng:153.0353},
    {id:'node/s4',name:'Bowen Hills Station',lat:-27.4431,lng:153.0421},
    {id:'node/s5',name:'Milton Station',lat:-27.4682,lng:152.9981},
    {id:'node/s6',name:'South Brisbane Station',lat:-27.4754,lng:153.0202}
  ]
});
