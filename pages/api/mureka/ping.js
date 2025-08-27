// pages/api/mureka/ping.js
export default async function handler(req, res) {
  try {
    const base = process.env.MUREKA_API_URL;
    const key  = process.env.MUREKA_API_KEY;
    if (!base || !key) return res.status(500).json({ ok: false, error: "Missing MUREKA env" });

    // Use the official "generate lyrics" endpoint as a cheap auth test.
    const r = await fetch(`${base}/v1/lyrics/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "Love Vocalized health check" }),
    });

    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: text });

    let json;
    try { json = JSON.parse(text); } catch { return res.status(502).json({ ok: false, error: "Bad JSON", raw: text }); }

    // Expected shape: { title, lyrics }
    return res.status(200).json({ ok: true, sample: json });
  } catch (e) {
    console.error("mureka ping error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
