// export const config = { runtime: 'nodejs18.x' }; // HAPUS / GANTI

export default async function handler(req, res) {
  try {
    const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
    const urlGet = `${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}/latest`;
    const urlPut = `${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}`;

    const g = await fetch(urlGet, { headers: { 'X-Master-Key': JSONBIN_MASTER_KEY } });
    const gText = await g.text();
    const gJson = (()=>{ try{return JSON.parse(gText);}catch{return {raw:gText}} })();
    if (!g.ok) return res.status(g.status).json({ step: 'GET', detail: gJson });

    const record = gJson?.record && typeof gJson.record === 'object' ? gJson.record : { nasabah: [] };

    const p = await fetch(urlPut, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_MASTER_KEY },
      body: JSON.stringify(record)
    });
    const pText = await p.text();
    const pJson = (()=>{ try{return JSON.parse(pText);}catch{return {raw:pText}} })();

    return res.status(p.ok ? 200 : p.status).json({ step: 'PUT', ok: p.ok, detail: pJson });
  } catch (e) {
    return res.status(500).json({ step: 'THROW', message: e?.message, name: e?.name });
  }
}
