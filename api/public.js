export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { name } = req.query || {};
    const q = (name || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'Missing ?name=' });

    const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
    if (!JSONBIN_BASE || !JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY) {
      return res.status(500).json({ error: 'ENV_MISSING' });
    }

    const url = `${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}/latest`;
    const r = await fetch(url, { headers: { 'X-Master-Key': JSONBIN_MASTER_KEY, 'Accept': 'application/json' } });
    const raw = await r.text(); let json; try { json = JSON.parse(raw); } catch { json = { raw }; }
    if (!r.ok) return res.status(r.status).json({ error: 'JSONBIN_GET_NON_200', status: r.status, detail: json });

    const list = (json?.record?.nasabah || []).map(x => ({
      nama: x.nama,
      saldo: Number(x.saldo || 0),
      history: Array.isArray(x.history) ? x.history : [] // [{ts, type, amount, note}]
    }));
    const found = list.find(x => (x.nama || '').toLowerCase() === q.toLowerCase());
    if (!found) return res.status(404).json({ found: false, message: 'Nasabah tidak ditemukan' });

    return res.status(200).json({ found: true, nasabah: found });
  } catch (e) {
    return res.status(500).json({ error: 'FETCH_THROWN', message: e?.message || String(e) });
  }
}
