import Link from "next/link";
import { notFound } from "next/navigation";
import { updateReportStatus } from "@/lib/actions/admin";
import { getAdminReports } from "@/lib/supabase/queries";
import { REPORT_REASONS, type ReportStatus } from "@/lib/constants";
import { formatDateTime } from "@/lib/i18n/format";
import { getLocale, getServerTranslator } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingButton } from "@/components/ui/pending-button";

export const dynamic = "force-dynamic";

const statuses: ReportStatus[] = ["open", "reviewed", "dismissed", "actioned"];
const ADMIN_ERRORS = ["invalid", "failed", "rateLimited"] as const;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { reports, isAdmin } = await getAdminReports(params.status);

  if (!isAdmin) notFound();

  const locale = await getLocale();
  const [t, profileT] = await Promise.all([getServerTranslator("admin", locale), getServerTranslator("profile", locale)]);
  const errorCode = ADMIN_ERRORS.find((code) => code === params.error);
  const reasonLabel = (reason: string) =>
    (REPORT_REASONS as readonly string[]).includes(reason) ? profileT(`options.reportReasons.${reason}`) : reason;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">{t("reports")}</h1>
          <p className="mt-1 text-sm text-zinc-400">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusLink label={t("all")} href="/admin/reports" active={!params.status} />
          {statuses.map((status) => (
            <StatusLink
              key={status}
              label={t(`status.${status}`)}
              href={`/admin/reports?status=${status}`}
              active={params.status === status}
            />
          ))}
        </div>
      </div>

      {errorCode ? <p role="alert" className="mb-4 text-sm text-red-300">{t(`errors.${errorCode}`)}</p> : null}

      <div className="grid gap-4">
        {reports.length ? (
          reports.map((report) => (
            <Card key={report.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={report.status === "open" ? "red" : "lime"}>{t(`status.${report.status}`)}</Badge>
                    <span className="text-sm text-zinc-500">{formatDateTime(report.created_at, locale)}</span>
                  </div>
                  <h2 className="mt-3 font-semibold text-zinc-50">{reasonLabel(report.reason)}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{report.details || t("noDetails")}</p>
                  <p className="mt-3 text-sm text-zinc-400">
                    {t("reporter")}: {report.reporter?.nickname ?? report.reporter_id} · {t("reported")}:{" "}
                    {report.reported?.nickname ?? report.reported_id}
                  </p>
                  {report.reviewed_at ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {t("lastReview")}: {formatDateTime(report.reviewed_at, locale)}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-80">
                  {statuses
                    .filter((status) => status !== "open")
                    .map((status) => (
                      <form key={status} action={updateReportStatus}>
                        <input type="hidden" name="id" value={report.id} />
                        <input type="hidden" name="status" value={status} />
                        <PendingButton
                          variant="outline"
                          className="w-full"
                          disabled={report.status === status}
                          pendingText={t("updating")}
                        >
                          {t(`status.${status}`)}
                        </PendingButton>
                      </form>
                    ))}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold text-zinc-50">{t("emptyTitle")}</h2>
            <p className="mt-2 text-sm text-zinc-400">{t("emptyDescription")}</p>
          </Card>
        )}
      </div>
    </>
  );
}

function StatusLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Button asChild variant={active ? "default" : "outline"} size="sm">
      <Link href={href}>
        {label}
      </Link>
    </Button>
  );
}
