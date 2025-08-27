// pages/api/mureka/lyrics.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const base = process.env.MUREKA_API_URL || "https://api.mureka.ai";
    const key  = process.env.MUREKA_API_KEY;

    // ---- STUB MODE SWITCHES ----
    const isStub =
      process.env.MUREKA_STUB === "1" ||
      req.query?.stub === "1" ||
      req.headers["x-stub"] === "1" ||
      !key; // if no key, auto-stub so you can test end-to-end

    const { prompt = "", genre, mood, language } = req.body || {};
    const trimmed = (typeof prompt === "string" ? prompt : "").trim();
    if (!trimmed) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    // ---- RETURN A STUB (no external calls) ----
    if (isStub) {
      return res.status(200).json({
        title: "Stubbed Lyrics",
        lyrics: `🎵 (Stub)
Genre: ${genre || "pop"} | Mood: ${mood || "romantic"} | Lang: ${language || "english"}

${trimmed}

Verse 1:
Neon nights on the boulevard, Vegas in our eyes,
We chase a little starlight under desert skies…

Chorus:
Hold me in the glow where the city never sleeps,
Your heartbeat is the rhythm that my melody keeps…`,
        raw: {
          id: "stub-123",
          meta: { genre: genre || "pop", mood: mood || "romantic", language: language || "english" }
        }
      });
    }

    // ---- REAL CALL TO MUREKA ----
    const r = await fetch(`${base}/v1/lyrics/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: trimmed,
        // include extras only if your account supports them
        ...(genre ? { genre } : {}),
        ...(mood ? { mood } : {}),
        ...(language ? { language } : {}),
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: "Mureka lyrics failed", detail: text });
    }

    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ error: "Bad JSON", raw: text }); }

    // Normalize to your current output shape
    return res.status(200).json({
      title: data.title || "",
      lyrics: data.lyrics || data.text || data?.result?.lyrics || data?.data?.text || "",
      raw: data,
    });
  } catch (e) {
    console.error("lyrics/generate error", e);
    return res.status(500).json({ error: "Server error" });
  }
}
