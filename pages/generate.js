// pages/generate.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

const PURPOSES = {
  reference_id: "reference",
  vocal_id: "vocal",
  melody_id: "melody",
};

export default function Generate({ initialCustomerId, initialEnt }) {
  const router = useRouter();

  // ---- Stable, SSR-provided values ----
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [ent, setEnt] = useState(initialEnt); // { planName, songsPerYear, songsUsed, revisionsPerSong, commercial, renewsAt }

  // ---- Generation options ----
  const [lyrics, setLyrics] = useState("");
  const [model, setModel] = useState("auto");
  const [prompt, setPrompt] = useState("r&b, slow, passionate, male vocal");
  const [stream, setStream] = useState(false);

  // ---- Optional file IDs ----
  const [referenceId, setReferenceId] = useState("");
  const [vocalId, setVocalId] = useState("");
  const [melodyId, setMelodyId] = useState("");

  // ---- Job state ----
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Polling refs (fixes stale-closure bug)
  const pollRef = useRef(null);
  const jobIdRef = useRef("");

  // ---- Lyrics generator state ----
  const [lyrPrompt, setLyrPrompt] = useState(
    "Birthday love song for Taylor, warm and heartfelt, mid-tempo pop"
  );
  const [genTitle, setGenTitle] = useState("");
  const [genLyrics, setGenLyrics] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");

  // Keep customerId in sync if URL changes client-side
  useEffect(() => {
    if (!router.isReady) return;
    const cid = (router.query.customerId || "").toString();
    if (cid && cid !== customerId) setCustomerId(cid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.customerId]);

  // Keep jobIdRef synced with state
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  // ---- Entitlement fetch (used after successful job) ----
  async function fetchEntitlement(id) {
    if (!id) return;
    try {
      const r = await fetch(`/api/me/entitlement?customerId=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Entitlement check failed");

      if (j.plan || typeof j.entitled === "boolean") {
        const plan = j.plan || {};
        setEnt({
          planName: plan.name || "",
          songsPerYear: Number.isFinite(plan.songsPerYear) ? plan.songsPerYear : 0,
          songsUsed: Number.isFinite(plan.songsUsed) ? plan.songsUsed : 0,
          revisionsPerSong: Number.isFinite(plan.revisionsPerSong) ? plan.revisionsPerSong : 0,
          commercial: !!plan.commercial,
          renewsAt: plan.renewsAt || null,
        });
      } else {
        setEnt(j);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // ---- Upload helper -> /api/mureka/upload ----
  async function uploadFor(fieldKey, file) {
    if (!file) return;
    setErr("");
    try {
      const fd = new FormData();
      fd.append("purpose", PURPOSES[fieldKey]);
      fd.append("file", file);

      const r = await fetch("/api/mureka/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || "Upload failed");

      if (fieldKey === "reference_id") setReferenceId(j.id);
      if (fieldKey === "vocal_id") setVocalId(j.id);
      if (fieldKey === "melody_id") setMelodyId(j.id);
    } catch (e) {
      setErr(e.message);
    }
  }

  // ---- Start generation (sets up poller correctly) ----
  async function start() {
    setErr("");
    setResultUrl("");
    setStatus("");
    setJobId("");

    if (!customerId) {
      setErr("Paste your Stripe customerId (cus_...)");
      return;
    }
    if (!lyrics && !prompt && !referenceId && !vocalId && !melodyId) {
      setErr("Provide at least one: lyrics, prompt, reference, vocal or melody.");
      return;
    }

    setBusy(true);
    try {
      const body = {
        customerId,
        lyrics,
        model,
        prompt,
        stream,
        ...(referenceId ? { reference_id: referenceId } : {}),
        ...(vocalId ? { vocal_id: vocalId } : {}),
        ...(melodyId ? { melody_id: melodyId } : {}),
      };

      const r = await fetch("/api/songs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || "Failed to start");

      setJobId(j.jobId);
      jobIdRef.current = j.jobId; // keep ref in sync immediately
      setStatus(j.status || "preparing");

      // Start interval that always uses the latest jobId via ref
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => check(jobIdRef.current), 2500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Poll job status via POST (avoid 405/edge caching issues) ----
  async function check(idParam) {
    const id = idParam || jobIdRef.current;
    if (!id) return;

    try {
      const r = await fetch("/api/songs/status?_t=" + Date.now(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: id }),
        cache: "no-store",
        credentials: "same-origin",
      });

      if (r.status === 304) return; // no change
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Status failed");

      // Expect shape: { ok: true, job: { status, resultUrl?, storageKey? } }
      const s = j?.job?.status || j?.status || "unknown";
      const url = j?.job?.resultUrl || j?.resultUrl || null;
      setStatus(s);
      if (url) setResultUrl(url);

      if (["succeeded", "failed", "error"].includes(s)) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (s === "succeeded") fetchEntitlement(customerId);
      }
    } catch (e) {
      setErr(e.message);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Clear interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const remaining = ent
    ? ent.songsPerYear < 0
      ? "∞"
      : ent.songsPerYear - ent.songsUsed
    : "";

  const noSongsLeft =
    !!ent && ent.songsPerYear >= 0 && (ent.songsPerYear - ent.songsUsed) <= 0;

  return (
    <main
      style={{
        padding: 28,
        fontFamily: "system-ui, Arial, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Generate a Song</h1>
        <a href="/songs">My Songs</a>
      </div>

      {/* Customer ID */}
      {customerId ? (
        <div
          style={{
            background: "#f7fbff",
            border: "1px solid #dbeafe",
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
            fontSize: 14,
            color: "#1e40af",
          }}
        >
          <b>Customer ID:</b> {customerId}
        </div>
      ) : (
        <label>
          <div>Stripe Customer ID (cus_…)</div>
          <input
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="cus_XXXXXXXXXXXX"
            style={{ width: "100%", padding: 8 }}
          />
        </label>
      )}

      {/* Plan summary */}
      {ent && (
        <div
          style={{
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <b>Plan:</b> {ent.planName} &nbsp;|&nbsp;
          <b>Songs/year:</b>{" "}
          {ent.songsPerYear < 0 ? "Unlimited" : ent.songsPerYear} &nbsp;|&nbsp;
          <b>Used:</b> {ent.songsUsed} &nbsp;|&nbsp;
          <b>Remaining:</b> {remaining}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={async () => {
            try {
              const r = await fetch("/api/portal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customerId }),
              });
              const j = await r.json();
              if (j?.url) window.location.href = j.url;
              else alert(j?.error || "Failed to open billing portal");
            } catch (e) {
              alert(e.message || "Failed to open billing portal");
            }
          }}
          disabled={!customerId}
        >
          Manage Billing
        </button>{" "}
        <a href={pricingHref(customerId)} style={{ marginLeft: 8 }}>
          Upgrade
        </a>
      </div>

      {/* Lyrics Generator */}
      <section
        style={{
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Lyrics Generator</h2>
        <label>
          <div>Lyrics Prompt</div>
          <input
            value={lyrPrompt}
            onChange={(e) => setLyrPrompt(e.target.value)}
            placeholder="e.g., Birthday love song for Taylor…"
            style={{ width: "100%", padding: 8 }}
          />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={async () => {
              setGenErr("");
              setGenTitle("");
              setGenLyrics("");
              if (!lyrPrompt.trim()) {
                setGenErr("Enter a lyrics prompt");
                return;
              }
              setGenBusy(true);
              try {
                const r = await fetch("/api/mureka/lyrics", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt: lyrPrompt }),
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j?.detail || j?.error || "Lyrics generation failed");
                setGenTitle(j.title || "");
                setGenLyrics(j.lyrics || "");
              } catch (e) {
                setGenErr(e.message);
              } finally {
                setGenBusy(false);
              }
            }}
            disabled={genBusy}
          >
            {genBusy ? "Generating…" : "Generate Lyrics"}
          </button>
          <button
            onClick={() => {
              const combined = (genTitle ? `# ${genTitle}\n\n` : "") + (genLyrics || "");
              if (!combined.trim()) return;
              setLyrics(combined.trim());
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            disabled={!genLyrics}
          >
            Use in form
          </button>
        </div>
        {genErr && (
          <div style={{ color: "crimson", marginTop: 8 }}>Error: {genErr}</div>
        )}
        {(genTitle || genLyrics) && (
          <div
            style={{
              whiteSpace: "pre-wrap",
              background: "#fafafa",
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            {genTitle && <h3 style={{ marginTop: 0 }}>{genTitle}</h3>}
            <div>{genLyrics}</div>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            <div>Lyrics</div>
            <textarea
              rows={5}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Paste lyrics or click 'Use in form' above"
              style={{ width: "100%", padding: 8 }}
            />
          </label>

          <label>
            <div>Prompt (style / vibe)</div>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g., "r&b, slow, passionate, male vocal"'
              style={{ width: "100%", padding: 8 }}
            />
          </label>

          <label>
            <div>Model</div>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{ width: 240, padding: 8 }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
            />
            <span>Stream (if supported)</span>
          </label>
        </div>

        <fieldset style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <legend>Optional Inputs via Upload</legend>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div><b>Reference</b> (mp3/m4a ~30s)</div>
              <input
                type="file"
                accept=".mp3,.m4a"
                onChange={(e) => uploadFor("reference_id", e.target.files?.[0])}
              />
              {referenceId && (
                <div style={{ fontSize: 12, color: "#555" }}>
                  reference_id: {referenceId}
                </div>
              )}
            </div>
            <div>
              <div><b>Vocal</b> (mp3/m4a 15–30s)</div>
              <input
                type="file"
                accept=".mp3,.m4a"
                onChange={(e) => uploadFor("vocal_id", e.target.files?.[0])}
              />
              {vocalId && (
                <div style={{ fontSize: 12, color: "#555" }}>
                  vocal_id: {vocalId}
                </div>
              )}
            </div>
            <div>
              <div><b>Melody</b> (mp3/m4a/MIDI 5–60s)</div>
              <input
                type="file"
                accept=".mp3,.m4a,.mid,.midi"
                onChange={(e) => uploadFor("melody_id", e.target.files?.[0])}
              />
              {melodyId && (
                <div style={{ fontSize: 12, color: "#555" }}>
                  melody_id: {melodyId}
                </div>
              )}
            </div>
          </div>
        </fieldset>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={start} disabled={busy || !customerId || noSongsLeft}>
            {busy ? "Starting…" : noSongsLeft ? "No songs left" : "Start"}
          </button>
          <button onClick={() => check(jobIdRef.current)} disabled={!jobId}>
            Check Status
          </button>
          <a href="/songs" style={{ marginLeft: "auto" }}>My Songs</a>
        </div>

        {noSongsLeft && (
          <div style={{ color: "#a00" }}>
            You’ve used all your songs for this plan.{" "}
            <a href={pricingHref(customerId)}>Upgrade</a> or wait until renewal.
          </div>
        )}

        {jobId && (
          <div>
            <b>Job ID:</b> {jobId}
          </div>
        )}
        {status && (
          <div>
            <b>Status:</b> {status}
          </div>
        )}
        {resultUrl && (
          <div style={{ marginTop: 8 }}>
            <audio controls src={resultUrl} style={{ width: "100%" }} />
            <div style={{ marginTop: 8 }}>
              <a href={resultUrl} target="_blank" rel="noreferrer">
                Download MP3
              </a>
            </div>
          </div>
        )}
        {err && <div style={{ color: "crimson" }}>Error: {err}</div>}
      </div>
    </main>
  );
}

// -------- SSR: build a stable HTML tree from server-provided props --------
export async function getServerSideProps(ctx) {
  const { customerId } = ctx.query || {};

  let initialEnt = null;

  if (customerId) {
    const prisma = (await import("../lib/prisma")).default;

    try {
      const row = await prisma.customerEntitlement.findUnique({
        where: { customerId: String(customerId) },
      });

      if (row) {
        initialEnt = {
          planName: row.planName || "",
          songsPerYear: Number.isFinite(row.songsPerYear) ? row.songsPerYear : 0,
          songsUsed: Number.isFinite(row.songsUsed) ? row.songsUsed : 0,
          revisionsPerSong: Number.isFinite(row.revisionsPerSong) ? row.revisionsPerSong : 0,
          commercial: !!row.commercial,
          renewsAt: row.renewsAt ? row.renewsAt.toISOString() : null,
        };
      }
    } catch (e) {
      console.error("getServerSideProps entitlement lookup failed:", e);
    }
  }

  return {
    props: {
      initialCustomerId: customerId || "",
      initialEnt,
    },
  };
}

function pricingHref(cid) {
  return cid ? `/pricing?customerId=${encodeURIComponent(cid)}` : "/pricing";
}
