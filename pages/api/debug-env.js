// pages/api/debug-env.js
export default function debugEnv(req, res) {
  try {
    const raw = process.env.DATABASE_URL || '';
    if (!raw) {
      res.status(200).json({ ok: false });
      return;
    }
    const u = new URL(raw);
    res.status(200).json({
      ok: true,
      host: u.hostname || null,
      port: u.port || null,
      pgbouncer: u.searchParams.get('pgbouncer'),
      connection_limit: u.searchParams.get('connection_limit'),
    });
  } catch {
    res.status(200).json({ ok: false });
  }
}
