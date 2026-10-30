import {pathToFileURL} from 'node:url';

export const SOURCE_TABLES=['schema_info','document','source_page','clause','source_artifact','classification_row','clause_classification','clause_relation','terminology','protocol_element','ingestion_audit'];
export const quote=name=>'"'+name.replaceAll('"','""')+'"';
export function attachReadOnly(db,file,alias){db.prepare(`ATTACH DATABASE ? AS ${quote(alias)}`).run(pathToFileURL(file).href+'?mode=ro');}
export function tableNames(db,alias='main'){
  return db.prepare(`SELECT name,sql FROM ${quote(alias)}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all()
    .filter(row=>!/^rtree_.*_(?:node|parent|rowid)$/.test(row.name)).map(row=>row.name);
}
export function copyTables(db,alias,names,{clear=false}={}){
  const available=new Set(tableNames(db));
  const counts={};
  for(const name of names){
    if(!available.has(name))continue;
    const columns=db.prepare(`PRAGMA ${quote(alias)}.table_info(${quote(name)})`).all().map(c=>quote(c.name)).join(',');
    if(clear&&name!=='schema_info')db.exec(`DELETE FROM ${quote(name)}`);
    db.exec(`INSERT OR REPLACE INTO ${quote(name)}(${columns}) SELECT ${columns} FROM ${quote(alias)}.${quote(name)}`);
    counts[name]=db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n;
  }
  return counts;
}
