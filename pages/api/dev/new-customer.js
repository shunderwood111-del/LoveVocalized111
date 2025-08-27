// pages/api/dev/new-customer.js
import prisma from "../../../lib/prisma";

function randCus() {
  return "cus_test_" + Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  // Simple guard so this can’t be called by anyone in prod accidentally
  const ok = process.env.DEV_UTIL_KEY && req.query.key === process.env.DEV_UTIL_KEY;
  if (!ok) return res.status(401).json({ error: "Unauthorized (missing/invalid key)" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const customerId = randCus();

    const rec = await prisma.customerEntitlement.create({
      data: {
        customerId,
        priceId: "price_unlimited_test",
        planName: "Unlimited Test",
        songsPerYear: -1,          // unlimited
        revisionsPerSong: -1,      // unlimited
        commercial: true,
        renewsAt: null,
        songsUsed: 0,
      },
    });

    return res.status(200).json({
      ok: true,
      customerId: rec.customerId,
      planName: rec.planName,
      songsPerYear: rec.songsPerYear,
      revisionsPerSong: rec.revisionsPerSong,
      commercial: rec.commercial,
    });
  } catch (e) {
    console.error("new-customer error", e);
    return res.status(500).json({ error: "Failed to create test customer" });
  }
}
