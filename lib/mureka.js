// lib/mureka.js
// Generic helper to talk to your Mureka-like API and normalize responses.

function getCfg() {
  const base = process.env.MUREKA_API_URL || "https://api.mureka.ai";
  const key = process.env.MUREKA_API_KEY;
  if (!key) throw new Error("Missing MUREKA_API_KEY");
  return { base, key };
}

async function tryFetch(url, key, method = "GET") {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep text for diagnostics */ }
  return { ok: r.ok, status: r.status, json, text };
}

// Normalize a variety of possible shapes into { status, url, durationSec, mime }
function normalize(result) {
  const j = result?.json || {};

  const status =
    j.status || j.data?.status || j.job?.status || j.state || j.phase || "unknown";

  const url =
    j.resultUrl || j.result_url || j.url ||
    j.output?.url || j.audio_url || j.data?.result_url || null;

  const durationSec =
    j.duration || j.durationSec || j.output?.durationSec || j.data?.duration || null;

  const mime =
    j.mime || j.contentType || j.output?.mime || "audio/mpeg";

  return { status: String(status), url, durationSec: durationSec ?? null, mime };
}

/**
 * Fetch job status from the provider. Tries a few common endpoints:
 * - /v1/song/status?id=:id
 * - /v1/song/jobs/:id
 * - /v1/jobs/:id
 */
export async function fetchJobStatus(externalJob) {
  const { base, key } = getCfg();

  // 1) ?id= pattern
  let r = await tryFetch(`${base}/v1/song/status?id=${encodeURIComponent(externalJob)}`, key);
  if (r.ok) return normalize(r);

  // 2) /song/jobs/:id pattern
  r = await tryFetch(`${base}/v1/song/jobs/${encodeURIComponent(externalJob)}`, key);
  if (r.ok) return normalize(r);

  // 3) /jobs/:id generic
  r = await tryFetch(`${base}/v1/jobs/${encodeURIComponent(externalJob)}`, key);
  if (r.ok) return normalize(r);

  // Last resort—return whatever we got from the first attempt for diagnostics
  return normalize(r);
}
