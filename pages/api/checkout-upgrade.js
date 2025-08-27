// pages/api/checkout-upgrade.js
import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const { priceId, customerId } = req.body || {};

    if (!priceId || !customerId) {
      return res.status(400).json({ error: "Missing priceId or customerId" });
    }

    const inferredOrigin =
      (req.headers["x-forwarded-proto"] ? `${req.headers["x-forwarded-proto"]}://` : "http://") +
      req.headers.host;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || inferredOrigin;

    // --- 1) ALWAYS add credit from the latest one-time purchase BEFORE upgrading ---
    await ensureCustomerBalanceCredit(stripe, customerId);

    // --- 2) If customer already has a subscription, send to Portal (proration applies, with credit present) ---
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price"],
    });
    const activeSub = subs.data.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));

    if (activeSub) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/generate?customerId=${encodeURIComponent(customerId)}`,
      });
      return res.status(200).json({ url: portal.url });
    }

    // --- 3) Otherwise, start a new subscription checkout (credit will reduce first invoice) ---
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?customerId=${encodeURIComponent(customerId)}`,
    });

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (e) {
    console.error("checkout-upgrade error:", e);
    return res.status(500).json({ error: e?.message || "Failed to start upgrade checkout" });
  }
}

/**
 * Finds the most recent successful one-time payment for the customer (no invoice),
 * and creates an idempotent customer balance credit for the full amount.
 */
async function ensureCustomerBalanceCredit(stripe, customerId) {
  // Prefer PaymentIntents (covers Checkout one-time payments)
  const piList = await stripe.paymentIntents.list({ customer: customerId, limit: 20 });

  // Pick most recent "succeeded" PI that is NOT tied to an invoice (i.e., not a subscription)
  let successfulOneTime =
    piList.data
      .filter((pi) => pi.status === "succeeded" && !pi.invoice)
      .sort((a, b) => b.created - a.created)[0] || null;

  // Fallback: search charges directly if no PI found
  if (!successfulOneTime) {
    const charges = await stripe.charges.list({ customer: customerId, limit: 20 });
    const charge = charges.data
      .filter((c) => c.paid && c.status === "succeeded" && !c.invoice)
      .sort((a, b) => b.created - a.created)[0];

    if (charge) {
      // Synthesize a PI-like object
      successfulOneTime = {
        id: charge.payment_intent || `charge_${charge.id}`,
        amount_received: charge.amount,
        currency: charge.currency,
      };
    }
  }

  if (!successfulOneTime) {
    // No prior one-time purchase found; nothing to credit
    return;
  }

  const creditCents = successfulOneTime.amount_received || 0;
  const creditCurrency = successfulOneTime.currency || "usd";
  if (creditCents <= 0) return;

  const marker = `Upgrade credit from PI ${successfulOneTime.id}`;

  // Check if we already granted this credit
  const existing = await stripe.customers.listBalanceTransactions(customerId, { limit: 100 });
  const alreadyCredited = existing.data.some((bt) => bt.description === marker);
  if (alreadyCredited) return;

  await stripe.customers.createBalanceTransaction(customerId, {
    amount: -creditCents, // negative = credit
    currency: creditCurrency,
    description: marker,
  });
}
