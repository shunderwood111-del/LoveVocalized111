// pages/api/admin/grant.js
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Simple dev-only guard (set ADMIN_API_KEY in .env.local)
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      customerId,
      priceId = "price_dev",
      planName = "Dev Plan",
      songsPerYear = 5,          // change to -1 for unlimited
      revisionsPerSong = 2,
      commercial = true,
      renewsAt = null,           // ISO string or null
    } = req.body || {};

    if (!customerId) return res.status(400).json({ error: "Missing customerId" });

    const data = {
      customerId,
      priceId,
      planName,
      songsPerYear,
      revisionsPerSong,
      commercial,
      renewsAt: renewsAt ? new Date(renewsAt) : null,
    };

    const ent = await prisma.customerEntitlement.upsert({
      where: { customerId },
      create: { ...data },
      update: { ...data },
    });

    return res.status(200).json(ent);
  } catch (e) {
    console.error("grant error", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
