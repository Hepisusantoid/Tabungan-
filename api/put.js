// export const config = { runtime: 'nodejs18.x' }; // HAPUS / GANTI

export default async function handler(req, res) {
  try {
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid body' });
    if (!Array.isArray(body.nasabah)) body.nasabah = [];

    const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
    if (!JSONBIN_BASE || !JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY) {
      return res.status(500).json({ error: 'ENV_MISSING' });
    }

    const url = `${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY,
        'X-Bin-Versioning': 'false'
      },
      body: JSON.stringify(body)
    });

    const raw = await r.text();
    let out; try { out = JSON.parse(raw); } catch { out = { raw }; }

    if (!r.ok) {
      return res.status(r.status).json({ error: 'JSONBIN_PUT_FAILED', status: r.status, detail: out });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'FETCH_THROWN', message: e?.message || String(e) });
  }
}
