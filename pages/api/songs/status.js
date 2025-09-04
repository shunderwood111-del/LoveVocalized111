// pages/api/songs/status.js
import prisma from "../../../lib/prisma.js";
import { persistSong } from "../../../lib/persistSong.js";
import { fetchJobStatus } from "../../../lib/mureka.js";

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("ETag", Math.random().toString(36).slice(2)); // avoid 304
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    noStore(res);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const jobId =
    (req.method === "GET"
      ? req.query.jobId || req.query.id || req.query.externalJob
      : req.body?.jobId || req.body?.id || req.body?.externalJob) || null;

  if (!jobId) {
    noStore(res);
    return res.status(400).json({ error: "Missing jobId (or id / externalJob)" });
  }

  try {
    // Find by internal id, otherwise by external job id
    let job = await prisma.songJob.findUnique({ where: { id: String(jobId) } });
    if (!job) job = await prisma.songJob.findUnique({ where: { externalJob: String(jobId) } });
    if (!job) {
      noStore(res);
      return res.status(404).json({ error: "Job not found" });
    }

    const externalId = job.externalJob || job.id;

    // If not terminal, ask provider for latest status and update DB
    if (!["succeeded", "failed"].includes(job.status)) {
      try {
        const remote = await fetchJobStatus(externalId);

        // Only update if the provider told us something we can use
        const updates = {};
        if (remote.status && remote.status !== job.status) updates.status = remote.status;
        if (remote.url && remote.url !== job.resultUrl) updates.resultUrl = remote.url;
        if (remote.durationSec != null) updates.durationSec = remote.durationSec;
        if (remote.mime) updates.mime = remote.mime;
        if (Object.keys(updates).length > 0) {
          job = await prisma.songJob.update({
            where: { id: job.id },
            data: updates,
          });
        }
      } catch (e) {
        // Don’t fail the status check just because the provider check failed
        console.error("poll provider error:", e?.message || e);
      }
    }

    // If finished but not persisted yet, persist now
    if (job.status === "succeeded" && !job.storageKey && job.resultUrl) {
      try {
        await persistSong({
          jobId: job.id,
          tempUrl: job.resultUrl,
          customerId: job.customerId,
          mime: job.mime || "audio/mpeg",
        });
        job = await prisma.songJob.findUnique({ where: { id: job.id } });
      } catch (e) {
        console.error("persistSong error:", e?.message || e);
      }
    }

    noStore(res);
    return res.status(200).json({
      ok: true,
      job: {
        id: job.id,
        externalJob: job.externalJob,
        status: job.status,
        prompt: job.prompt,
        storageKey: job.storageKey,
        resultUrl: job.resultUrl,
        durationSec: job.durationSec,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (e) {
    console.error("status handler error:", e);
    noStore(res);
    return res.status(500).json({ error: "Internal error" });
  }
}
