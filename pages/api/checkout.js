// pages/api/checkout.js
import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ error: "STRIPE_SECRET_KEY is missing" });
    }
    const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

    const {
      priceId = process.env.STRIPE_PRICE_ID, // can override from client
      quantity = 1,
      metadata = {},
      mode, // optional: "payment" | "subscription"
    } = req.body || {};

    if (!priceId) {
      return res
        .status(400)
        .json({ error: "Missing priceId (or STRIPE_PRICE_ID env)" });
    }

    // Inspect price to infer mode if not provided
    const price = await stripe.prices.retrieve(priceId);
    const isRecurring = !!price.recurring;
    const inferredMode = isRecurring ? "subscription" : "payment";

    if (mode && mode !== "payment" && mode !== "subscription") {
      return res.status(400).json({ error: "mode must be 'payment' or 'subscription'" });
    }
    if (mode === "payment" && isRecurring) {
      return res.status(400).json({
        error: "You passed a recurring price with mode 'payment'. Use mode 'subscription' or a one-time price.",
      });
    }
    if (mode === "subscription" && !isRecurring) {
      return res.status(400).json({
        error: "You passed a one-time price with mode 'subscription'. Use mode 'payment' or a recurring price.",
      });
    }

    const sessionMode = mode || inferredMode;

    // Base URL for redirects (works locally & on Vercel)
    const inferredOrigin =
      (req.headers["x-forwarded-proto"] ? `${req.headers["x-forwarded-proto"]}://` : "http://") +
      req.headers.host;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || inferredOrigin;

    const session = await stripe.checkout.sessions.create({
      mode: sessionMode,
      line_items: [{ price: priceId, quantity }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancelled`,
      metadata,
    });

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (e) {
    const msg = e?.raw?.message || e?.message || "Server error creating checkout session";
    console.error("Checkout error:", e);
    return res.status(500).json({ error: msg });
  }
}
