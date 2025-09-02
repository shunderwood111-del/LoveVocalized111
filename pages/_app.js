// pages/_app.js
import Link from "next/link";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      {/* Floating "My Songs" button shown on every page */}
      <Link href="/songs" legacyBehavior>
        <a
          aria-label="Go to My Songs"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            padding: "10px 14px",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
            zIndex: 1000,
          }}
        >
          🎵 My Songs
        </a>
      </Link>
    </>
  );
}
