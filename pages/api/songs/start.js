// pages/api/songs/start.js
import prisma from "../../../lib/prisma";
import Stripe from "stripe";
import { getEntitlementFromPriceId } from "../../../lib/entitlements";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

async function ensureEntitlement(customerId) {
  let ent = await prisma.customerEntitlement.findUnique({ where: { customerId } });
  if (ent) return ent;

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    expand: ["data.items.data.price"],
    limit: 3,
  });

  const sub = subs.data?.[0];
  const item = sub?.items?.data?.[0];
  const priceId = item?.price?.id;
  if (!priceId) throw new Error("No active subscription found for this customer");

  const mapped = getEntitlementFromPriceId(priceId);
  if (!mapped) throw new Error(`Unknown price mapping for ${priceId}`);

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
  if (req.method !== "POST") {
    res.status(405).end("Method Not Allowed");
    return;
  }

  // prevent caching (avoids 304s during polling flows)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("ETag", Date.now().toString());

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

    if (!customerId) {
      res.status(400).json({ error: "Missing customerId" });
      return;
    }
    if (!lyrics && !prompt && !reference_id && !vocal_id && !melody_id) {
      res.status(400).json({ error: "Provide at least one: lyrics, prompt, reference, vocal or melody." });
      return;
    }

    let ent;
    try {
      ent = await ensureEntitlement(customerId);
    } catch (e) {
      res.status(402).json({ error: "Entitlement not found", detail: e.message });
      return;
    }

    const remaining = ent.songsPerYear < 0 ? -1 : Math.max(0, ent.songsPerYear - (ent.songsUsed ?? 0));
    if (remaining === 0) {
      res.status(402).json({ error: "No songs remaining" });
      return;
    }

    const base = (process.env.MUREKA_API_URL || "https://api.mureka.ai").replace(/\/+$/, "");
    const key = process.env.MUREKA_API_KEY;
    if (!key) {
      res.status(500).json({ error: "Mureka not configured" });
      return;
    }

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
      res.status(resp.status).json({ error: "Mureka enqueue failed", detail: text });
      return;
    }

    let provider;
    try { provider = JSON.parse(text); } catch { provider = { raw: text }; }

    // If provider immediately returns a final audio URL, finish now.
    const directUrl =
      provider?.url ||
      provider?.audio_url ||
      provider?.result?.url ||
      provider?.data?.url ||
      null;

    if (directUrl) {
      const job = await prisma.songJob.create({
        data: {
          customerId,
          externalJob: "direct-" + Date.now(),
          status: "succeeded",
          prompt: prompt || null,
          resultUrl: directUrl,
        },
      });
      res.status(200).json({
        jobId: job.externalJob,
        status: "succeeded",
        resultUrl: directUrl,
        accepted: payload,
        providerRaw: provider,
      });
      return;
    }

    // Otherwise, async job: prefer a poll/status URL if given
    const jobIdCandidate =
      provider?.id ?? provider?.job_id ?? provider?.jobId ?? provider?.task_id ?? provider?.data?.id ?? null;

    const pollUrlCandidate =
      provider?.status_url ?? provider?.statusUrl ?? provider?.poll_url ?? provider?.pollUrl ?? provider?.href ?? null;

    const externalJob =
      (typeof pollUrlCandidate === "string" && /^https?:\/\//i.test(pollUrlCandidate))
        ? pollUrlCandidate
        : (jobIdCandidate ? String(jobIdCandidate) : null);

    if (!externalJob) {
      res.status(502).json({
        error: "Mureka response missing job id or poll URL",
        providerRaw: provider,
      });
      return;
    }

    const status = String(provider?.status ?? provider?.state ?? "preparing");

    await prisma.songJob.create({
      data: {
        customerId,
        externalJob,
        status,
        prompt: prompt || null,
      },
    });

    res.status(200).json({
      jobId: externalJob,
      status,
      accepted: payload,
      providerRaw: provider,
    });
  } catch (e) {
    console.error("songs/start error", e);
    res.status(500).json({ error: "Server error" });
  }
}
