// pages/api/songs/status.js
import prisma from "../../../lib/prisma.js";
import { persistSong } from "../../../lib/persistSong.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Accept jobId from query (GET) or body (POST). Also allow "id" or "externalJob".
  const jobId =
    (req.method === "GET"
      ? req.query.jobId || req.query.id || req.query.externalJob
      : req.body?.jobId || req.body?.id || req.body?.externalJob) || null;

  if (!jobId) {
    return res.status(400).json({ error: "Missing jobId (or id / externalJob)" });
  }

  try {
    // Try by internal id first, then by externalJob
    let job = await prisma.songJob.findUnique({ where: { id: String(jobId) } });
    if (!job) {
      job = await prisma.songJob.findUnique({ where: { externalJob: String(jobId) } });
    }
    if (!job) return res.status(404).json({ error: "Job not found" });

    // If finished but not yet persisted, persist to storage now
    if (job.status === "succeeded" && !job.storageKey && job.resultUrl) {
      try {
        await persistSong({
          jobId: job.id,
          tempUrl: job.resultUrl,
          customerId: job.customerId,
          mime: job.mime || "audio/mpeg",
        });
        // reload with updated fields
        job = await prisma.songJob.findUnique({ where: { id: job.id } });
      } catch (e) {
        console.error("persistSong failed:", e);
        // Don’t fail the status call—just return current info
      }
    }

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
    console.error("status error:", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
