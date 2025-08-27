// pages/pricing.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

// Your canonical price IDs
const PRICE_IDS = [
  { name: "One-Hit Wonder", priceId: "price_1RxfHhKhwtUF5XZpyewzUaoQ", blurb: "1 song / year" },
  { name: "Greatest Hits",  priceId: "price_1RxfInKhwtUF5XZpADVWFbIP", blurb: "Up to 5 songs / year" },
  { name: "Platinum Playlist", priceId: "price_1RxfJYKhwtUF5XZpQgxUX7fV", blurb: "Unlimited songs / year" },
];

export default function Pricing({ plans }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [credit, setCredit] = useState({ creditCents: 0, currency: "usd" });

  useEffect(() => {
    const cid = (router.query.customerId || "").toString();
    if (cid) setCustomerId(cid);
  }, [router.query.customerId]);

  useEffect(() => {
    (async () => {
      if (!customerId) return;
      try {
        const r = await fetch(`/api/me/balance?customerId=${encodeURIComponent(customerId)}`);
        const j = await r.json();
        if (r.ok) setCredit(j);
        else setCredit({ creditCents: 0, currency: "usd" });
      } catch {
        setCredit({ creditCents: 0, currency: "usd" });
      }
    })();
  }, [customerId]);

  async function startUpgrade(priceId) {
    if (!customerId) {
      alert("Missing Stripe customerId (cus_...). Open this page with ?customerId=... or paste it below.");
      return;
    }
    try {
      setBusy(priceId);
      const r = await fetch("/api/checkout-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, customerId }),
      });
      const j = await r.json();
      if (j?.url) window.location.href = j.url;
      else alert(j?.error || "Failed to start upgrade checkout");
    } finally {
      setBusy("");
    }
  }

  return (
    <main style={{ padding: 32, fontFamily: "system-ui, Arial, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Choose your plan</h1>

      <div style={{ margin: "12px 0" }}>
        <label>
          <div style={{ fontSize: 12, color: "#444" }}>Stripe Customer ID (cus_…)</div>
          <input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="cus_XXXXXXXXXXXX"
            style={{ width: "100%", maxWidth: 420, padding: 8 }}
          />
        </label>
      </div>

      {/* Credit banner */}
      {!!credit.creditCents && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <b>Good news:</b> you have{" "}
          {(credit.creditCents / 100).toLocaleString(undefined, {
            style: "currency",
            currency: (credit.currency || "usd").toUpperCase(),
          })}{" "}
          in credit. It will be automatically applied at checkout.
        </div>
      )}

      {!plans?.length && (
        <p style={{ color: "#a00" }}>
          No prices available. Ensure Stripe test prices are <b>active</b> and <code>STRIPE_SECRET_KEY</code> is set.
        </p>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {plans.map((p) => {
          const amount = (p.unit_amount ?? 0) / 100;
          const currency = (p.currency || "usd").toUpperCase();
          const interval = p.recurring?.interval ? `/${p.recurring.interval}` : "";
          return (
            <div key={p.priceId} style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>{p.name}</h3>
              <p style={{ color: "#555", minHeight: 40 }}>{p.blurb}</p>

              <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>
                {amount.toLocaleString(undefined, { style: "currency", currency })}
                <span style={{ fontSize: 14, color: "#666" }}>{interval}</span>
              </div>

              <button onClick={() => startUpgrade(p.priceId)} disabled={busy === p.priceId}>
                {busy === p.priceId ? "Starting…" : "Upgrade"}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

// --- Fetch price metadata from Stripe on the server (unchanged) ---
export async function getServerSideProps() {
  let plans = [];
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const results = await Promise.all(
      PRICE_IDS.map(async (cfg) => {
        try {
          const price = await stripe.prices.retrieve(cfg.priceId, { expand: ["product"] });
          if (!price?.active) return null;
          return {
            name: cfg.name,
            blurb: cfg.blurb,
            priceId: cfg.priceId,
            unit_amount: price.unit_amount,
            unit_amount_decimal: price.unit_amount_decimal,
            currency: price.currency,
            recurring: price.recurring || null,
            product: price.product && typeof price.product !== "string"
              ? { id: price.product.id, name: price.product.name, description: price.product.description }
              : null,
          };
        } catch {
          return null;
        }
      })
    );
    plans = results.filter(Boolean);
  } catch (e) {
    console.error("pricing getServerSideProps error:", e);
  }
  return { props: { plans } };
}
