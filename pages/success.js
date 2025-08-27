export default function Success() {
  // This page won’t render; we redirect server-side in getServerSideProps.
  return null;
}

export async function getServerSideProps(ctx) {
  const { session_id } = ctx.query || {};

  if (!session_id) {
    // No session id? Send them to your generator (or home) as a safe fallback.
    return {
      redirect: { destination: "/generate", permanent: false },
    };
  }

  // Look up the Stripe Checkout Session on the server
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
      return {
        redirect: { destination: "/generate", permanent: false },
      };
    }

    // Redirect straight to your generator with the customerId
    return {
      redirect: {
        destination: `/generate?customerId=${encodeURIComponent(customerId)}`,
        permanent: false,
      },
    };
  } catch {
    // Any failure → safe fallback
    return {
      redirect: { destination: "/generate", permanent: false },
    };
  }
}
