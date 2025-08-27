// pages/api/portal.js
import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const origin = req.headers.origin || "http://localhost:3000";

    // Prefer explicit customerId from the client
    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ error: "Missing customerId" });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/generate?customerId=${encodeURIComponent(customerId)}`,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("portal error", e);
    res.status(500).json({ error: e.message || "Failed to create portal session" });
  }
}
