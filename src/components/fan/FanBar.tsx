"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CommentIcon, HeartIcon } from "@/components/ui/icons";
import type { FanFeed } from "@/lib/fan/types";
import { Avatar, call, Composer } from "./FanZone";

/**
 * Like / comment bar under a news card: like in place, see the counts and the
 * latest comment, and comment straight from the feed. Loads only when the
 * card scrolls into view.
 */
export function FanBar({ id, href, composer = true }: { id: string; href: string; composer?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [feed, setFeed] = useState<FanFeed | null>(null);
  const [off, setOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await call("news", id);
      if (r.ok) setFeed(r.data);
      else setOff(true);
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per card
  }, [id]);

  if (off) return null;

  const like = async () => {
    if (!feed) return;
    setFeed({ ...feed, liked: !feed.liked, likes: feed.likes + (feed.liked ? -1 : 1) });
    const r = await call("news", id, { action: feed.liked ? "unlike" : "like" }).catch(() => null);
    if (r?.ok) setFeed(r.data);
  };

  const latest = feed?.comments[0];

  return (
    <div ref={ref} className="border-t border-line px-3 pt-2 pb-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={like}
          disabled={!feed}
          aria-pressed={feed?.liked ?? false}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-bold transition-colors hover:bg-subtle disabled:opacity-60 ${
            feed?.liked ? "text-live" : "text-ink-muted"
          }`}
        >
          <HeartIcon size={19} filled={feed?.liked} />
          <span className="tabular-nums">{feed?.likes ?? 0}</span>
          <span className="sr-only">{feed?.liked ? "Unlike story" : "Like story"}</span>
        </button>
        <Link href={`${href}#comments`} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-bold text-ink-muted hover:bg-subtle">
          <CommentIcon size={18} />
          <span className="tabular-nums">{feed?.comment_count ?? 0}</span>
          <span className="sr-only">comments</span>
        </Link>
        {feed && feed.comment_count > 0 && (
          <Link href={`${href}#comments`} className="ml-auto text-xs font-bold text-brand-fg hover:underline">
            View {feed.comment_count === 1 ? "comment" : `all ${feed.comment_count} comments`}
          </Link>
        )}
      </div>
      {latest && (
        <Link href={`${href}#comments`} className="mt-1 flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-subtle">
          <Avatar name={latest.name} small />
          <p className="line-clamp-2 min-w-0 text-sm leading-snug">
            <b>{latest.name}</b> {latest.body}
          </p>
        </Link>
      )}
      {composer && feed && (
        <div className="mt-2">
          <Composer
            bare
            name={feed.name}
            replyTo={null}
            onCancelReply={() => {}}
            busy={busy}
            onSignedIn={load}
            onSubmit={async (body) => {
              setBusy(true);
              setError(null);
              const r = await call("news", id, { action: "comment", body }).catch(() => null);
              setBusy(false);
              if (r?.ok) {
                setFeed(r.data);
                return true;
              }
              setError(r?.data.error ?? "Could not post. Try again.");
              return false;
            }}
          />
          {error && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-live">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
