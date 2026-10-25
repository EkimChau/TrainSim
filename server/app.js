import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DbConsole} from './db/console.js';
import {QueryLog} from './db/query-log.js';
import {MapApi} from './map-api.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const LOOPBACK=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);

/**
 * Local-only TrainSim app. No sign-in and no permissions by design: every API
 * route rejects non-loopback clients, so never expose it through a proxy or tunnel.
 */
export function createApp(options={}){
  const root=options.root??ROOT;
  const log=options.log??new QueryLog(options.logFile??path.join(root,'data/local/console.sqlite'));
  log.seed(path.join(root,'db/trainsim/saved-queries.json'));
  const store=new DbConsole(root,log);
  const map=new MapApi(store,root,options.worldDb);
  if(map.available())map.ensureTrainFleet();
  const config={mapsApiKey:options.mapsApiKey??process.env.GOOGLE_MAPS_API_KEY??'',mapId:options.mapId??process.env.GOOGLE_MAPS_MAP_ID??''};

  const app=express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'2mb'}));
  app.use((_req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','strict-origin-when-cross-origin');next();});
  app.use('/api',(req,res,next)=>{
    if(!options.allowRemote&&!LOOPBACK.has(req.socket.remoteAddress??''))return res.status(403).json({error:'TrainSim API is available on loopback only'});
    res.set('Cache-Control','no-store');next();
  });
  const use=fn=>(req,res)=>{
    try{res.json(fn(req));}
    catch(error){
      const msg=String(error.message??error);
      const status=/not found|unknown|missing|invalid|required|unsupported|only one|statement|must be|cannot|columns/i.test(msg)?400:409;
      res.status(status).json({error:msg});
    }
  };

  app.get('/api/health',(_req,res)=>res.json({ok:true,app:'TrainSim'}));
  app.get('/api/config',use(()=>({mapsApiKey:config.mapsApiKey,mapId:config.mapId,worldDb:map.id,worldAvailable:map.available()})));

  const db=express.Router();
  db.get('/databases',use(()=>({databases:store.describe()})));
  db.get('/tables',use(req=>({tables:store.tables(req.query.database)})));
  db.get('/table',use(req=>store.browse(req.query.database,req.query.table,req.query)));
  db.post('/rows',use(req=>store.add(req.body?.database,req.body?.table,req.body?.record)));
  db.patch('/rows',use(req=>store.edit(req.body?.database,req.body?.table,req.body?.original,req.body?.changes)));
  db.delete('/rows',use(req=>store.delete(req.body?.database,req.body?.table,req.body?.originals??req.body?.original)));
  db.post('/query',use(req=>store.execute(req.body?.database,req.body?.sql)));
  db.get('/queries',use(req=>({queries:log.list({database:req.query.database||undefined,source:req.query.source||undefined})})));
  db.post('/queries',use(req=>({id:log.save(req.body?.database,req.body?.sql,req.body?.name)})));
  db.patch('/queries/:id',use(req=>({query:log.rename(req.params.id,req.body?.name)})));
  db.delete('/queries/:id',use(req=>log.remove(req.params.id)));
  db.get('/queries/:id/calls',use(req=>({calls:log.calls(req.params.id)})));
  db.post('/queries/:id/run',use(req=>{
    const q=log.get(req.params.id);
    if(!q)throw new Error('Saved query not found');
    return {...store.execute(q.database,q.sql),database:q.database,sql:q.sql};
  }));
  app.use('/api/db',db);

  const m=express.Router();
  m.get('/status',use(()=>map.status()));
  m.get('/features',use(req=>map.features(req.query)));
  m.get('/feature/:type/:id',use(req=>map.feature(req.params.type,req.params.id)));
  m.get('/search',use(req=>({results:map.search(req.query.q)})));
  m.get('/routes',use(()=>({routes:map.routes()})));
  m.get('/routes/:id',use(req=>map.route(req.params.id)));
  m.get('/engines',use(()=>({engines:map.engines()})));
  app.use('/api/map',m);

  app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
  app.use(express.static(path.join(root,'public'),{index:'index.html'}));
  app.use((_req,res)=>res.status(404).type('text').send('Not found'));
  return app;
}
