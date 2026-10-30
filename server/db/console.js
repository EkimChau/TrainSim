/**
 * Live, local-only access to every SQLite database in the project.
 * Every statement (console grid, query editor and map API) goes through run(),
 * which records it in the QueryLog.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const DB_FILE=/\.(?:sqlite|sqlite3|db)$/i;
const IGNORED=new Set(['.git','node_modules','.venv','venv','dist','build','cache']);
export const MAX_ROWS=1000;
export const PAGE_SIZE=100;
const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
const plain=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,
  typeof v==='bigint'?(Number.isSafeInteger(Number(v))?Number(v):v.toString()):v instanceof Uint8Array?`base64:${Buffer.from(v).toString('base64')}`:v])));
const OPS={'=':'=','!=':'<>','<':'<','<=':'<=','>':'>','>=':'>=','like':'LIKE','is null':'IS NULL','not null':'IS NOT NULL'};
const protectedInput=id=>['data/esig/esig.sqlite','data/corpus/corpus.sqlite','data/trainsim.sqlite'].includes(id)||id.startsWith('data/local/backups/')||id.startsWith('data/current/');

/** SQLite's prepare() silently ignores trailing statements: refuse more than one. */
export function singleStatement(sql){
  if(typeof sql!=='string'||!sql.trim()||sql.length>200000)throw new Error('Enter one SQL statement (maximum 200KB)');
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

export class DbConsole{
  constructor(root,log){this.root=path.resolve(root);this.log=log;}

  /** Real SQLite files under the project (header-checked, symlinks ignored). */
  databases(){
    const found=[];
    const walk=(dir,depth=0)=>{
      if(depth>8||!fs.existsSync(dir))return;
      for(const f of fs.readdirSync(dir,{withFileTypes:true})){
        if(f.isSymbolicLink()||IGNORED.has(f.name))continue;
        const full=path.join(dir,f.name);
        if(f.isDirectory())walk(full,depth+1);
        else if(f.isFile()&&DB_FILE.test(f.name)){
          try{
            const h=Buffer.alloc(16),fd=fs.openSync(full,'r');
            try{fs.readSync(fd,h,0,16,0);}finally{fs.closeSync(fd);}
            if(h.toString()==='SQLite format 3\0')found.push(path.relative(this.root,full).split(path.sep).join('/'));
          }catch{/* file replaced mid-scan */}
        }
      }
    };
    walk(this.root);
    return found.sort();
  }
  describe(){
    return this.databases().map(id=>{
      const s=fs.statSync(path.join(this.root,id));
      return {id,bytes:s.size,modified:s.mtime.toISOString(),readOnly:protectedInput(id),role:id==='data/simworld/simworld.sqlite'?'fictitious_simworld':protectedInput(id)?'reference_input':'local_tooling'};
    });
  }
  open(id){
    if(typeof id!=='string'||!this.databases().includes(id))throw new Error(`Database not found inside the project: ${id}`);
    const db=new DatabaseSync(path.resolve(this.root,id),{timeout:5000,readOnly:protectedInput(id)});
    db.exec('PRAGMA foreign_keys=ON');
    if(!protectedInput(id))this.guards(db);
    return db;
  }
  /**
   * Duplicate protection for databases without natural keys: a BEFORE INSERT trigger
   * rejects rows whose non-id payload already exists. Databases built from our own
   * schemas declare schema_info.natural_keys='all' (every table is keyed by OSM or
   * natural ids) and are left untouched, so bulk ingests stay fast.
   */
  guards(db){
    try{
      const flag=db.prepare("SELECT value FROM schema_info WHERE key='natural_keys'").get();
      if(flag?.value==='all')return;
    }catch{/* no schema_info table */}
    const tables=db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    for(const table of tables){
      if(/^CREATE\s+VIRTUAL\s+TABLE/i.test(table.sql??''))continue;
      const cols=db.prepare('SELECT name, pk, hidden FROM pragma_table_xinfo(?)').all(table.name).filter(c=>!c.hidden);
      const payload=cols.filter(c=>!(c.name.toLowerCase()==='id'&&c.pk&&cols.length>1));
      if(!payload.length)continue;
      const condition=payload.map(c=>`${quote(c.name)} IS NEW.${quote(c.name)}`).join(' AND ');
      const name='trainsim_unique_'+crypto.createHash('sha256').update(table.name).digest('hex').slice(0,20);
      try{db.exec(`CREATE TRIGGER IF NOT EXISTS ${quote(name)} BEFORE INSERT ON ${quote(table.name)} WHEN EXISTS(SELECT 1 FROM ${quote(table.name)} WHERE ${condition}) BEGIN SELECT RAISE(ABORT, 'Duplicate row blocked'); END`);}
      catch{/* read-only or shadow table */}
    }
  }
  /** Run one statement, logged. Returns rows (capped) or change counts. */
  run(id,sql,args=[],{source='console',maxRows=MAX_ROWS,db:shared=null}={}){
    const text=singleStatement(sql);
    const db=shared??this.open(id);
    const t0=performance.now();
    let result=null,error=null;
    try{
      const stmt=db.prepare(text);
      if(stmt.columns().length){
        const rows=[];let truncated=false;
        for(const row of stmt.iterate(...args)){
          if(rows.length>=maxRows){truncated=true;break;}
          rows.push(row);
        }
        result={columns:stmt.columns().map(c=>c.name),rows:plain(rows),count:rows.length,truncated};
      }else{
        const r=stmt.run(...args);
        result={columns:[],rows:[],changes:Number(r.changes),lastInsertRowid:String(r.lastInsertRowid)};
      }
      return result;
    }catch(e){error=String(e.message??e);throw e;}
    finally{
      const ms=Math.round((performance.now()-t0)*100)/100;
      if(!shared)db.close();
      try{
        const queryId=this.log?.record(id,text,{source,ms,error,rows:result?(result.columns.length?result.rows.length:result.changes):null});
        if(result){result.queryId=queryId;result.ms=ms;}
      }catch{/* logging must never break a query */}
    }
  }
  /** Query editor: one statement exactly as typed. */
  execute(id,sql){
    if(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(?:ATTACH|DETACH)\b/i.test(sql))throw new Error('Database attachments are unsupported; select a database instead');
    return this.run(id,sql,[],{source:'editor'});
  }

  tables(id){
    const db=this.open(id);
    try{
      const rows=this.run(id,"SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",[],{db,source:'console'}).rows;
      for(const t of rows){
        try{t.rows=Number(db.prepare(`SELECT count(*) AS n FROM ${quote(t.name)}`).get().n);}catch{t.rows=null;}
      }
      return rows;
    }finally{db.close();}
  }
  columns(db,table){
    const known=db.prepare("SELECT type FROM sqlite_master WHERE name=? AND type IN ('table','view')").get(table);
    if(!known)throw new Error(`Unknown table or view: ${table}`);
    const cols=db.prepare('SELECT name, type, "notnull" AS required, dflt_value AS defaultValue, pk, hidden FROM pragma_table_xinfo(?)').all(table).filter(c=>!c.hidden).map(c=>({...c,pk:Number(c.pk),required:Number(c.required)}));
    return {type:known.type,columns:cols,pk:cols.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name),virtual:/^CREATE\s+VIRTUAL/i.test(db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(table)?.sql??'')};
  }
  /** One page of a table with optional filter (column op value) and sort. */
  browse(id,table,{page=0,filterColumn,filterOp='=',filterValue,sort,dir='asc'}={}){
    page=Number(page)||0;
    if(!Number.isInteger(page)||page<0||page>1e6)throw new Error('Invalid page');
    const db=this.open(id);
    try{
      const meta=this.columns(db,table);
      const names=new Set(meta.columns.map(c=>c.name));
      const includeRowid=meta.type==='table'&&!meta.pk.length&&!meta.virtual;
      const where=[],args=[];
      if(filterColumn){
        if(!names.has(filterColumn))throw new Error('Unknown filter column');
        const op=OPS[String(filterOp).toLowerCase()];
        if(!op)throw new Error('Unsupported filter operator');
        if(op.startsWith('IS'))where.push(`${quote(filterColumn)} ${op}`);
        else{where.push(`${quote(filterColumn)} ${op} ?`);args.push(op==='LIKE'&&!/[%_]/.test(filterValue??'')?`%${filterValue}%`:coerce(filterValue,meta.columns.find(c=>c.name===filterColumn)?.type));}
      }
      const order=sort&&names.has(sort)?` ORDER BY ${quote(sort)} ${dir==='desc'?'DESC':'ASC'}`:'';
      const w=where.length?` WHERE ${where.join(' AND ')}`:'';
      const sql=`SELECT ${includeRowid?'rowid AS "__rowid", ':''}* FROM ${quote(table)}${w}${order} LIMIT ? OFFSET ?`;
      const data=this.run(id,sql,[...args,PAGE_SIZE+1,page*PAGE_SIZE],{db,maxRows:PAGE_SIZE+1,source:'console'});
      const total=Number(this.run(id,`SELECT count(*) AS n FROM ${quote(table)}${w}`,args,{db,source:'console'}).rows[0].n);
      const referenceSnapshot=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name=? AND name LIKE 'simworld_reference_guard_%' LIMIT 1").get(table);
      return {table,...meta,readOnly:protectedInput(id)||referenceSnapshot,includeRowid,rows:data.rows.slice(0,PAGE_SIZE),hasMore:data.rows.length>PAGE_SIZE,page,total,pageSize:PAGE_SIZE};
    }finally{db.close();}
  }
  _editable(db,table){
    const meta=this.columns(db,table);
    if(meta.type!=='table'||meta.virtual)throw new Error('Views and virtual tables cannot be edited');
    return meta;
  }
  _where(meta,original){
    if(meta.pk.length){
      if(!meta.pk.every(k=>Object.hasOwn(original??{},k)))throw new Error('Missing original primary-key values');
      return {where:meta.pk.map(k=>`${quote(k)} IS ?`).join(' AND '),args:meta.pk.map(k=>original[k])};
    }
    if(!Number.isInteger(original?.__rowid))throw new Error('Row id missing; this table cannot be edited by row');
    return {where:'rowid = ?',args:[original.__rowid]};
  }
  /** Insert a row. Rejects rows whose non-key payload already exists (no duplicates in any table). */
  add(id,table,record){
    if(!record||Array.isArray(record)||typeof record!=='object')throw new Error('New row must be a JSON object');
    const db=this.open(id);
    try{
      const meta=this._editable(db,table);
      const allowed=new Set(meta.columns.map(c=>c.name));
      const keys=Object.keys(record).filter(k=>record[k]!==''&&record[k]!==undefined);
      const types=Object.fromEntries(meta.columns.map(c=>[c.name,c.type]));
      if(keys.some(k=>!allowed.has(k)))throw new Error('Unknown row columns');
      const payload=keys.filter(k=>!meta.pk.includes(k));
      if(payload.length){
        const dupe=db.prepare(`SELECT 1 FROM ${quote(table)} WHERE ${payload.map(k=>`${quote(k)} IS ?`).join(' AND ')} LIMIT 1`).get(...payload.map(k=>coerce(record[k],types[k])));
        if(dupe)throw new Error('Duplicate row blocked: an identical row already exists');
      }
      const sql=keys.length?`INSERT INTO ${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`:`INSERT INTO ${quote(table)} DEFAULT VALUES`;
      return this.run(id,sql,keys.map(k=>coerce(record[k],types[k])),{db,source:'console'});
    }finally{db.close();}
  }
  edit(id,table,original,changes){
    const db=this.open(id);
    try{
      const meta=this._editable(db,table),allowed=new Set(meta.columns.map(c=>c.name));
      const keys=Object.keys(changes??{});
      if(!keys.length||keys.some(k=>!allowed.has(k)))throw new Error('No editable columns supplied');
      const {where,args}=this._where(meta,original);
      const types=Object.fromEntries(meta.columns.map(c=>[c.name,c.type]));
      return this.run(id,`UPDATE ${quote(table)} SET ${keys.map(k=>`${quote(k)} = ?`).join(', ')} WHERE ${where}`,[...keys.map(k=>coerce(changes[k],types[k])),...args],{db,source:'console'});
    }finally{db.close();}
  }
  delete(id,table,originals){
    const list=Array.isArray(originals)?originals:[originals];
    const db=this.open(id);
    try{
      const meta=this._editable(db,table);
      let changes=0;
      db.exec('BEGIN');
      try{
        for(const o of list){const {where,args}=this._where(meta,o);changes+=this.run(id,`DELETE FROM ${quote(table)} WHERE ${where}`,args,{db,source:'console'}).changes;}
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return {changes};
    }finally{db.close();}
  }
}

/** Grid editors send strings; keep JSON/text as-is, turn numeric strings into numbers and 'NULL' into null. */
function coerce(v,type=''){
  if(v===null||typeof v!=='string')return v??null;
  if(v==='NULL')return null;
  if(/INT|REAL|NUM|FLOA|DOUB|DEC/i.test(type)&&v.trim()!==''&&Number.isFinite(Number(v)))return Number(v);
  return v;
}
