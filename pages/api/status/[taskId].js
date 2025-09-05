// pages/api/status/[taskId].js
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  // 🔒 absolutely no caching for polling
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  // (optional) ensure no 304 due to stale ETag comparisons
  res.setHeader("ETag", Date.now().toString());

  const { taskId } = req.query;

  try {
    const r = await fetch(`https://api.mureka.ai/v1/song/query/${taskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.MUREKA_API_KEY}` },
      cache: "no-store",
    });

    // If the upstream 404s (wrong path/id), surface that status to the client
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res
      .status(r.ok ? 200 : r.status)
      .json({ ok: r.ok, status: r.status, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
