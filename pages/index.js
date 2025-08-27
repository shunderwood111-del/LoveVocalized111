// pages/index.js
export default function Home() {
  // TEST price IDs you gave me
  const ONE_HIT  = "price_1RxfHhKhwtUF5XZpyewzUaoQ"; // $19.99/yr
  const GREATEST = "price_1RxfInKhwtUF5XZpADVWFbIP"; // $29.99/yr
  const PLATINUM = "price_1RxfJYKhwtUF5XZpQgxUX7fV"; // $99.99/yr

  const startCheckout = async (priceId) => {
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url; // go to Stripe Checkout
      } else if (data?.id) {
        // fallback if only sessionId is returned
        window.location.href = `https://checkout.stripe.com/c/session/${data.id}`;
      } else {
        console.error("Checkout failed:", data);
        alert("Checkout failed. See console.");
      }
    } catch (e) {
      console.error(e);
      alert("Error starting checkout.");
    }
  };

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif", maxWidth: 960, margin: "0 auto" }}>
      <h1>LoveVocalized</h1>
      <p>Turn life’s moments into songs — love notes, birthdays, weddings.</p>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <h3>One-Hit Wonder</h3>
          <p><b>$19.99 / year</b></p>
          <ul>
            <li>1 custom song this year</li>
            <li>Perfect for a birthday or anniversary</li>
          </ul>
          <button onClick={() => startCheckout(ONE_HIT)}>Choose One-Hit Wonder</button>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <h3>Greatest Hits <span style={{ fontSize: 12, padding: "2px 6px", background: "#eef2ff", borderRadius: 999, marginLeft: 6 }}>Most Popular</span></h3>
          <p><b>$29.99 / year</b></p>
          <ul>
            <li>Up to 5 romantic songs this year</li>
            <li>Up to 2 tweaks per song</li>
          </ul>
          <button onClick={() => startCheckout(GREATEST)}>Choose Greatest Hits</button>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
          <h3>Platinum Playlist</h3>
          <p><b>$99.99 / year</b></p>
          <ul>
            <li>Unlimited songs & revisions</li>
            <li>Full commercial license</li>
          </ul>
          <button onClick={() => startCheckout(PLATINUM)}>Go Platinum</button>
        </div>
      </div>
    </main>
  );
}
