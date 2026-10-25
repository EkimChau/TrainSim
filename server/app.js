import express from 'express';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createAuth} from './auth.js';
import {SCENES} from '../src/shared/simscene.js';
import {SEED_REGION} from '../src/shared/seed-world.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function createApp(options={}) {
  const config={mapsApiKey:options.mapsApiKey??process.env.GOOGLE_MAPS_API_KEY??'',gisClientId:options.gisClientId??process.env.GIS_CLIENT_ID??'',sessionSecret:options.sessionSecret??process.env.SESSION_SECRET??'',secure:options.cookieSecure??(process.env.COOKIE_SECURE==='1')};
  const app=express();app.disable('x-powered-by');
  app.use(express.json({limit:'16kb'}));
  app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','strict-origin-when-cross-origin');next();});
  app.get('/api/health',(_req,res)=>res.json({ok:true,app:'TrainSim',mode:'prototype'}));
  app.get('/api/config',(_req,res)=>res.json({mapsApiKey:config.mapsApiKey,gisClientId:config.gisClientId,region:SEED_REGION,scenes:SCENES,source:'synthetic-seed'}));
  createAuth(config).mount(app);
  app.use(express.static(path.join(ROOT,'public'),{index:'index.html',extensions:false}));
  app.use((_req,res)=>res.status(404).json({error:'Not found'}));
  return app;
}
