import { ErrorState } from "@/components/app/error-state";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getServerTranslator("common");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <ErrorState
        code="404"
        title={t("errorPage.notFoundTitle")}
        description={t("errorPage.notFoundDescription")}
        homeLabel={t("errorPage.home")}
      />
    </main>
  );
}
