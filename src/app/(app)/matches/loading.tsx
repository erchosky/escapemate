import { SectionLoading } from "@/components/app/section-loading";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function Loading() {
  const t = await getServerTranslator("common");
  return <SectionLoading title={t("loading.sections.matches")} />;
}
