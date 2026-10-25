import {createHmac, timingSafeEqual} from 'node:crypto';

const COOKIE='trainsim_session';
const AGE_SECONDS=8*60*60;
const sign=(payload,secret)=>createHmac('sha256',secret).update(payload).digest('base64url');
function readCookie(req) {
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE}=`));
  return raw?.slice(COOKIE.length+1);
}
export function createAuth({gisClientId,sessionSecret,secure=false,verifyCredential}={}) {
  if (gisClientId && (!sessionSecret || sessionSecret.length<32)) throw new Error('SESSION_SECRET must be >=32 chars with GIS enabled');
  const verifier = verifyCredential || (gisClientId ? async credential => {
    const {OAuth2Client}=await import('google-auth-library');
    const ticket=await new OAuth2Client(gisClientId).verifyIdToken({idToken:credential,audience:gisClientId});
    const p=ticket.getPayload();
    if (!p?.sub || !p?.email_verified) throw new Error('Unverified identity');
    return {sub:p.sub,name:p.name||'',email:p.email||''};
  } : null);
  function current(req) {
    if (!sessionSecret) return null;
    const token=readCookie(req); if(!token) return null;
    const [payload,mac,...rest]=token.split('.'); if(!payload||!mac||rest.length) return null;
    const expected=sign(payload,sessionSecret);
    if(mac.length!==expected.length || !timingSafeEqual(Buffer.from(mac),Buffer.from(expected))) return null;
    try {const data=JSON.parse(Buffer.from(payload,'base64url').toString());return data.exp>Date.now() && typeof data.sub==='string'?data:null;}catch{return null;}
  }
  const cookieOptions=`HttpOnly; SameSite=Strict; Path=/; Max-Age=${AGE_SECONDS}${secure?'; Secure':''}`;
  const clearOptions=`HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`;
  const sameOrigin=(req,res,next)=>{
    const origin=req.get('origin');
    if(!origin || origin!==`${req.protocol}://${req.get('host')}`) return res.status(403).json({error:'Same-origin request required'});
    next();
  };
  return {
    mount(app) {
      app.get('/api/auth/me',(req,res)=>{const user=current(req);res.json({enabled:!!gisClientId,user:user?{sub:user.sub,name:user.name,email:user.email}:null});});
      app.post('/api/auth/google',sameOrigin,async(req,res)=>{
        if(!gisClientId)return res.status(503).json({error:'GIS authentication not configured'});
        const credential=req.body?.credential;
        if(typeof credential!=='string'||credential.length>8192)return res.status(400).json({error:'Invalid credential'});
        try {
          const p=await verifier(credential);
          if(!p?.sub)return res.status(401).json({error:'Unverified identity'});
          const user={sub:p.sub,name:p.name||'',email:p.email||'',exp:Date.now()+AGE_SECONDS*1000};
          const payload=Buffer.from(JSON.stringify(user)).toString('base64url');
          res.set('Set-Cookie',`${COOKIE}=${payload}.${sign(payload,sessionSecret)}; ${cookieOptions}`);
          res.json({user:{sub:user.sub,name:user.name,email:user.email}});
        }catch {res.status(401).json({error:'Google identity verification failed'});}
      });
      app.post('/api/auth/logout',sameOrigin,(req,res)=>{res.set('Set-Cookie',`${COOKIE}=; ${clearOptions}`);res.json({ok:true});});
      app.get('/api/private/ping',(req,res)=>{const user=current(req);if(!user)return res.status(401).json({error:'Sign in required'});res.json({ok:true,email:user.email});});
    }
  };
}
