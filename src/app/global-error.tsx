"use client";

/**
 * The last net. This replaces the root layout entirely when the layout itself throws, which is why
 * it has to ship its own <html> and <body>.
 *
 * It gets no global stylesheet -- globals.css is imported by the layout that just died -- so every
 * rule here is inline. That is not a shortcut: a Tailwind class in this file renders as unstyled
 * black-on-white, and unstyled is exactly the impression the one page that only appears when
 * everything else has failed must not give. No fonts either, for the same reason; the stack falls
 * back to whatever the device has.
 *
 * No `export const metadata` is possible in a client component, so the tab title is set with
 * React's own <title>.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "2rem 1.5rem",
          textAlign: "center",
          background: "#10150c",
          color: "#f2ead8",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <title>Something broke — Swasthvica</title>

        <p
          style={{
            margin: 0,
            fontFamily: "system-ui, sans-serif",
            fontSize: "0.6875rem",
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "#d4b05e",
          }}
        >
          Swasthvica
        </p>

        <h1 style={{ margin: 0, fontSize: "clamp(1.75rem, 6vw, 2.75rem)", fontWeight: 400, lineHeight: 1.15 }}>
          The valley is out of reach.
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: "42ch",
            lineHeight: 1.7,
            fontFamily: "system-ui, sans-serif",
            fontSize: "0.95rem",
            color: "rgba(233, 223, 197, 0.75)",
          }}
        >
          Something failed before the page could be built. Nothing has been charged, and anything in
          your cart is still saved on this device.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
          <button
            onClick={() => retry()}
            style={{
              minHeight: "3rem",
              padding: "0 2.25rem",
              border: 0,
              borderRadius: "999px",
              background: "#c9a24a",
              color: "#10150c",
              cursor: "pointer",
              font: "500 0.8125rem/1 system-ui, sans-serif",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "3rem",
              padding: "0 2.25rem",
              borderRadius: "999px",
              border: "1px solid rgba(201, 162, 74, 0.8)",
              color: "#e2c37c",
              textDecoration: "none",
              font: "500 0.8125rem/1 system-ui, sans-serif",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Home
          </a>
        </div>

        {error.digest && (
          <p
            style={{
              margin: 0,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              letterSpacing: "0.08em",
              color: "rgba(220, 205, 170, 0.45)",
            }}
          >
            {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
