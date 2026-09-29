"use client";

import { useState, useTransition } from "react";
import { Ban, ShieldAlert } from "lucide-react";
import { blockUser, reportUser } from "@/lib/actions/moderation";
import type { Profile } from "@/lib/constants";
import { REPORT_REASON_OPTIONS } from "@/lib/i18n/options";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/components/app/i18n-provider";

export function ModerationActions({ profile, onBlocked }: { profile: Profile; onBlocked: (profile: Profile) => void }) {
  const profileT = useTranslations("profile");
  const errorsT = useTranslations("errors");
  const [mode, setMode] = useState<"idle" | "report" | "block">("idle");
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitReport(formData: FormData) {
    startTransition(async () => {
      const result = await reportUser(formData);
      setFeedback(result.ok ? { tone: "ok", text: profileT("reportSent") } : { tone: "error", text: errorsT(result.error) });
      if (result.ok) setMode("idle");
    });
  }

  function confirmBlock() {
    const formData = new FormData();
    formData.set("blocked_id", profile.id);
    startTransition(async () => {
      const result = await blockUser(formData);
      if (result.ok) {
        onBlocked(profile);
        return;
      }
      setFeedback({ tone: "error", text: errorsT(result.error) });
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFeedback(null);
            setMode(mode === "report" ? "idle" : "report");
          }}
          aria-expanded={mode === "report"}
        >
          <ShieldAlert className="h-4 w-4" />
          {profileT("report")}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            setFeedback(null);
            setMode(mode === "block" ? "idle" : "block");
          }}
          aria-expanded={mode === "block"}
        >
          <Ban className="h-4 w-4" />
          {profileT("block")}
        </Button>
      </div>

      {mode === "report" ? (
        <form action={submitReport} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
          <input type="hidden" name="reported_id" value={profile.id} />
          <div className="space-y-2">
            <Label htmlFor={`report-reason-${profile.id}`}>{profileT("reportReason")}</Label>
            <Select id={`report-reason-${profile.id}`} name="reason" defaultValue="harassment">
              {REPORT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {profileT(option.labelKey)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`report-details-${profile.id}`}>{profileT("reportDetails")}</Label>
            <Textarea id={`report-details-${profile.id}`} name="details" maxLength={500} placeholder={profileT("reportDetailsPlaceholder")} />
          </div>
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? profileT("reporting") : profileT("reportSubmit")}
          </Button>
        </form>
      ) : null}

      {mode === "block" ? (
        <div className="grid gap-3 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          <p>{profileT("blockConfirm", { nickname: profile.nickname })}</p>
          <Button type="button" variant="danger" onClick={confirmBlock} disabled={isPending}>
            {isPending ? profileT("blocking") : profileT("blockConfirmAction")}
          </Button>
        </div>
      ) : null}

      {feedback ? (
        <p role="status" className={feedback.tone === "ok" ? "text-sm text-lime-300" : "text-sm text-red-300"}>
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
