/**
 * POST /api/generate-link { id, ttlMinutes? }
 * - Hanya admin (Authorization: Bearer <token>)
 * - Kembalikan path /nasabah.html?id=...&exp=...&token=...
 */

const crypto = require('crypto');

function verifyJWT(token, secret){
  try{
    const [h,p,s] = token.split('.');
    if(!(h&&p&&s)) return null;
    const check = crypto.createHmac('sha256', secret).update(h+'.'+p).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    if(check!==s) return null;
    const body = JSON.parse(Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString());
    if(!body.exp || Math.floor(Date.now()/1000) > body.exp) return null;
    return body;
  }catch(e){ return null; }
}
function hmac(data, secret){ return crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }

module.exports = async function handler(req, res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST'){ res.setHeader('Allow','POST'); return res.status(405).send(JSON.stringify({error:'method_not_allowed'})); }
  try{
    const auth = req.headers['authorization']||'';
    const token = auth.startsWith('Bearer ')? auth.slice(7): '';
    const secret = process.env.JWT_SECRET||'';
    const payload = verifyJWT(token, secret);
    if(!payload || payload.sub!=='admin') return res.status(401).send(JSON.stringify({error:'unauthorized'}));

    const { id, ttlMinutes } = typeof req.body==='object' ? req.body : JSON.parse(req.body||'{}');
    if(!id) return res.status(400).send(JSON.stringify({error:'missing_id'}));

    const ttl = Math.max(1, Number(ttlMinutes||10080)); // default 7 hari
    const exp = Math.floor(Date.now()/1000) + ttl*60;
    const sig = hmac(id + '.' + exp, secret);

    const path = `/nasabah.html?id=${encodeURIComponent(id)}&exp=${exp}&token=${encodeURIComponent(sig)}`;
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = host ? `${proto}://${host}${path}` : path;

    return res.status(200).send(JSON.stringify({ path, url, exp }));
  }catch(e){
    return res.status(500).send(JSON.stringify({error:String(e.message||e)}));
  }
}
