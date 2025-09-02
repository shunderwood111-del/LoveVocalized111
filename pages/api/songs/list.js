export const config = { runtime: "nodejs" };
import prisma from "../../../lib/prisma.js";

/**
 * Lists the caller's SongJob rows (most recent first).
 * Auth: pass Stripe customer id in header `x-customer-id` (temporary scheme).
 */
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const customerId = req.headers["x-customer-id"];
    if (!customerId) return res.status(400).json({ error: "Missing x-customer-id" });

    const rows = await prisma.songJob.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        storageKey: true,
        resultUrl: true,   // legacy
        mime: true,
        durationSec: true,
        prompt: true,
        createdAt: true,
      },
      take: 50,
    });

    res.status(200).json({ ok: true, items: rows });
  } catch (e) {
    console.error("songs/list error:", e);
    res.status(500).json({ error: e.message || "Internal error" });
  }
}
