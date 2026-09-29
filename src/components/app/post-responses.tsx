"use client";

import Link from "next/link";
import { Check, Clock, MessageSquare, X } from "lucide-react";
import { decidePostResponse, respondToPost } from "@/lib/actions/post-responses";
import type { PostKind, PostResponse } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingButton } from "@/components/ui/pending-button";
import { Avatar } from "@/components/app/avatar";
import { useTranslations } from "@/components/app/i18n-provider";
import { RelativeTime } from "@/components/app/relative-time";

// What a visitor sees under someone else's post: a join form, or the state of their request.
export function RespondToPost({
  kind,
  postId,
  myResponse,
  full = false,
}: {
  kind: PostKind;
  postId: string;
  myResponse: PostResponse | null | undefined;
  full?: boolean;
}) {
  const t = useTranslations("common");

  if (myResponse?.status === "accepted" && myResponse.match_id) {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-md border border-lime-400/30 bg-lime-400/10 p-3 text-sm text-lime-100 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("responses.accepted")}</span>
        <Button asChild size="sm">
          <Link href={`/matches/${myResponse.match_id}`}>
            <MessageSquare className="h-4 w-4" />
            {t("responses.openChat")}
          </Link>
        </Button>
      </div>
    );
  }

  if (myResponse) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-300">
        {myResponse.status === "declined" ? <X className="h-4 w-4 text-zinc-500" /> : <Clock className="h-4 w-4 text-amber-300" />}
        {myResponse.status === "declined" ? t("responses.declined") : t("responses.pending")}
      </p>
    );
  }

  if (full) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-400">
        <Check className="h-4 w-4 text-lime-300" />
        {t("responses.full")}
      </p>
    );
  }

  return (
    <form action={respondToPost} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="post_id" value={postId} />
      <Input
        name="message"
        maxLength={280}
        aria-label={t(`responses.messageLabel.${kind}`)}
        placeholder={t(`responses.messagePlaceholder.${kind}`)}
        className="sm:flex-1"
      />
      <PendingButton className="sm:w-44" pendingText={t("responses.sending")}>
        {t(`responses.cta.${kind}`)}
      </PendingButton>
    </form>
  );
}

// What the author sees under their own post: incoming requests with accept / decline.
export function PostResponsesList({ kind, responses }: { kind: PostKind; responses: PostResponse[] }) {
  const t = useTranslations("common");
  const pending = responses.filter((response) => response.status === "pending");
  const decided = responses.filter((response) => response.status !== "pending");

  if (!responses.length) {
    return <p className="mt-4 rounded-md border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">{t("responses.none")}</p>;
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {t("responses.incoming", { count: pending.length })}
      </div>
      {[...pending, ...decided].map((response) => {
        const name = response.responder?.nickname ?? t("responses.unknownPlayer");
        return (
          <div key={response.id} className="flex flex-col gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar
                name={name}
                src={response.responder?.avatar_url}
                seed={response.responder_id}
                sizes="40px"
                className="h-10 w-10 shrink-0 rounded-full"
                textClassName="text-sm"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-100">{name}</span>
                  {response.responder?.approximate_level ? (
                    <span className="text-xs text-zinc-500">
                      {t("responses.level", { level: response.responder.approximate_level })}
                    </span>
                  ) : null}
                  <span className="text-xs text-zinc-500"><RelativeTime value={response.created_at} /></span>
                </div>
                <p className="line-clamp-2 text-sm text-zinc-400">{response.message || t("responses.noMessage")}</p>
              </div>
            </div>
            {response.status === "pending" ? (
              <div className="grid grid-cols-2 gap-2 sm:w-56">
                <form action={decidePostResponse}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="response_id" value={response.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <PendingButton variant="outline" size="sm" className="w-full" pendingText="...">
                    <X className="h-4 w-4" />
                    {t("responses.decline")}
                  </PendingButton>
                </form>
                <form action={decidePostResponse}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="response_id" value={response.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <PendingButton size="sm" className="w-full" pendingText="...">
                    <Check className="h-4 w-4" />
                    {t("responses.accept")}
                  </PendingButton>
                </form>
              </div>
            ) : response.status === "accepted" && response.match_id ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/matches/${response.match_id}`}>
                  <MessageSquare className="h-4 w-4" />
                  {t("responses.openChat")}
                </Link>
              </Button>
            ) : (
              <Badge>{t("responses.declinedByYou")}</Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
