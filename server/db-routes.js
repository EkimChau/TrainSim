import express from 'express';
import {DbConsole} from './db-console.js';

// Intentionally does not use GIS login: this is a developer-only console.
// Reject remote clients even if the main app's HOST is configured broadly.
export function mountDbRoutes(app,root){
  const store=new DbConsole(root);
  const router=express.Router();
  router.use((req,res,next)=>{
    const ip=req.socket.remoteAddress??'';
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))return res.status(403).json({error:'Database console is available on loopback only'});
    res.set('Cache-Control','no-store');next();
  });
  const use=fn=>(req,res)=>{
    try{res.json(fn(req));}
    catch(error){
      const msg=String(error.message??error);
      const status=/not found|unknown|missing|invalid|required|unsupported|only one|statement|columns/i.test(msg)?400:409;
      res.status(status).json({error:msg});
    }
  };
  router.get('/databases',use(()=>({databases:store.databases()})));
  router.get('/tables',use(req=>({tables:store.tables(req.query.database)})));
  router.get('/table',use(req=>store.browse(req.query.database,req.query.table,Number(req.query.page||0))));
  router.get('/queries',use(()=>({queries:store.saved()})));
  router.patch('/queries/:id',use(req=>({query:store.rename(req.params.id,req.body?.name)})));
  router.post('/query',use(req=>store.execute(req.body?.database,req.body?.sql)));
  router.post('/rows',use(req=>store.add(req.body?.database,req.body?.table,req.body?.record)));
  router.patch('/rows',use(req=>store.edit(req.body?.database,req.body?.table,req.body?.original,req.body?.changes)));
  router.delete('/rows',use(req=>store.delete(req.body?.database,req.body?.table,req.body?.original)));
  app.use('/api/db',router);
}
