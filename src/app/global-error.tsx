"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

// Last-resort boundary when the root layout itself fails; it cannot rely on app styles or i18n.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#09090b", color: "#f4f4f5", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>EscapeMate no está disponible ahora mismo</h1>
          <p style={{ color: "#a1a1aa", lineHeight: 1.6 }}>Ha ocurrido un error inesperado. Something went wrong on our side.</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: "10px 18px", borderRadius: 8, border: 0, background: "#a3e635", color: "#09090b", fontWeight: 600, cursor: "pointer" }}
          >
            Reintentar / Retry
          </button>
        </div>
      </body>
    </html>
  );
}
