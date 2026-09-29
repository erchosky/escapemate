import { ChatPanel } from "@/components/app/chat-panel";
import { I18nProvider } from "@/components/app/i18n-provider";
import { MatchProfileCard } from "@/components/app/match-profile-card";
import { isDemoBackend } from "@/lib/demo/mode";
import { getI18nPayload, getLocale } from "@/lib/i18n/server";
import { getMatchDetail } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const [locale, { user, otherProfile, messages }] = await Promise.all([getLocale(), getMatchDetail(matchId)]);
  const i18n = await getI18nPayload(["common", "profile", "matches", "chat", "errors", "swipe"], locale);

  return (
    <I18nProvider {...i18n}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ChatPanel
          matchId={matchId}
          currentUserId={user.id}
          otherProfile={otherProfile}
          initialMessages={messages}
          realtime={!isDemoBackend()}
        />
        <aside className="space-y-4">
          <MatchProfileCard profile={otherProfile} />
        </aside>
      </div>
    </I18nProvider>
  );
}
