import { useEffect, useState } from "react";

export default function Dashboard() {
  const [customerId, setCustomerId] = useState("");
  const [ent, setEnt] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  // Read ?customerId=... from the URL
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const idFromURL = url.searchParams.get("customerId") || "";
      setCustomerId(idFromURL);
    } catch {
      setCustomerId("");
    }
  }, []);

  async function load() {
    if (!customerId) { setErr("Missing customerId"); setEnt(null); return; }
    setErr(null);
    try {
      const r = await fetch(`/api/me/entitlement?customerId=${customerId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to load entitlement");
      setEnt(j);
    } catch (e) {
      setErr(e.message);
      setEnt(null);
    }
  }

  useEffect(() => { load(); }, [customerId]);

  const consume = async () => {
    if (!customerId) return alert("Missing customerId");
    setBusy(true);
    try {
      const r = await fetch("/api/me/consume-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to consume");
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif", maxWidth: 720 }}>
      <h1>Dashboard</h1>

      <label style={{ display: "block", marginTop: 8 }}>Customer ID</label>
      <input
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        placeholder="cus_..."
        style={{ padding: 8, width: "100%", maxWidth: 420 }}
      />
      <div style={{ marginTop: 8 }}>
        <button onClick={load}>Reload</button>
        <a href="/" style={{ marginLeft: 8 }}><button>Home</button></a>
      </div>

      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}
      {!err && !ent && <p>Loading…</p>}

      {ent && (
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginTop: 16 }}>
          <p><b>Plan:</b> {ent.planName}</p>
          <p><b>Songs/year:</b> {ent.songsPerYear < 0 ? "Unlimited" : ent.songsPerYear}</p>
          <p><b>Used:</b> {ent.songsUsed}</p>
          <p><b>Remaining:</b> {ent.songsRemaining < 0 ? "∞" : ent.songsRemaining}</p>
          <p><b>Commercial use:</b> {ent.commercial ? "Yes" : "No"}</p>
          {ent.renewsAt && <p><b>Renews:</b> {new Date(ent.renewsAt).toLocaleString()}</p>}

          <div style={{ marginTop: 12 }}>
            <button onClick={consume} disabled={busy || ent.songsRemaining === 0}>
              {busy ? "Working…" : "Use 1 song"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
