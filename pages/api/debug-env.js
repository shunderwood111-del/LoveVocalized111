export default function handler(req, res) {
  res.status(200).json({
    hasPublishable: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    hasSecret: !!process.env.STRIPE_SECRET_KEY,
    hasWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
    nodeEnv: process.env.NODE_ENV || null,
  });
}
