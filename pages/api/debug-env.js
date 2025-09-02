export default function handler(req, res) {
  res.status(200).json({
    hasPublishable: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    hasSecret: !!process.env.STRIPE_SECRET_KEY,
    hasWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
    nodeEnv: process.env.NODE_ENV || null,
  });
}
// pages/api/debug-env.js
export default function handler(req, res) {
  const raw = process.env.DATABASE_URL || '';
  try {
    const u = new URL(raw);
    return res.json({
      ok: true,
      host: u.hostname,
      port: u.port,
      pgbouncer: u.searchParams.get('pgbouncer'),
      connection_limit: u.searchParams.get('connection_limit'),
    });
  } catch {
    return res.json({ ok: false });
  }
}
