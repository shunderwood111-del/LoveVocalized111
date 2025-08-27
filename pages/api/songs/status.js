// pages/api/songs/status.js
import prisma from "../../../lib/prisma";

const SUCCESS_STATES = new Set(["succeeded", "success", "completed", "done"]);
const FAILURE_STATES = new Set(["failed", "error", "cancelled", "canceled"]);

// Try a bunch of shapes seen in providers; include Mureka's choices[ ] shape.
function pickResultUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  // common top-level fields
  if (obj.audio_url) return obj.audio_url;
  if (obj.result_url) return obj.result_url;
  if (obj.url) return obj.url;

  // nested result object
  if (obj.result) {
    const r = pickResultUrl(obj.result);
    if (r) return r;
  }

  // Mureka often returns an array: choices: [{ audio_url, url, ... }]
  if (Array.isArray(obj.choices) && obj.choices.length > 0) {
    for (const ch of obj.choices) {
      const r = pickResultUrl(ch);
      if (r) return r;
    }
  }

  // sometimes wrapped in data
  if (Array.isArray(obj.data) && obj.data.length > 0) {
    for (const it of obj.data) {
      const r = pickResultUrl(it);
      if (r) return r;
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");

  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ error: "Missing jobId" });

  try {
    // 1) Load local job
    const job = await prisma.songJob.findUnique({ where: { externalJob: jobId.toString() } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    // 2) Query Mureka
    const base = process.env.MUREKA_API_URL || "https://api.mureka.ai";
    const key = process.env.MUREKA_API_KEY;
    if (!key) return res.status(500).json({ error: "Mureka not configured" });

    const resp = await fetch(`${base}/v1/song/query/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "Mureka status failed", detail: text });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Bad JSON from Mureka", raw: text });
    }

    const remoteStatus = (data?.status || "").toString().toLowerCase();
    const resultUrl = pickResultUrl(data);

    // 3) Update local job with latest info
    let updated = await prisma.songJob.update({
      where: { externalJob: jobId.toString() },
      data: {
        status: remoteStatus || job.status,
        ...(resultUrl ? { resultUrl } : {}),
      },
    });

    // 4) On success, decrement entitlement exactly once
    let nowConsumed = updated.consumed;
    if (SUCCESS_STATES.has(remoteStatus) && !updated.consumed) {
      const ent = await prisma.customerEntitlement.findUnique({
        where: { customerId: updated.customerId },
      });
      if (ent) {
        if (ent.songsPerYear >= 0) {
          const remaining = Math.max(0, ent.songsPerYear - (ent.songsUsed ?? 0));
          if (remaining > 0) {
            await prisma.customerEntitlement.update({
              where: { customerId: updated.customerId },
              data: { songsUsed: { increment: 1 } },
            });
          }
        }
        updated = await prisma.songJob.update({
          where: { externalJob: jobId.toString() },
          data: { consumed: true },
        });
        nowConsumed = true; // reflect in response
      }
    }

    // 5) Build response
    const payload = {
      jobId,
      status: remoteStatus || updated.status,
      consumed: nowConsumed,
      resultUrl: resultUrl || updated.resultUrl || null,
      raw: data,
    };

    return res.status(200).json(payload);
  } catch (e) {
    console.error("songs/status error", e);
    return res.status(500).json({ error: "Server error" });
  }
}
import { consumeIfNeeded } from "../../../lib/consumeOnSuccess.js";

// ...inside your handler, after you computed `status`, `customerId`, and you know `status === "succeeded"`:
try {
  await consumeIfNeeded({ customerId, externalJob: jobId }); // jobId is the one the client polls with
} catch (e) {
  console.error("consumeIfNeeded failed:", e);
}
