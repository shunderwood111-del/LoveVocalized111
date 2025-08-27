// pages/api/me/consume-song.js
import prisma from "../../../lib/prisma";

// Keep Next's JSON body parser on, but be tolerant of odd payloads
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  // ---- tolerant body parsing ----
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  } else if (body == null || typeof body !== "object") {
    // Some clients send as text/plain; try reading raw text from the stream (rare)
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const { customerId } = body || {};
  if (!customerId || typeof customerId !== "string") {
    return res.status(400).json({ error: "Missing customerId" });
  }

  // ---- fetch entitlement ----
  const ent = await prisma.customerEntitlement.findUnique({ where: { customerId } });
  if (!ent) return res.status(404).json({ error: "Not found" });

  // Unlimited: do not decrement, just report
  if (ent.songsPerYear < 0) {
    return res.status(200).json({
      ok: true,
      planName: ent.planName,
      songsPerYear: ent.songsPerYear,
      songsUsed: ent.songsUsed,
      songsRemaining: -1,
    });
  }

  const remaining = Math.max(0, ent.songsPerYear - (ent.songsUsed ?? 0));
  if (remaining <= 0) {
    return res.status(402).json({ error: "No songs remaining" });
  }

  const updated = await prisma.customerEntitlement.update({
    where: { customerId },
    data: { songsUsed: { increment: 1 } },
  });

  const songsRemaining = Math.max(0, updated.songsPerYear - updated.songsUsed);

  return res.status(200).json({
    ok: true,
    planName: updated.planName,
    songsPerYear: updated.songsPerYear,
    songsUsed: updated.songsUsed,
    songsRemaining,
  });
}
