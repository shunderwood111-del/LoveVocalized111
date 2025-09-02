export const config = { runtime: "nodejs" };
import prisma from "../../../lib/prisma.js";
import { persistSong } from "../../../lib/persistSong.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { jobId } = req.body || {};
    if (!jobId) return res.status(400).json({ error: "Missing jobId" });

    const job = await prisma.songJob.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    // EDIT THIS to your provider’s status endpoint + auth
    const resp = await fetch(`${process.env.MUREKA_API_URL}/v1/jobs/${job.externalJob}`, {
      headers: { Authorization: `Bearer ${process.env.MUREKA_API_KEY}` },
    });
    const payload = await resp.json();

    // 👀 Log the provider payload so you can map exact fields
    console.log("songs/status provider payload:", payload);

    // Map fields (adjust after you see logs above)
    const providerStatus = payload?.status;                 // e.g. "succeeded"
    const tempResultUrl  = payload?.output?.url;            // temporary audio file
    const mime           = payload?.output?.mime || "audio/mpeg";
    const durationSec    = payload?.meta?.duration;

    if (providerStatus === "succeeded") {
      if (job.storageKey) {
        return res.status(200).json({ ok: true, status: "succeeded", storageKey: job.storageKey });
      }
      if (!tempResultUrl) {
        return res.status(500).json({ error: "Provider succeeded but no tempResultUrl" });
      }

      const key = await persistSong({
        jobId: job.id,
        tempUrl: tempResultUrl,
        customerId: job.customerId,
        mime,
      });

      await prisma.songJob.update({
        where: { id: job.id },
        data: { durationSec, resultUrl: null },
      });

      return res.status(200).json({ ok: true, status: "succeeded", storageKey: key });
    }

    if (providerStatus === "failed") {
      await prisma.songJob.update({ where: { id: job.id }, data: { status: "failed" } });
      return res.status(200).json({ ok: true, status: "failed" });
    }

    return res.status(200).json({ ok: true, status: providerStatus || "pending" });
  } catch (e) {
    console.error("songs/status error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}
