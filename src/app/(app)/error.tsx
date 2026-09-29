"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";
import { ErrorState } from "@/components/app/error-state";
import { useDocumentTranslator } from "@/lib/i18n/document-locale";

// Keeps the app shell (navigation, badges) visible when a single section fails.
export default function SectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useDocumentTranslator();

  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <ErrorState
      title={t("errorPage.title")}
      description={t("errorPage.description")}
      retryLabel={t("errorPage.retry")}
      homeLabel={t("errorPage.home")}
      onRetry={reset}
      code={error.digest ? `ref ${error.digest}` : undefined}
    />
  );
}
