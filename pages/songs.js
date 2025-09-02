import { useEffect, useState } from "react";

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

  useEffect(() => {
    const cid = readCookie("lv_customer");
    setCustomerId(cid);
    if (!cid) {
      setLoading(false);
      setErr("No customer id found. Complete a checkout first.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/songs/list", {
          headers: { "x-customer-id": cid },
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setItems(json.items || []);
      } catch (e) {
        setErr(e.message || "Failed to load songs");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
        audio.play().catch(() => {});
      }
    } catch (e) {
      alert(e.message || "Could not get playback URL");
    }
  }

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ padding: 24, maxWidth: 800 }}>
      <h1>Your Songs</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {!err && items.length === 0 && <p>No songs yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
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
                    <button onClick={() => playSong(it.id)} style={{ padding: "6px 12px" }}>Play</button>
                    <audio id={`audio-${it.id}`} controls style={{ display: "block", marginTop: 8, width: 300 }} />
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

// Force runtime render (avoid pre-rendering issues)
export async function getServerSideProps() { return { props: {} }; }
