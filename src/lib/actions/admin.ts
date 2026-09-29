"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { logActionError, uuidSchema } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";

const reportStatusSchema = z.enum(["open", "reviewed", "dismissed", "actioned"]);

export async function updateReportStatus(formData: FormData) {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);

  if (!user) redirect("/login");

  const id = uuidSchema.safeParse(String(formData.get("id") ?? ""));
  const status = reportStatusSchema.safeParse(String(formData.get("status") ?? ""));

  if (!id.success || !status.success) {
    redirect("/admin/reports?error=invalid");
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin", { p_user_id: user.id });
  if (adminError) {
    logActionError("updateReportStatus.isAdmin", adminError);
    redirect("/admin/reports?error=failed");
  }

  if (!isAdmin) notFound();

  const rateLimit = await checkPersistentRateLimit(supabase, {
    key: `admin:report-status:${user.id}`,
    limit: 40,
    windowMs: 60 * 60_000,
  });

  if (!rateLimit.ok) {
    redirect("/admin/reports?error=rateLimited");
  }

  const { error } = await supabase
    .from("reports")
    .update({
      status: status.data,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id.data);

  if (error) {
    logActionError("updateReportStatus.update", error);
    redirect("/admin/reports?error=failed");
  }

  revalidatePath("/admin/reports");
}
