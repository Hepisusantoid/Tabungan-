/**
 * GET  /api/tabungan  -> ambil data { customers:[], updatedAt }
 * PUT  /api/tabungan  -> simpan data (perlu Authorization: Bearer <token>)
 * ENV (set di Vercel: Project Settings → Environment Variables):
 * JSONBIN_API_KEY (X-Master-Key)
 * BIN_ID          (ID bin JSONBin)
 * JWT_SECRET      (untuk verifikasi token)
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

async function jsonbinGet(){
  const BIN_ID = process.env.BIN_ID; const KEY = process.env.JSONBIN_API_KEY;
  const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, { headers: { 'X-Master-Key': KEY, 'X-Bin-Meta': 'false' }});
  if(!r.ok) throw new Error('JSONBin GET failed: '+r.status);
  const j = await r.json();
  return j && j.record ? j.record : j;
}
async function jsonbinPut(data){
  const BIN_ID = process.env.BIN_ID; const KEY = process.env.JSONBIN_API_KEY;
  const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, { method:'PUT', headers: { 'Content-Type':'application/json', 'X-Master-Key': KEY }, body: JSON.stringify(data) });
  if(!r.ok) throw new Error('JSONBin PUT failed: '+r.status);
  const j = await r.json();
  return j && j.record ? j.record : j;
}

module.exports = async function handler(req, res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
    if(req.method==='GET'){
      const data = await jsonbinGet();
      if(!data.customers) data.customers = [];
      return res.status(200).send(JSON.stringify(data));
    }

    if(req.method==='PUT'){
      const auth = req.headers['authorization']||'';
      const token = auth.startsWith('Bearer ')? auth.slice(7): '';
      const secret = process.env.JWT_SECRET||'';
      const payload = verifyJWT(token, secret);
      if(!payload || payload.sub!=='admin') return res.status(401).send(JSON.stringify({error:'unauthorized'}));

      const data = req.body && typeof req.body==='object' ? req.body : JSON.parse(req.body||'{}');
      if(!data || !Array.isArray(data.customers)) return res.status(400).send(JSON.stringify({error:'bad_payload'}));
      data.updatedAt = new Date().toISOString();
      await jsonbinPut(data);
      return res.status(200).send(JSON.stringify({ok:true, updatedAt:data.updatedAt}));
    }

    res.setHeader('Allow','GET, PUT');
    return res.status(405).send(JSON.stringify({error:'method_not_allowed'}));
  }catch(e){
    return res.status(500).send(JSON.stringify({error:String(e.message||e)}));
  }
}
