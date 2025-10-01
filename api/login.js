/**
 * POST /api/login { password }
 * - jika benar, balas { token, expiresAt }
 * ENV:
 * - ADMIN_PASSWORD (kata sandi admin)
 * - JWT_SECRET (string acak panjang)
 */

const crypto = require('crypto');
function b64url(input){ return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function signJWT(payload, secret, expSec=3600){
  const header = { alg:'HS256', typ:'JWT' };
  const now = Math.floor(Date.now()/1000);
  const body = { ...payload, iat: now, exp: now + expSec };
  const token = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(token).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return { token: token + '.' + sig, exp: body.exp };
}

module.exports = async function handler(req, res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!== 'POST') { res.setHeader('Allow','POST'); return res.status(405).send(JSON.stringify({error:'method_not_allowed'})); }
  try{
    const bodyObj = typeof req.body==='object' ? req.body : JSON.parse(req.body||'{}');
    const password = bodyObj.password;
    const ok = password && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD;
    if(!ok) return res.status(401).send(JSON.stringify({error:'invalid_password'}));
    const secret = process.env.JWT_SECRET||'';
    const { token, exp } = signJWT({ sub:'admin' }, secret, 60*60); // 1 jam
    return res.status(200).send(JSON.stringify({ token, expiresAt: exp }));
  }catch(e){
    return res.status(500).send(JSON.stringify({error:String(e.message||e)}));
  }
}
