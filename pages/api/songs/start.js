// pages/api/songs/start.js
import prisma from "../../../lib/prisma";
import Stripe from "stripe";
import { getEntitlementFromPriceId } from "../../../lib/entitlements";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

async function ensureEntitlement(customerId) {
  // Try to find existing
  let ent = await prisma.customerEntitlement.findUnique({ where: { customerId } });
  if (ent) return ent;

  // No entitlement? Look up active subscription in Stripe and derive one.
  // We handle both single- and multi-item subs; take the first active item.
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    expand: ["data.items.data.price"],
    limit: 3,
  });

  const sub = subs.data?.[0];
  const item = sub?.items?.data?.[0];
  const priceId = item?.price?.id;

  if (!priceId) {
    // Could be incomplete or no active sub yet
    throw new Error("No active subscription found for this customer");
  }

  const mapped = getEntitlementFromPriceId(priceId);
  if (!mapped) {
    throw new Error(`Unknown price mapping for ${priceId}`);
  }

  // Create entitlement row
  ent = await prisma.customerEntitlement.create({
    data: {
      customerId,
      priceId,
      planName: mapped.name,
      songsPerYear: mapped.songsPerYear,
      revisionsPerSong: mapped.revisionsPerSong,
      commercial: !!mapped.commercial,
      renewsAt: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      songsUsed: 0,
    },
  });

  return ent;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const {
      customerId,
      lyrics = "",
      model = "auto",
      prompt = "",
      reference_id = "",
      vocal_id = "",
      melody_id = "",
      stream = false,
    } = req.body || {};

    if (!customerId) return res.status(400).json({ error: "Missing customerId" });
    if (!lyrics && !prompt && !reference_id && !vocal_id && !melody_id) {
      return res.status(400).json({ error: "Provide one of: lyrics, prompt, reference_id, vocal_id, melody_id" });
    }

    // 🔧 NEW: auto-provision entitlement if missing
    let ent;
    try {
      ent = await ensureEntitlement(customerId);
    } catch (e) {
      // Surface helpful message to UI
      return res.status(402).json({ error: "Entitlement not found", detail: e.message });
    }

    // check remaining quota
    const remaining = ent.songsPerYear < 0 ? -1 : Math.max(0, ent.songsPerYear - (ent.songsUsed ?? 0));
    if (remaining === 0) {
      return res.status(402).json({ error: "No songs remaining" });
    }

    // Call Mureka
    const base = process.env.MUREKA_API_URL || "https://api.mureka.ai";
    const key = process.env.MUREKA_API_KEY;
    if (!key) return res.status(500).json({ error: "Mureka not configured" });

    const payload = {
      lyrics,
      model,
      prompt,
      ...(reference_id ? { reference_id } : {}),
      ...(vocal_id ? { vocal_id } : {}),
      ...(melody_id ? { melody_id } : {}),
      ...(typeof stream === "boolean" ? { stream } : {}),
    };

    const resp = await fetch(`${base}/v1/song/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "Mureka enqueue failed", detail: text });
    }

    let data; try { data = JSON.parse(text); } catch { return res.status(502).json({ error: "Bad JSON from Mureka", raw: text }); }

    const jobId = data?.id?.toString();
    const status = (data?.status || "preparing").toString();
    if (!jobId) return res.status(502).json({ error: "Mureka response missing 'id'" });

    await prisma.songJob.create({
      data: {
        customerId,
        externalJob: jobId,
        status,
        prompt: prompt || null,
      },
    });

    return res.status(200).json({ jobId, status, accepted: payload });
  } catch (e) {
    console.error("songs/start error", e);
    return res.status(500).json({ error: "Server error" });
  }
}
