// Zero-dependency *preview only* to allow local/offline UI inspection.
// The real app server and GIS auth use Express: npm install && npm run build && npm start.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||3000);
const routes={'/':'public/index.html','/index.html':'public/index.html','/style.css':'public/style.css'};
const mime=f=>f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';
http.createServer(async(req,res)=>{
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/assets/app.js'){res.writeHead(302,{Location:'/src/client/main.js'}).end();return;}
  if(name==='/api/region/world'||name==='/api/region/manifest'){
    const f=path.join(root,`data/current/${name.endsWith('world')?'world':'manifest'}.json`);
    try{const body=await readFile(f);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(body);}catch{res.writeHead(404,{'Content-Type':'application/json'}).end('{}');}
    return;
  }
  if(name==='/api/config'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({mapsApiKey:'',gisClientId:''}));return;}
  if(name==='/api/auth/me'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({enabled:false,user:null}));return;}
  if(name==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,mode:'offline-preview'}));return;}
  const rel=routes[name]||(name.startsWith('/src/')&&!name.includes('..')?name.slice(1):null);
  if(!rel){res.writeHead(404).end('Not found');return;}
  try{const data=await readFile(path.join(root,rel));res.writeHead(200,{'Content-Type':mime(rel),'X-Content-Type-Options':'nosniff'}).end(data);}
  catch{res.writeHead(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Offline preview: http://127.0.0.1:${port}`));
