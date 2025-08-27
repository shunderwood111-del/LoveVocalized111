// pages/api/me/entitlement.js
import prisma from "../../../lib/prisma"; // uses the Prisma singleton (see lib/prisma.js below)

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { customerId } = req.query || {};
    if (!customerId) {
      return res.status(400).json({ error: "Missing customerId" });
    }

    // Support full ID (cus_***) and fallback by suffix (sometimes you pass a trimmed id)
    const row = customerId.startsWith("cus_")
      ? await prisma.customerEntitlement.findUnique({ where: { customerId } })
      : await prisma.customerEntitlement.findFirst({
          where: { customerId: { endsWith: customerId } },
          orderBy: { createdAt: "desc" },
        });

    // Normalize response: never 404; return entitled=false when not found
    if (!row) {
      return res.status(200).json({
        ok: true,
        entitled: false,
        customerId,
        reason: "no_entitlement_record",
      });
    }

    const songsUsed = row.songsUsed ?? 0;
    const unlimited =
      typeof row.songsPerYear === "number" && row.songsPerYear < 0; // convention: <0 = unlimited
    const songsRemaining = unlimited
      ? -1
      : Math.max(0, (row.songsPerYear ?? 0) - songsUsed);

    // Simple entitlement rule: entitled if unlimited or has remaining songs
    const entitled = unlimited || songsRemaining > 0;

    return res.status(200).json({
      ok: true,
      entitled,
      customerId: row.customerId,
      plan: {
        priceId: row.priceId,
        name: row.planName,
        songsPerYear: row.songsPerYear,
        revisionsPerSong: row.revisionsPerSong,
        commercial: row.commercial,
        renewsAt: row.renewsAt,
        songsUsed,
        songsRemaining, // -1 means unlimited
      },
    });
  } catch (e) {
    console.error("Entitlement API error:", e);
    return res.status(500).json({ error: "Entitlement lookup failed" });
  }
}
