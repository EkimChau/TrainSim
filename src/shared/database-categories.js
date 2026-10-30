export const DATABASE_CATEGORIES={
  system:{label:'System',description:'Application bookkeeping, query history and local tools.'},
  simworld:{label:'SimWorld',description:'Fictitious simulation instances, parameters and published reference snapshots.'},
  corpus:{label:'Corpus',description:'Reference inputs used to construct SimWorld. Official evidence keeps its own source identity.'},
};

export function databaseIdentity(id){
  if(id.startsWith('data/local/backups/'))return {category:'system',title:id.split('/').at(-1),purpose:'Recovery backup',archived:true};
  if(id.startsWith('data/simworld/'))return {category:'simworld',title:id==='data/simworld/simworld.sqlite'?'SimWorld':id.split('/').at(-1),purpose:'Fictitious runtime world',archived:false};
  if(id==='data/esig/esig.sqlite')return {category:'corpus',title:'Official ETCS evidence',purpose:'Original document evidence and extracted candidates',archived:false};
  if(id==='data/corpus/corpus.sqlite')return {category:'corpus',title:'Technical corpus',purpose:'Local corpus contracts, relationships and dataset references',archived:false};
  if(id==='data/corpus/geography.sqlite')return {category:'corpus',title:'Geography & timetables',purpose:'OSM geography and Translink timetable input',archived:false};
  if(id.startsWith('data/current/')||id==='data/trainsim.sqlite')return {category:'corpus',title:id.split('/').at(-1),purpose:'Legacy source input',archived:true};
  if(id.startsWith('data/corpus/')||id.startsWith('data/esig/'))return {category:'corpus',title:id.split('/').at(-1),purpose:'Reference input',archived:false};
  if(id==='data/local/console.sqlite')return {category:'system',title:'Query history',purpose:'Saved queries and execution audit',archived:false};
  return {category:'system',title:id.split('/').at(-1),purpose:'Other local database',archived:false};
}
