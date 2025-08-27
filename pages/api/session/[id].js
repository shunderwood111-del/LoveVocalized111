import Stripe from "stripe";
import { getEntitlementFromPriceId } from "../../../lib/entitlements";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");

  try {
    const { id } = req.query;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: ["line_items.data.price", "customer"],
    });

    const item = session?.line_items?.data?.[0];
    const priceId = item?.price?.id || null;
    const entitlement = priceId ? getEntitlementFromPriceId(priceId) : null;

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || null;

    res.status(200).json({
      sessionId: session.id,
      customerId,
      priceId,
      entitlement,
    });
  } catch (e) {
    console.error("session fetch error", e);
    res.status(500).json({ error: e.message || "Failed to fetch session" });
  }
}
