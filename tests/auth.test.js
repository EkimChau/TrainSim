import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth} from '../server/auth.js';
const registered={};const app={get:(route,...handlers)=>registered[route]=handlers,post:(route,...handlers)=>registered[route]=handlers};
const secret='abcdef1234567890abcdef1234567890abcdef123';
const auth=createAuth({gisClientId:'local-client',sessionSecret:secret,verifyCredential:async token=>token==='valid'?{sub:'user-1',email:'user@example.test',name:'Demo'}:null});
auth.mount(app);
const request={body:{credential:'valid'},headers:{},protocol:'http',get:k=>({origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}[k])};
function response(){return{statusCode:200,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(body){this.body=body;return this;}};}
async function run(handlers,req,res){for(const h of handlers){if(h.length===3){let next=false;h(req,res,()=>{next=true;});if(!next)return;}else await h(req,res);}}
test('GIS requires a meaningful signing secret',()=>assert.throws(()=>createAuth({gisClientId:'web-id',sessionSecret:'short'}),/SESSION_SECRET/));
test('unauthenticated API returns 401',async()=>{const res=response();await run(registered['/api/private/ping'],request,res);assert.equal(res.statusCode,401);});
test('GIS rejects cross-origin authentication posts',async()=>{const res=response();await run(registered['/api/auth/google'],{...request,get:()=> 'http://evil.test'},res);assert.equal(res.statusCode,403);});
test('valid verified identity creates signed, HttpOnly cookie, invalid signature rejects',async()=>{
  const res=response();await run(registered['/api/auth/google'],request,res);
  assert.equal(res.statusCode,200);assert.match(res.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
  const token=res.headers['Set-Cookie'].split(';')[0];
  const me=response();await run(registered['/api/auth/me'],{...request,headers:{cookie:token}},me);assert.equal(me.body.user.email,'user@example.test');
  const ping=response();await run(registered['/api/private/ping'],{...request,headers:{cookie:token}},ping);assert.equal(ping.statusCode,200);
  const tampered=token.replace('user-1','user-2').replace(/.$/,'Z');
  const fail=response();await run(registered['/api/private/ping'],{...request,headers:{cookie:tampered}},fail);assert.equal(fail.statusCode,401);
});
