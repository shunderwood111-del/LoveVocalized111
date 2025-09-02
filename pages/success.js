// pages/success.js
export default function Success() {
  // We redirect server-side; nothing to render.
  return null;
}

export async function getServerSideProps(ctx) {
  const { session_id } = ctx.query || {};

  if (!session_id) {
    return { redirect: { destination: "/generate", permanent: false } };
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer"],
    });

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

    if (!customerId) {
      return { redirect: { destination: "/generate", permanent: false } };
    }

    // Set a non-HttpOnly cookie so client code can read it (e.g., /songs page).
    // Add `Secure` only when we’re on HTTPS (Vercel).
    const proto = ctx.req.headers["x-forwarded-proto"] || "http";
    const isSecure = proto === "https";

    const cookie = [
      `lv_customer=${encodeURIComponent(customerId)}`,
      "Path=/",
      "Max-Age=2592000",         // ~30 days
      "SameSite=Lax",
      isSecure ? "Secure" : "",  // don’t set Secure during local HTTP dev
    ]
      .filter(Boolean)
      .join("; ");

    ctx.res.setHeader("Set-Cookie", cookie);

    // Redirect to the songs library page
    return {
      redirect: { destination: "/songs", permanent: false },
    };
  } catch {
    return { redirect: { destination: "/generate", permanent: false } };
  }
}
