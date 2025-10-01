/**
 * GET /api/nasabah?id=...&token=...&exp=...
 * - Mengembalikan data satu nasabah (id, name, balance, updatedAt)
 * - Verifikasi token HMAC(id.exp) dengan JWT_SECRET
 * - Jika exp tidak diberikan, token tetap diverifikasi tanpa kadaluarsa
 */

const crypto = require('crypto');

function safeB64(input){ return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function hmac(data, secret){ return crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }

async function jsonbinGet(){
  const BIN_ID = process.env.BIN_ID; const KEY = process.env.JSONBIN_API_KEY;
  const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': KEY, 'X-Bin-Meta': 'false' }});
  if(!r.ok) throw new Error('JSONBin GET failed: '+r.status);
  const j = await r.json();
  return j && j.record ? j.record : j;
}

module.exports = async function handler(req, res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    if(req.method!=='GET'){ res.setHeader('Allow','GET'); return res.status(405).send(JSON.stringify({error:'method_not_allowed'})); }
    const { id, token, exp } = req.query || {};
    if(!id || !token) return res.status(400).send(JSON.stringify({error:'missing_params'}));
    const secret = process.env.JWT_SECRET||'';

    // verifikasi kadaluarsa bila ada exp
    if(exp){
      const now = Math.floor(Date.now()/1000);
      const expNum = Number(exp);
      if(!expNum || now > expNum) return res.status(401).send(JSON.stringify({error:'expired'}));
    }

    // token = HMAC_SHA256(id + '.' + (exp||'')) dengan JWT_SECRET
    const expected = hmac(id + '.' + (exp||''), secret);
    if(token !== expected) return res.status(401).send(JSON.stringify({error:'bad_token'}));

    const data = await jsonbinGet();
    const list = Array.isArray(data.customers)? data.customers : [];
    const c = list.find(x=>x.id===id);
    if(!c) return res.status(404).send(JSON.stringify({error:'not_found'}));
    return res.status(200).send(JSON.stringify({ id: c.id, name: c.name, balance: c.balance, updatedAt: data.updatedAt||null }));
  }catch(e){
    return res.status(500).send(JSON.stringify({error:String(e.message||e)}));
  }
}
