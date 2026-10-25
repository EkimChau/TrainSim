/** Local-only SQLite console. All UI-initiated SQL goes through one audited adapter. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const ext=/\.(?:sqlite|sqlite3|db)$/i;
const ignored=new Set(['.git','node_modules','.venv','venv','dist','build']);
const MAX_ROWS=500;
const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
const values=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v instanceof Uint8Array?`base64:${Buffer.from(v).toString('base64')}`:v])));
const isIdentifier=s=>typeof s==='string'&&s.length>0&&s.length<=200;

// SQLite's prepare() silently ignores a trailing statement: never let Play do that.
export function singleStatement(sql){
  if(typeof sql!=='string'||!sql.trim()||sql.length>100000)throw new Error('Enter one SQL statement (maximum 100KB)');
  let q='',comment='',ended=false;
  for(let i=0;i<sql.length;i++){
    const c=sql[i],n=sql[i+1];
    if(comment==='line'){if(c==='\n')comment='';continue;}
    if(comment==='block'){if(c==='*'&&n==='/'){i++;comment='';}continue;}
    if(q){if(c===q){if(n===q){i++;continue;}q='';}else if(q===']'&&c===']')q='';continue;}
    if(c==='-'&&n==='-'){comment='line';i++;continue;}
    if(c==='/'&&n==='*'){comment='block';i++;continue;}
    if(['\'','"','`'].includes(c)){q=c;continue;}
    if(c==='['){q=']';continue;}
    if(c===';'){ended=true;continue;}
    if(ended&&!/\s/.test(c))throw new Error('Run only one SQL statement at a time');
  }
  return sql.trim();
}

export class DbConsole {
  constructor(root,{historyFile=path.join(root,'data/local/db-queries.json')}={}){
    this.root=path.resolve(root);this.historyFile=historyFile;
    try{this.history=JSON.parse(fs.readFileSync(historyFile,'utf8'));if(!Array.isArray(this.history))this.history=[];}catch{this.history=[];}
    this.nextSequence=this.history.reduce((max,q)=>Math.max(max,q.lastSequence||0),0);
  }
  databases(){
    const found=[];
    const walk=(dir,depth=0)=>{
      if(depth>12||!fs.existsSync(dir))return;
      for(const f of fs.readdirSync(dir,{withFileTypes:true})){
        if(f.isSymbolicLink()||ignored.has(f.name))continue;
        const full=path.join(dir,f.name);
        if(f.isDirectory())walk(full,depth+1);
        else if(f.isFile()&&ext.test(f.name)){
          try{const h=Buffer.alloc(16);const fd=fs.openSync(full,'r');try{fs.readSync(fd,h,0,16,0);}finally{fs.closeSync(fd);}
            if(h.toString()==='SQLite format 3\0')found.push(path.relative(this.root,full).split(path.sep).join('/'));
          }catch{/* Files can be replaced during an import. */}
        }
      }
    };
    walk(this.root);
    return found.sort();
  }
  _open(id){
    if(typeof id!=='string'||!this.databases().includes(id))throw new Error('Database not found inside the TrainSim project');
    const file=path.resolve(this.root,id);
    // Database paths come exclusively from a symlink-free project-local scan.
    const db=new DatabaseSync(file,{timeout:3000});
    db.exec('PRAGMA foreign_keys=ON');
    this._guards(db);
    return db;
  }
  _guards(db){
    const tables=db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    for(const table of tables){
      // Virtual tables and their shadow tables may not support ordinary triggers.
      if(/^CREATE\s+VIRTUAL\s+TABLE/i.test(table.sql??''))continue;
      const cols=db.prepare('SELECT name, type, pk, hidden FROM pragma_table_xinfo(?)').all(table.name).filter(c=>!c.hidden);
      const payload=cols.filter(c=>!(c.name.toLowerCase()==='id'&&c.pk&&cols.length>1));
      if(!payload.length)continue;
      const condition=payload.map(c=>`${quote(c.name)} IS NEW.${quote(c.name)}`).join(' AND ');
      const trigger=`CREATE TRIGGER IF NOT EXISTS ${quote('trainsim_unique_'+crypto.createHash('sha256').update(table.name).digest('hex').slice(0,20))} BEFORE INSERT ON ${quote(table.name)} WHEN EXISTS(SELECT 1 FROM ${quote(table.name)} WHERE ${condition}) BEGIN SELECT RAISE(ABORT, 'Duplicate row blocked'); END`;
      try{db.exec(trigger);}catch{/* Some legacy/shadow/read-only tables are not triggerable. Existing constraints still apply. */}
    }
  }
  _log(id,sql){
    const key=crypto.createHash('sha256').update(id+'\0'+sql.trim()).digest('hex');
    let item=this.history.find(q=>q.id===key);
    if(!item){item={id:key,database:id,sql:sql.trim(),name:sql.trim().replace(/\s+/g,' ').slice(0,84),count:0,lastCalled:null};this.history.push(item);}
    item.count++;item.lastSequence=++this.nextSequence;item.lastCalled=new Date().toISOString();
    this._saveHistory();
  }
  _saveHistory(){
    fs.mkdirSync(path.dirname(this.historyFile),{recursive:true});
    const temp=this.historyFile+'.tmp-'+process.pid;
    fs.writeFileSync(temp,JSON.stringify(this.history,null,2)+'\n',{mode:0o600});
    fs.renameSync(temp,this.historyFile);
  }
  saved(){return [...this.history].sort((a,b)=>(b.lastSequence??0)-(a.lastSequence??0)||(b.lastCalled??'').localeCompare(a.lastCalled??'')||a.name.localeCompare(b.name));}
  rename(queryId,name){
    const q=this.history.find(q=>q.id===queryId);
    if(!q)throw new Error('Saved query not found');
    if(typeof name!=='string'||!name.trim()||name.length>120)throw new Error('A name up to 120 characters is required');
    q.name=name.trim();this._saveHistory();return q;
  }
  _run(id,sql,args=[],{maxRows=MAX_ROWS}={}){
    const db=this._open(id);
    try{
      this._log(id,sql);
      const statement=db.prepare(singleStatement(sql));
      if(statement.columns().length){
        const out=[];let truncated=false;
        for(const row of statement.iterate(...args)){
          if(out.length>=maxRows){truncated=true;break;}
          out.push(row);
        }
        // A returned result can be produced by INSERT...RETURNING or UPDATE...RETURNING.
        this._guards(db);
        return {rows:values(out),columns:statement.columns().map(c=>c.name),truncated,count:out.length};
      }
      const r=statement.run(...args);
      this._guards(db);
      return {rows:[],columns:[],changes:r.changes,lastInsertRowid:String(r.lastInsertRowid)};
    }finally{db.close();}
  }
  execute(id,sql){return this._run(id,singleStatement(sql));}
  tables(id){
    return this._run(id,"SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name").rows;
  }
  columns(id,table){
    if(!isIdentifier(table)||!this.tables(id).some(t=>t.name===table))throw new Error('Unknown table or view');
    return this._run(id,'SELECT name, type, "notnull" AS required, dflt_value AS defaultValue, pk, hidden FROM pragma_table_xinfo(?)',[table]).rows.filter(c=>!c.hidden);
  }
  browse(id,table,page=0){
    if(!Number.isInteger(page)||page<0||page>100000)throw new Error('Invalid page');
    const tables=this.tables(id),entry=tables.find(t=>t.name===table);
    if(!entry)throw new Error('Unknown table');
    const columns=this.columns(id,table),pk=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
    const includeRowid=entry.type==='table'&&!pk.length;
    const sql=`SELECT ${includeRowid?'rowid AS "__trainsim_rowid", ':''}* FROM ${quote(table)} LIMIT ? OFFSET ?`;
    const data=this._run(id,sql,[101,page*100],{maxRows:101});
    return {table,type:entry.type,columns,pk,rows:data.rows.slice(0,100),hasMore:data.rows.length>100,page,includeRowid};
  }
  _where(pk,rowid,columns){
    if(pk.length){
      if(!pk.every(key=>Object.hasOwn(rowid??{},key)))throw new Error('Missing original primary-key values');
      return {where:pk.map(k=>`${quote(k)} IS ?`).join(' AND '),args:pk.map(k=>rowid[k])};
    }
    if(!Number.isInteger(rowid?.__trainsim_rowid))throw new Error('Row ID missing; editing this table is unsupported');
    return {where:'rowid = ?',args:[rowid.__trainsim_rowid]};
  }
  _metadata(id,table){
    const info=this.browse(id,table,0);
    if(info.type!=='table')throw new Error('Views cannot be edited');
    return info;
  }
  add(id,table,record){
    const {columns}=this._metadata(id,table);
    if(!record||Array.isArray(record)||typeof record!=='object')throw new Error('New row must be a JSON object');
    const keys=Object.keys(record),allowed=new Set(columns.map(c=>c.name));
    if(keys.some(k=>!allowed.has(k))||keys.length>columns.length)throw new Error('Unknown row columns');
    const sql=keys.length?`INSERT INTO ${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`:`INSERT INTO ${quote(table)} DEFAULT VALUES`;
    return this._run(id,sql,keys.map(k=>record[k]));
  }
  edit(id,table,original,changes){
    const {columns,pk}=this._metadata(id,table),allowed=new Set(columns.map(c=>c.name));
    const keys=Object.keys(changes??{});
    if(!keys.length||keys.some(k=>!allowed.has(k)||pk.includes(k)))throw new Error('No editable non-primary-key columns supplied');
    const {where,args}=this._where(pk,original,columns);
    return this._run(id,`UPDATE ${quote(table)} SET ${keys.map(k=>`${quote(k)} = ?`).join(', ')} WHERE ${where}`,[...keys.map(k=>changes[k]),...args]);
  }
  delete(id,table,original){
    const {pk,columns}=this._metadata(id,table),{where,args}=this._where(pk,original,columns);
    return this._run(id,`DELETE FROM ${quote(table)} WHERE ${where}`,args);
  }
}
