// pages/checkout.js
import { useState } from "react";

export default function Checkout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Optionally pass a specific priceId/qty:
        // body: JSON.stringify({ priceId: "<price_...>", quantity: 1 }),
        body: JSON.stringify({}),
      });

      // res.status is a NUMBER, not a function
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }

      const { url } = await res.json();
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (e) {
      console.error(e);
      setError(e.message || "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 600 }}>
      <h1>Checkout</h1>
      <p>Click below to start Stripe Checkout.</p>
      <button onClick={startCheckout} disabled={loading}>
        {loading ? "Redirecting…" : "Buy"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}

// Force runtime rendering so Next doesn't try to prerender this page at build time
export async function getServerSideProps() {
  return { props: {} };
}
