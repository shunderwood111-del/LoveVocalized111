export const config = { runtime: "nodejs" };
import prisma from "../../../lib/prisma.js";
import supabaseAdmin from "../../../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // Replace with your real auth (cookie/session); this is just a placeholder
    const customerId = req.headers["x-customer-id"];
    const { songId } = req.body || {};
    if (!customerId || !songId) return res.status(400).json({ error: "Missing" });

    const job = await prisma.songJob.findUnique({ where: { id: songId } });
    if (!job || job.customerId !== customerId || !job.storageKey) {
      return res.status(404).json({ error: "Not found" });
    }

    const { data, error } = await supabaseAdmin
      .storage
      .from("song-files")
      .createSignedUrl(job.storageKey, 900); // 15 minutes
    if (error) return res.status(500).json({ error: "URL generation failed" });

    return res.status(200).json({ ok: true, url: data.signedUrl, mime: job.mime || "audio/mpeg" });
  } catch (err) {
    console.error("songs/url error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
