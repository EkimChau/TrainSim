/**
 * Query log: every SQL statement the app runs (console, editor and map API) is
 * recorded once per (database, exact SQL text) with a call count and last-call
 * time, plus a bounded per-call history. Stored in data/local/console.sqlite.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const SCHEMA=`
CREATE TABLE IF NOT EXISTS schema_info(key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO schema_info(key,value) VALUES('natural_keys','all') ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS saved_query(
  query_id       INTEGER PRIMARY KEY,
  database       TEXT NOT NULL,
  sql            TEXT NOT NULL,
  sql_hash       TEXT NOT NULL,
  name           TEXT NOT NULL,
  preset         INTEGER NOT NULL DEFAULT 0,
  call_count     INTEGER NOT NULL DEFAULT 0,
  last_called_at TEXT,
  last_source    TEXT,
  last_ms        REAL,
  last_error     TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE(database, sql_hash)
);
CREATE INDEX IF NOT EXISTS saved_query_recent ON saved_query(last_called_at DESC);
CREATE TABLE IF NOT EXISTS query_call(
  call_id     INTEGER PRIMARY KEY,
  query_id    INTEGER NOT NULL REFERENCES saved_query(query_id) ON DELETE CASCADE,
  called_at   TEXT NOT NULL,
  source      TEXT NOT NULL,
  duration_ms REAL,
  row_count   INTEGER,
  error       TEXT,
  UNIQUE(query_id, called_at, source)
);
CREATE INDEX IF NOT EXISTS query_call_recent ON query_call(called_at DESC);
`;
const KEEP_CALLS=20000;

export const normaliseSql=sql=>String(sql).trim();
export const sqlHash=(database,sql)=>crypto.createHash('sha256').update(database+'\0'+normaliseSql(sql)).digest('hex');
const label=sql=>normaliseSql(sql).replace(/\s+/g,' ').slice(0,90);

export class QueryLog{
  constructor(file){
    this.file=file;
    fs.mkdirSync(path.dirname(file),{recursive:true});
    this.db=new DatabaseSync(file,{timeout:3000});
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    this.db.exec(SCHEMA);
    this.upsert=this.db.prepare(`INSERT INTO saved_query(database,sql,sql_hash,name,call_count,last_called_at,last_source,last_ms,last_error,created_at)
      VALUES(?,?,?,?,1,?,?,?,?,?)
      ON CONFLICT(database,sql_hash) DO UPDATE SET call_count=call_count+1,last_called_at=excluded.last_called_at,
        last_source=excluded.last_source,last_ms=excluded.last_ms,last_error=excluded.last_error
      RETURNING query_id`);
    this.call=this.db.prepare('INSERT OR IGNORE INTO query_call(query_id,called_at,source,duration_ms,row_count,error) VALUES(?,?,?,?,?,?)');
    this.inserts=0;
  }
  /** Record one execution; returns the saved query id. */
  record(database,sql,{source='console',ms=null,rows=null,error=null}={}){
    const now=new Date().toISOString();
    const text=normaliseSql(sql);
    const {query_id}=this.upsert.get(database,text,sqlHash(database,text),label(text),now,source,ms,error,now);
    this.call.run(query_id,now,source,ms,rows,error);
    if(++this.inserts%500===0)this.db.prepare('DELETE FROM query_call WHERE call_id <= (SELECT max(call_id) FROM query_call) - ?').run(KEEP_CALLS);
    return Number(query_id);
  }
  /** Saved queries, most recently called first; presets never called sort by name at the end. */
  list({database,source,limit=500}={}){
    const where=[],args=[];
    if(database){where.push('database=?');args.push(database);}
    if(source==='console')where.push("(last_source IN ('console','editor') OR preset=1)");
    else if(source){where.push('last_source=?');args.push(source);}
    return this.db.prepare(`SELECT query_id AS id,database,sql,name,preset,call_count AS count,last_called_at AS lastCalled,
        last_source AS lastSource,last_ms AS lastMs,last_error AS lastError FROM saved_query
        ${where.length?'WHERE '+where.join(' AND '):''}
        ORDER BY last_called_at IS NULL, last_called_at DESC, name LIMIT ?`).all(...args,limit);
  }
  get(id){return this.db.prepare('SELECT query_id AS id,database,sql,name,preset,call_count AS count,last_called_at AS lastCalled FROM saved_query WHERE query_id=?').get(Number(id));}
  calls(id,limit=50){return this.db.prepare('SELECT called_at AS calledAt,source,duration_ms AS ms,row_count AS rows,error FROM query_call WHERE query_id=? ORDER BY call_id DESC LIMIT ?').all(Number(id),limit);}
  rename(id,name){
    if(typeof name!=='string'||!name.trim()||name.length>120)throw new Error('A name up to 120 characters is required');
    const r=this.db.prepare('UPDATE saved_query SET name=? WHERE query_id=?').run(name.trim(),Number(id));
    if(!r.changes)throw new Error('Saved query not found');
    return this.get(id);
  }
  /** Save a query without running it (unique by database + SQL text). */
  save(database,sql,name){
    const text=normaliseSql(sql);
    if(!text)throw new Error('SQL is required');
    this.db.prepare(`INSERT INTO saved_query(database,sql,sql_hash,name,created_at) VALUES(?,?,?,?,?)
      ON CONFLICT(database,sql_hash) DO UPDATE SET name=excluded.name`).run(database,text,sqlHash(database,text),(name||label(text)).slice(0,120),new Date().toISOString());
    return this.db.prepare('SELECT query_id AS id FROM saved_query WHERE database=? AND sql_hash=?').get(database,sqlHash(database,text)).id;
  }
  remove(id){
    const r=this.db.prepare('DELETE FROM saved_query WHERE query_id=?').run(Number(id));
    if(!r.changes)throw new Error('Saved query not found');
    return {deleted:Number(id)};
  }
  /** Load presets from a JSON file: [{name, database, sql}], idempotent. */
  seed(file){
    if(!fs.existsSync(file))return 0;
    const presets=JSON.parse(fs.readFileSync(file,'utf8'));
    const stmt=this.db.prepare(`INSERT INTO saved_query(database,sql,sql_hash,name,preset,created_at) VALUES(?,?,?,?,1,?)
      ON CONFLICT(database,sql_hash) DO UPDATE SET name=excluded.name, preset=1`);
    const now=new Date().toISOString();
    for(const p of presets)stmt.run(p.database,normaliseSql(p.sql),sqlHash(p.database,p.sql),p.name,now);
    return presets.length;
  }
  close(){this.db.close();}
}
