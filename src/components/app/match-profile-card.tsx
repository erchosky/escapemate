"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Profile } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/app/avatar";
import { ModerationActions } from "@/components/app/moderation-actions";
import { useTranslations } from "@/components/app/i18n-provider";
import {
  PlayerProfileBadges,
  PlayerProfileModal,
  PlayerProfileStats,
  PlayerTarkovStats,
} from "@/components/app/player-profile";

export function MatchProfileCard({ profile }: { profile: Profile }) {
  const matchesT = useTranslations("matches");
  const profileT = useTranslations("profile");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const discordHref = profile.discord_id ? `https://discord.com/users/${profile.discord_id}` : null;
  const leave = () => router.push("/matches");

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Avatar
            name={profile.nickname}
            src={profile.avatar_url}
            seed={profile.id}
            sizes="56px"
            className="h-14 w-14 shrink-0 rounded-lg"
            textClassName="text-lg"
          />
          <h2 className="min-w-0 truncate text-xl font-semibold text-zinc-50">{profile.nickname}</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{profile.bio || profileT("emptyBio")}</p>
        <div className="mt-4">
          <PlayerProfileBadges profile={profile} />
        </div>
        <div className="mt-4">
          <PlayerProfileStats profile={profile} compact />
        </div>
        <div className="mt-4">
          <PlayerTarkovStats profile={profile} compact />
        </div>
        <div className="mt-5 grid gap-3">
          <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
            {matchesT("viewFullProfile")}
          </Button>
          {discordHref ? (
            <Button asChild className="w-full" variant="secondary">
              <Link href={discordHref} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {profileT("openDiscord")}
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>
      <Card className="p-5">
        <ModerationActions profile={profile} onBlocked={leave} />
      </Card>
      <PlayerProfileModal profile={open ? profile : null} matched onClose={() => setOpen(false)} onBlocked={leave} />
    </>
  );
}
