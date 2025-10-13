export default function handler(req, res) {
  const base = process.env.JSONBIN_BASE || "";
  const bin  = process.env.JSONBIN_BIN_ID || "";
  const has  = !!(process.env.JSONBIN_MASTER_KEY && process.env.JSONBIN_MASTER_KEY.length > 5);
  res.status(200).json({
    env: {
      JSONBIN_BASE: !!base ? base : false,
      JSONBIN_BIN_ID: bin ? `${bin.length} chars` : false,
      JSONBIN_MASTER_KEY: has,
      ADMIN_USER: !!process.env.ADMIN_USER,
      ADMIN_PASS: !!process.env.ADMIN_PASS
    },
    note: "Kalau ada yang false, isi ENV di Vercel (Production & Preview) lalu Redeploy."
  });
}
