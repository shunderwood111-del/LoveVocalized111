// pages/api/me/balance.js
import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { customerId } = req.query || {};
  if (!customerId) return res.status(400).json({ error: "Missing customerId" });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    // Sum customer balance transactions (credits are negative amounts)
    const txns = await stripe.customers.listBalanceTransactions(customerId, { limit: 100 });
    const net = txns.data.reduce((sum, t) => sum + (t.amount || 0), 0); // cents
    const creditCents = Math.max(0, -net); // positive value = credit available
    const currency = txns.data[0]?.currency || "usd";

    return res.status(200).json({ creditCents, currency });
  } catch (e) {
    console.error("balance api error:", e);
    return res.status(500).json({ error: "Failed to load balance" });
  }
}
