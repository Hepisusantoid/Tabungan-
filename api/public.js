export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = ((req.query || {}).id || '').toString().trim();
  if (!id) return res.status(400).json({ found: false, message: 'Missing ?id=' });

  const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
  if (!JSONBIN_BASE || !JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY)
    return res.status(500).json({ error: 'ENV_MISSING' });

  try {
    const r = await fetch(`${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_MASTER_KEY, Accept: 'application/json' }
    });
    const t = await r.text(); let j;
    try { j = JSON.parse(t); } catch { j = { raw: t }; }
    if (!r.ok) return res.status(r.status).json({ found: false, message: 'Gagal mengambil data.' });

    const list = Array.isArray(j?.record?.nasabah) ? j.record.nasabah : [];
    const found = list.find(x => (x.id || '').toUpperCase() === id.toUpperCase());
    if (!found) return res.status(404).json({ found: false, message: 'Nasabah tidak ditemukan.' });

    // Hanya expose field yang diperlukan (keamanan)
    return res.status(200).json({
      found: true,
      nasabah: {
        id:      found.id,
        nama:    found.nama,
        saldo:   Number(found.saldo   || 0),
        dividen: Number(found.dividen || 0),
        history: Array.isArray(found.history) ? found.history : [],
        lots:    Array.isArray(found.lots)    ? found.lots    : []
      }
    });
  } catch (e) {
    return res.status(500).json({ found: false, message: e?.message || String(e) });
  }
}
