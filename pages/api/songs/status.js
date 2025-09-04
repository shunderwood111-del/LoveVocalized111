// pages/api/songs/status.js
import prisma from "../../../lib/prisma";
import { persistSong } from "../../../lib/persistSong";
import supabaseAdmin from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).end("Method Not Allowed");
  }

  const jobId =
    (req.method === "GET" ? req.query.jobId : req.body?.jobId)?.toString();
  if (!jobId) return res.status(400).json({ error: "Missing jobId" });

  // Find our job (we save provider id in externalJob)
  const job = await prisma.songJob.findUnique({
    where: { externalJob: jobId },
  });
  if (!job) return res.status(404).json({ error: "Unknown jobId" });

  // If we already finished, return a playable URL
  if (job.status === "succeeded") {
    let url = null;
    if (job.storageKey) {
      const { data, error } = await supabaseAdmin
        .storage
        .from("song-files")
        .createSignedUrl(job.storageKey, 900);
      if (!error) url = data.signedUrl;
    } else if (job.resultUrl) {
      url = job.resultUrl; // legacy
    }

    return res.status(200).json({
      ok: true,
      job: {
        id: job.id,
        externalJob: job.externalJob,
        status: job.status,
        storageKey: job.storageKey || null,
        resultUrl: url || null,
      },
    });
  }

  // Otherwise, ask the provider for status
  const base = process.env.MUREKA_API_URL || "https://api.mureka.ai";
  const key = process.env.MUREKA_API_KEY;
  if (!key) return res.status(500).json({ error: "Mureka not configured" });

  try {
    const path = process.env.MUREKA_STATUS_PATH || "/v1/song/status";
    const u = new URL(path, base);
    // Most providers accept ?id=JOB_ID; adjust if yours differs
    u.searchParams.set("id", jobId);

    const resp = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });

    const text = await resp.text();
    let payload = {};
    try { payload = JSON.parse(text); } catch {}

    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: "Provider status failed", detail: text });
    }

    // Try multiple common shapes for status + URL
    const providerStatus =
      payload.status ||
      payload.state ||
      payload.job_status ||
      payload.result?.status ||
      "unknown";

    // If completed: persist the audio to Supabase Storage
    if (["succeeded", "completed"].includes(providerStatus)) {
      const tempUrl =
        payload.url ||
        payload.result?.url ||
        payload.audio_url ||
        payload.resultUrl ||
        null;
      const mime =
        payload.mime || payload.contentType || "audio/mpeg";

      if (tempUrl) {
        try {
          // Upload & mark succeeded + storageKey
          await persistSong({
            jobId: job.id,
            tempUrl,
            customerId: job.customerId,
            mime,
          });

          // Return a signed URL for immediate playback
          const updated = await prisma.songJob.findUnique({
            where: { id: job.id },
          });

          let signed = null;
          if (updated.storageKey) {
            const { data, error } = await supabaseAdmin
              .storage
              .from("song-files")
              .createSignedUrl(updated.storageKey, 900);
            if (!error) signed = data.signedUrl;
          }

          return res.status(200).json({
            ok: true,
            job: {
              id: updated.id,
              externalJob: updated.externalJob,
              status: updated.status,
              storageKey: updated.storageKey,
              resultUrl: signed, // short-lived signed URL for audio
            },
          });
        } catch (e) {
          // Fallback: keep a direct resultUrl if upload failed
          await prisma.songJob.update({
            where: { id: job.id },
            data: { status: "succeeded", resultUrl: tempUrl },
          });
          return res.status(200).json({
            ok: true,
            job: {
              id: job.id,
              externalJob: job.externalJob,
              status: "succeeded",
              storageKey: null,
              resultUrl: tempUrl,
            },
          });
        }
      } else {
        // No URL in payload but says succeeded — mark it and return
        await prisma.songJob.update({
          where: { id: job.id },
          data: { status: "succeeded" },
        });
        return res.status(200).json({
          ok: true,
          job: {
            id: job.id,
            externalJob: job.externalJob,
            status: "succeeded",
            storageKey: null,
            resultUrl: null,
          },
        });
      }
    }

    // Not done yet — store intermediate status if it changed
    if (providerStatus !== job.status && providerStatus !== "unknown") {
      await prisma.songJob.update({
        where: { id: job.id },
        data: { status: providerStatus },
      });
    }

    return res.status(200).json({
      ok: true,
      job: {
        id: job.id,
        externalJob: job.externalJob,
        status: providerStatus || job.status || "unknown",
        storageKey: job.storageKey || null,
        resultUrl: job.resultUrl || null,
    }});
  } catch (e) {
    console.error("songs/status error", e);
    return res.status(500).json({ error: "Server error" });
  }
}
