"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Copy, ExternalLink, Send } from "lucide-react";
import { loadOlderMessages, loadRecentMessages, sendMessage } from "@/lib/actions/chat";
import { resolveChatErrorCode, type ChatErrorCode } from "@/lib/action-feedback";
import type { Message, Profile } from "@/lib/constants";
import { dateTimeLocale, formatTime } from "@/lib/i18n/format";
import { Avatar } from "@/components/app/avatar";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import { useI18n, useTranslations } from "@/components/app/i18n-provider";

type SupabaseBrowserClient = ReturnType<typeof import("@/lib/supabase/client").createClient>;

function mergeMessages(current: Message[], incoming: Message[]) {
  const known = new Set(current.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id));
  if (!fresh.length) return current;
  return [...current, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ChatPanel({
  matchId,
  currentUserId,
  otherProfile,
  initialMessages,
  realtime = true,
}: {
  matchId: string;
  currentUserId: string;
  otherProfile: Profile;
  initialMessages: Message[];
  realtime?: boolean;
}) {
  const chatT = useTranslations("chat");
  const errorsT = useTranslations("errors");
  const { locale } = useI18n();
  const [messages, setMessages] = useState(initialMessages);
  const [seenInitial, setSeenInitial] = useState(initialMessages);

  // Next 16 keeps visited pages alive (hidden) with <Activity>. Coming back re-renders the
  // server component with fresh messages, so fold them into the preserved client state.
  if (initialMessages !== seenInitial) {
    setSeenInitial(initialMessages);
    setMessages((items) => mergeMessages(items, initialMessages));
  }
  const [error, setError] = useState<ChatErrorCode | null>(null);
  const [hasMore, setHasMore] = useState(initialMessages.length === 30);
  const [connectionState, setConnectionState] = useState<"online" | "offline" | "reconnecting">("online");
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoadingOlder, startLoadingOlder] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dayFormatter = new Intl.DateTimeFormat(dateTimeLocale(locale), { weekday: "long", day: "numeric", month: "long" });

  function autosize() {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }

  function isNearBottom() {
    const node = scrollRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  }

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setHasNewMessages(false);
  }

  useEffect(() => {
    if (!realtime) return;

    // New messages arrive through a private Broadcast channel fed by a database trigger.
    // Realtime checks the realtime.messages policy once when joining, not once per message.
    // supabase-js (~260 KB with Realtime) is only loaded once a chat actually connects.
    let supabase: SupabaseBrowserClient | null = null;
    let channel: ReturnType<SupabaseBrowserClient["channel"]> | null = null;
    let cancelled = false;
    let dropped = false;

    function onIncoming(message: Message) {
      const shouldStick = isNearBottom();
      setMessages((items) => mergeMessages(items, [message]));
      if (shouldStick) {
        window.requestAnimationFrame(() => scrollToBottom());
      } else {
        setHasNewMessages(true);
      }
    }

    async function connect() {
      const { createClient } = await import("@/lib/supabase/client");
      if (cancelled) return;
      supabase = createClient();
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel(`match:${matchId}`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, ({ payload }) => {
          const record = (payload as { record?: Message } | undefined)?.record;
          if (record?.id && record.match_id === matchId) onIncoming(record);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnectionState("online");
            if (dropped) {
              dropped = false;
              void loadRecentMessages(matchId).then((result) => {
                if (result.ok) setMessages((items) => mergeMessages(items, result.messages));
              });
            }
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            dropped = true;
            if (!cancelled) setConnectionState("reconnecting");
          }
        });
    }

    void connect();

    return () => {
      cancelled = true;
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [matchId, realtime]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, []);

  useEffect(() => {
    function onOnline() {
      setConnectionState(realtime ? "reconnecting" : "online");
    }

    function onOffline() {
      setConnectionState("offline");
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [realtime]);

  async function copyDiscord() {
    if (!otherProfile.discord_username) return;
    try {
      await navigator.clipboard.writeText(otherProfile.discord_username);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 lg:h-[calc(100dvh-8rem)]">
      <div className="flex items-center gap-3 border-b border-zinc-800 p-3 sm:p-4">
        <Button asChild variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label={chatT("back")}>
          <Link href="/matches">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Avatar
          name={otherProfile.nickname}
          src={otherProfile.avatar_url}
          seed={otherProfile.id}
          sizes="40px"
          className="h-10 w-10 shrink-0 rounded-full"
          textClassName="text-sm"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-zinc-50">{otherProfile.nickname}</h1>
          <p className="truncate text-sm text-zinc-400">
            {otherProfile.discord_username ? `Discord: ${otherProfile.discord_username}` : chatT("discordConnected")}
          </p>
        </div>
        {otherProfile.discord_username ? (
          <Button type="button" variant="outline" size="sm" onClick={copyDiscord} title={chatT("copyDiscord")}>
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">{copied ? chatT("copied") : chatT("copyDiscord")}</span>
          </Button>
        ) : null}
        {otherProfile.discord_id ? (
          <Button asChild variant="outline" size="icon" title={chatT("openDiscord")} aria-label={chatT("openDiscord")}>
            <Link href={`https://discord.com/users/${otherProfile.discord_id}`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>
      {connectionState !== "online" || error ? (
        <div className="border-b border-zinc-800 px-4 py-2 text-sm">
          {connectionState !== "online" ? (
            <p className="text-amber-200">{connectionState === "offline" ? chatT("offline") : chatT("reconnecting")}</p>
          ) : null}
          {error ? <p className="text-red-300">{errorsT(error)}</p> : null}
        </div>
      ) : null}
      <div ref={scrollRef} className="relative flex max-h-[60dvh] min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 lg:max-h-none">
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            className="mx-auto"
            disabled={isLoadingOlder || !messages[0]?.created_at}
            onClick={() => {
              const cursor = messages[0]?.created_at;
              if (!cursor) return;

              startLoadingOlder(async () => {
                setError(null);
                const result = await loadOlderMessages(matchId, cursor);
                if (!result.ok) {
                  setError(resolveChatErrorCode(result.error));
                  return;
                }

                setMessages((items) => mergeMessages(items, result.messages));
                setHasMore(result.hasMore);
              });
            }}
          >
            {isLoadingOlder ? chatT("loading") : chatT("loadOlder")}
          </Button>
        ) : null}
        {messages.length ? (
          messages.map((message, index) => {
            const mine = message.sender_id === currentUserId;
            const day = dayFormatter.format(new Date(message.created_at));
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const showDay = !previous || dayFormatter.format(new Date(previous.created_at)) !== day;
            // Consecutive messages from the same player within 5 minutes share one timestamp.
            const endsGroup =
              !next ||
              next.sender_id !== message.sender_id ||
              new Date(next.created_at).getTime() - new Date(message.created_at).getTime() > 5 * 60_000;
            return (
              <div key={message.id} className={endsGroup ? "flex flex-col gap-2" : "-mb-1 flex flex-col gap-2"}>
                {showDay ? (
                  <div className="my-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{day}</div>
                ) : null}
                <div className={mine ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
                  <div
                    className={
                      mine
                        ? "whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-lime-400 px-3 py-2 text-sm text-zinc-950"
                        : "whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                    }
                  >
                    {message.body}
                  </div>
                  {endsGroup ? (
                    <div className={mine ? "mt-1 text-right text-[10px] text-zinc-500" : "mt-1 text-[10px] text-zinc-500"}>
                      {formatTime(message.created_at, locale)}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="m-auto max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-center text-sm text-zinc-400">
            {chatT("empty")}
          </div>
        )}
        <div ref={bottomRef} />
        {hasNewMessages ? (
          <Button
            type="button"
            size="sm"
            className="sticky bottom-2 mx-auto shadow-lg shadow-black/40"
            onClick={() => scrollToBottom()}
          >
            {chatT("newMessages")}
          </Button>
        ) : null}
      </div>
      {!messages.length ? (
        <div className="flex flex-wrap gap-2 border-t border-zinc-800 px-4 pt-3">
          {["suggestions.time", "suggestions.quest", "suggestions.discord"].map((key) => (
            <button
              key={key}
              type="button"
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-lime-400/50 hover:text-lime-100"
              onClick={() => {
                if (!inputRef.current) return;
                inputRef.current.value = chatT(key);
                inputRef.current.focus();
                autosize();
              }}
            >
              {chatT(key)}
            </button>
          ))}
        </div>
      ) : null}
      <form
        ref={formRef}
        action={async (formData) => {
          setError(null);
          const result = await sendMessage(formData);
          if (!result.ok) {
            setError(resolveChatErrorCode(result.error));
            return;
          }
          setMessages((items) => mergeMessages(items, result.messages));
          formRef.current?.reset();
          autosize();
          window.requestAnimationFrame(() => scrollToBottom());
        }}
        className="flex items-end gap-2 border-t border-zinc-800 p-3 sm:p-4"
      >
        <input type="hidden" name="match_id" value={matchId} />
        <textarea
          ref={inputRef}
          name="body"
          rows={1}
          aria-label={chatT("placeholder")}
          placeholder={connectionState === "offline" ? chatT("offlinePlaceholder") : chatT("placeholder")}
          maxLength={1000}
          autoComplete="off"
          required
          disabled={connectionState === "offline"}
          onInput={autosize}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter adds a line; never interrupt IME composition.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20 disabled:opacity-50"
        />
        <PendingButton size="icon" title={chatT("send")} aria-label={chatT("send")} pendingText={chatT("sending")}>
          <Send className="h-4 w-4" />
        </PendingButton>
      </form>
    </section>
  );
}
