export const config = { runtime: "nodejs" };
import prisma from "../../../lib/prisma.js";
import { persistSong } from "../../../lib/persistSong.js";

// Redact obvious secrets in logs
function safe(obj) {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      if (typeof v === "string" && /token|secret|key|authorization/i.test(k)) return "[redacted]";
      return v;
    })
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // 👀 See payload shape in logs, then map fields below
    console.log("song-complete webhook payload:", safe(req.body));

    // TODO: map these to your provider’s actual fields after you see the log above
    const {
      externalJob,   // e.g. req.body.job?.id
      tempResultUrl, // e.g. req.body.output?.url (temporary mp3)
      mime,          // e.g. req.body.output?.mime || "audio/mpeg"
      durationSec,   // e.g. req.body.meta?.duration
      prompt,        // optional
    } = req.body ?? {};

    if (!externalJob || !tempResultUrl) {
      return res.status(400).json({ error: "Missing externalJob or tempResultUrl" });
    }

    const job = await prisma.songJob.findUnique({ where: { externalJob } });
    if (!job) return res.status(404).json({ error: "Job not found" });

    const key = await persistSong({
      jobId: job.id,
      tempUrl: tempResultUrl,
      customerId: job.customerId,
      mime: mime || "audio/mpeg",
    });

    await prisma.songJob.update({
      where: { id: job.id },
      data: {
        durationSec: durationSec ?? job.durationSec,
        prompt: prompt ?? job.prompt,
        resultUrl: null, // legacy
      },
    });

    return res.status(200).json({ ok: true, storageKey: key });
  } catch (err) {
    console.error("song-complete error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
