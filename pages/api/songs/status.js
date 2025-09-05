// pages/api/songs/status.js
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // no cache (prevents 304s while polling)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("ETag", Date.now().toString());

  try {
    const { jobId } = req.body || {};
    if (!jobId) return res.status(400).json({ ok: false, error: "Missing jobId" });

    // Look up our job so we know which customer to credit
    const job = await prisma.songJob.findFirst({
      where: { OR: [{ id: jobId }, { externalJob: jobId }] },
      select: { id: true, externalJob: true, status: true, resultUrl: true, customerId: true },
    });

    // Proceed with provider status even if our DB row is missing,
    // but we can only increment entitlement if we found the job.
    const isFullUrl = typeof jobId === "string" && /^https?:\/\//i.test(jobId);
    const queryUrl = isFullUrl
      ? jobId
      : `https://api.mureka.ai/v1/song/query/${encodeURIComponent(jobId)}`;

    const r = await fetch(queryUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.MUREKA_API_KEY}` },
      cache: "no-store",
    });

    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        error: data?.detail || data?.error || "Mureka status failed",
        data,
      });
    }

    const status = data?.status || data?.state || data?.job_status || "unknown";

    // ----- find a playable URL (robust) -----
    const pickFromFiles = (files) => {
      if (!Array.isArray(files)) return null;
      for (const f of files) {
        if (typeof f?.url === "string") return f.url;
        if (typeof f?.download_url === "string") return f.download_url;
        if (typeof f?.signed_url === "string") return f.signed_url;
        if (typeof f?.file_url === "string") return f.file_url;
      }
      return null;
    };
    const findUrlDeep = (root) => {
      const seen = new Set();
      const stack = [root];
      const looksLikeUrl = (s) => /^https?:\/\/[^\s"'<>]+$/i.test(s);
      const isAudioish = (k, v) =>
        /audio|file|download|signed/i.test(k) ||
        (typeof v === "string" && /\.(mp3|m4a|wav|aac|flac)(\?|#|$)/i.test(v));
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (seen.has(node)) continue;
        seen.add(node);
        for (const [k, v] of Object.entries(node)) {
          if (typeof v === "string" && looksLikeUrl(v) && isAudioish(k, v)) return v;
          if (v && typeof v === "object") stack.push(v);
        }
      }
      return null;
    };
    const resultUrl =
      data?.result?.audio_url ||
      data?.audio_url ||
      data?.result?.url ||
      data?.url ||
      data?.download_url ||
      data?.file_url ||
      data?.data?.url ||
      data?.data?.download_url ||
      data?.output?.url ||
      data?.audio?.url ||
      data?.result?.audio?.url ||
      pickFromFiles(data?.files) ||
      pickFromFiles(data?.result?.files) ||
      findUrlDeep(data) ||
      null;

    // ----- update DB + increment entitlement exactly once on success -----
    if (status === "succeeded" && resultUrl && job?.id && job?.customerId) {
      // Only increment if this job wasn't already succeeded
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.songJob.findUnique({ where: { id: job.id } });
        if (current?.status !== "succeeded") {
          await tx.songJob.update({
            where: { id: job.id },
            data: { status: "succeeded", resultUrl },
          });
          await tx.customerEntitlement.update({
            where: { customerId: job.customerId },
            data: { songsUsed: { increment: 1 } },
          });
          return { status: "succeeded", resultUrl };
        } else {
          // ensure we keep the URL if it was missing
          if (!current.resultUrl && resultUrl) {
            await tx.songJob.update({
              where: { id: job.id },
              data: { resultUrl },
            });
          }
          return { status: "succeeded", resultUrl: current.resultUrl || resultUrl };
        }
      });

      return res.status(200).json({ ok: true, job: updated, data });
    }

    // Non-terminal → just sync status (no entitlement increment)
    if (job?.id && status && !["succeeded", "failed", "error"].includes(job.status)) {
      if (status !== job.status) {
        await prisma.songJob.update({
          where: { id: job.id },
          data: { status: String(status) },
        });
      }
    }

    // If provider said succeeded but no URL yet, keep the client polling
    const normalizedStatus = status === "succeeded" && !resultUrl ? "running" : status;

    return res.status(200).json({
      ok: true,
      job: { status: normalizedStatus, resultUrl },
      data,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
