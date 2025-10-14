// /api/put.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

    const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
    if (!JSONBIN_BASE || !JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY) {
      return res.status(500).json({ error: 'ENV_MISSING' });
    }

    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
    catch { body = {}; }

    // Simpan seluruh dokumen (schema: { nasabah: [...] })
    const url = `${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY,
        'Accept': 'application/json'
      },
      body: JSON.stringify({ nasabah: Array.isArray(body.nasabah) ? body.nasabah : [] })
    });

    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) return res.status(r.status).json({ error: 'JSONBIN_PUT_NON_200', detail: j });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'FETCH_THROWN', message: e?.message || String(e) });
  }
}
