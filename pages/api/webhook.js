// pages/api/webhook.js

import Stripe from "stripe";

export const config = {
  api: { bodyParser: false }, // required for Stripe signature verification
};

// Read raw body for signature verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(Buffer.from(data)));
    req.on("error", reject);
  });
}

// helper: grab primary price id from a subscription
function extractPriceIdFromSub(sub) {
  const item = sub?.items?.data?.[0];
  return item?.price?.id || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  // ✅ Defer importing local modules until request-time
  //    (Prevents build-time evaluation of their top-level code)
  const [{ default: prisma }, { getEntitlementFromPriceId }] = await Promise.all([
    import("../../lib/prisma.js"),
    import("../../lib/entitlements.js"),
  ]);

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });
  const sig = req.headers["stripe-signature"];
  let evt;

  try {
    const rawBody = await getRawBody(req);
    evt = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (evt.type) {
      // Initial checkout -> create entitlement
      case "checkout.session.completed": {
        const session = evt.data.object;
        const customerId = session.customer; // cus_...

        // Expand to get line_items.price reliably
        const s = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items.data.price", "subscription"],
        });

        const priceId = s?.line_items?.data?.[0]?.price?.id || null;
        let renewsAt = null;
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription);
          if (sub?.current_period_end)
            renewsAt = new Date(sub.current_period_end * 1000);
        }

        const ent = priceId ? getEntitlementFromPriceId(priceId) : null;

        console.log("✅ checkout.session.completed", {
          customerId,
          priceId,
          plan: ent?.name || null,
          renewsAt,
        });

        if (!customerId || !priceId || !ent) break;

        await prisma.customerEntitlement.upsert({
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

        console.log("💾 Saved entitlement to DB");
        break;
      }

      // NEW: first subscription created (e.g., via Upgrade link when no sub existed)
      case "customer.subscription.created": {
        const subFull = await stripe.subscriptions.retrieve(
          evt.data.object.id,
          { expand: ["items.data.price"] }
        );
        const customerId = subFull.customer; // cus_...
        const priceId = extractPriceIdFromSub(subFull);
        const ent = priceId ? getEntitlementFromPriceId(priceId) : null;
        const renewsAt = subFull?.current_period_end
          ? new Date(subFull.current_period_end * 1000)
          : null;

        console.log("✨ customer.subscription.created", {
          customerId,
          priceId,
          plan: ent?.name || null,
        });

        if (!customerId || !priceId || !ent) break;

        await prisma.customerEntitlement.upsert({
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

        console.log("💾 Entitlement created from subscription.created");
        break;
      }

      // Plan change in the Billing Portal (upgrade/downgrade)
      case "customer.subscription.updated": {
        const subObj = evt.data.object;
        const subFull =
          subObj?.items?.data?.[0]?.price?.id
            ? subObj
            : await stripe.subscriptions.retrieve(subObj.id, {
                expand: ["items.data.price"],
              });

        const customerId = subFull.customer; // cus_...
        const priceId = extractPriceIdFromSub(subFull);
        const ent = priceId ? getEntitlementFromPriceId(priceId) : null;
        const renewsAt = subFull?.current_period_end
          ? new Date(subFull.current_period_end * 1000)
          : null;

        if (!customerId || !priceId || !ent) {
          console.log("⚠️ Missing fields for subscription.updated", {
            customerId,
            priceId,
            ent: !!ent,
          });
          break;
        }

        await prisma.customerEntitlement.upsert({
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

        console.log("🔄 Entitlement updated from subscription change", {
          customerId,
          priceId,
          plan: ent.name,
        });
        break;
      }

      // Handle cancellations so your UI can react
      case "customer.subscription.deleted": {
        const sub = evt.data.object;
        const customerId = sub.customer;
        await prisma.customerEntitlement.updateMany({
          where: { customerId },
          data: { renewsAt: null },
        });
        console.log("🛑 Subscription canceled for", customerId);
        break;
      }

      default: {
        // console.log("Unhandled event:", evt.type);
      }
    }

    res.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
