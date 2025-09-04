// pages/songs.js
import { useEffect, useState } from "react";
import Link from "next/link";

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : "";
}

export default function SongsPage() {
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setErr("");
      setLoading(true);
      const cid = readCookie("lv_customer");
      setCustomerId(cid);
      if (!cid) {
        setErr("We don’t see your customer id yet. After checkout, you’ll be taken to the generator.");
        setItems([]);
        return;
      }
      const res = await fetch("/api/songs/list", { headers: { "x-customer-id": cid } });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setItems(json.items || []);
    } catch (e) {
      setErr(e.message || "Failed to load songs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function playSong(id) {
    try {
      const res = await fetch("/api/songs/url", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-customer-id": customerId,
        },
        body: JSON.stringify({ songId: id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const url = json.url;
      const audio = document.getElementById(`audio-${id}`);
      if (audio) {
        audio.src = url;
        await audio.play().catch(() => {});
      }
    } catch (e) {
      alert(e.message || "Could not get playback URL");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Your Songs</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/generate" legacyBehavior>
            <a style={{ padding: "8px 12px", background: "#111", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
              ➕ New Song
            </a>
          </Link>
          <button onClick={load} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
            Refresh
          </button>
        </div>
      </header>

      {loading && <p>Loading…</p>}
      {!loading && err && (
        <div style={{ background: "#fff5f5", border: "1px solid #ffd6d6", padding: 12, borderRadius: 8 }}>
          <p style={{ margin: 0, color: "#b20000" }}>{err}</p>
          <p style={{ marginTop: 8 }}>
            <Link href="/generate">Go to the Song Generator</Link>
          </p>
        </div>
      )}

      {!loading && !err && items.length === 0 && (
        <div style={{ textAlign: "center", padding: 32, border: "1px dashed #ddd", borderRadius: 12, marginTop: 12 }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No songs yet.</p>
          <p style={{ marginBottom: 16 }}>Start your first one—it only takes a minute.</p>
          <Link href="/generate" legacyBehavior>
            <a style={{ padding: "10px 14px", background: "#111", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
              ➕ Create a Song
            </a>
          </Link>
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
        {items.map((it) => (
          <li key={it.id} style={{ border: "1px solid #eee", padding: 12, margin: "12px 0", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div><strong>Status:</strong> {it.status}</div>
                {it.prompt ? <div><strong>Prompt:</strong> {it.prompt}</div> : null}
                {it.durationSec != null ? <div><strong>Duration:</strong> {it.durationSec}s</div> : null}
                <div><small>{new Date(it.createdAt).toLocaleString()}</small></div>
              </div>
              <div>
                {it.status === "succeeded" ? (
                  <>
                    <button onClick={() => playSong(it.id)} style={{ padding: "6px 12px", marginRight: 8 }}>Play</button>
                    <audio id={`audio-${it.id}`} controls style={{ display: "block", marginTop: 8, width: 320 }} />
                  </>
                ) : (
                  <em>Processing…</em>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

// Avoid build-time prerender surprises
export async function getServerSideProps() { return { props: {} }; }
