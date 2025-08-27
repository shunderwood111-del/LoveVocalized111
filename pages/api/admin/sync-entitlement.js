// pages/api/admin/sync-entitlement.js
import Stripe from "stripe";
import prisma from "../../../lib/prisma";
import { getEntitlementFromPriceId } from "../../../lib/entitlements";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // simple dev auth
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ error: "Missing customerId" });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    // Get the latest active subscription for the customer
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
    const sub = subs.data?.[0];
    if (!sub) return res.status(404).json({ error: "No subscription found for customer" });

    const item = sub.items?.data?.[0];
    const priceId = item?.price?.id;
    const ent = priceId ? getEntitlementFromPriceId(priceId) : null;
    if (!priceId || !ent) return res.status(400).json({ error: "No mappable price on subscription" });

    const renewsAt = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;

    const updated = await prisma.customerEntitlement.upsert({
      where: { customerId },
      create: {
        customerId,
        priceId,
        planName: ent.name,
        songsPerYear: ent.songsPerYear,
        revisionsPerSong: ent.revisionsPerSong,
        commercial: !!ent.commercial,
        renewsAt,
      },
      update: {
        priceId,
        planName: ent.name,
        songsPerYear: ent.songsPerYear,
        revisionsPerSong: ent.revisionsPerSong,
        commercial: !!ent.commercial,
        renewsAt,
      },
    });

    res.status(200).json(updated);
  } catch (e) {
    console.error("sync entitlement error", e);
    res.status(500).json({ error: e.message || "Sync failed" });
  }
}
