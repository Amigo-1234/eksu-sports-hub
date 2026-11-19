"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TeamCrest } from "@/components/team/TeamCrest";
import { CommentIcon, FlagIcon, HeartIcon, ReplyIcon, SendIcon, TrashIcon } from "@/components/ui/icons";
import type { FanAction, FanComment, FanFeed, FanTargetKind } from "@/lib/fan/types";
import type { Team } from "@/lib/types";
import { FanGames } from "./FanGames";
import { NameForm } from "./NameForm";

export { NameForm };

type VoteTeam = Pick<Team, "id" | "code" | "colors" | "name" | "shortName">;

interface Props {
  kind: FanTargetKind;
  id: string;
  /** Match only: the two sides, and whether "Who will win?" is still open. */
  teams?: { home: VoteTeam; away: VoteTeam };
  voteOpen?: boolean;
  /** Poll for new banter (match pages while live). */
  live?: boolean;
}

const BODY_MAX = 500;
const AVATAR = ["#0f766e", "#7c3aed", "#b45309", "#be123c", "#1d4ed8", "#15803d", "#a21caf", "#0e7490"];

function avatarColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(new Date(iso));
}

export async function call(kind: FanTargetKind, id: string, body?: FanAction): Promise<{ ok: boolean; status: number; data: FanFeed & { error?: string } }> {
  const res = body
    ? await fetch("/api/fan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, ...body }) })
    : await fetch(`/api/fan?kind=${kind}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({ error: "Fan Zone is not available right now." }));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Fan Zone: like, "Who will win?", and banter (comments with one level of
 * replies). No account — the browser's device cookie plus the light sign-in
 * name. Reported comments disappear after three reports.
 */
export function FanZone({ kind, id, teams, voteOpen = false, live = false }: Props) {
  const [feed, setFeed] = useState<FanFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<"new" | "top">("new");
  const [replyTo, setReplyTo] = useState<FanComment | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await call(kind, id);
      if (r.ok) {
        setFeed(r.data);
        setNow(Date.now());
      } else if (r.status === 503 || r.status === 404) setUnavailable(true);
    } catch {
      /* offline: keep what we have */
    }
  }, [kind, id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const every = live ? 15_000 : 60_000;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, every);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, live]);

  const act = useCallback(
    async (body: FanAction, optimistic?: (f: FanFeed) => FanFeed) => {
      setError(null);
      if (optimistic) setFeed((f) => (f ? optimistic(f) : f));
      try {
        const r = await call(kind, id, body);
        if (r.ok) {
          setFeed(r.data);
          setNow(Date.now());
          return true;
        }
        setError(r.data.error ?? "Something went wrong. Try again.");
        if (optimistic) load();
        return false;
      } catch {
        setError("You're offline. Try again when you're connected.");
        if (optimistic) load();
        return false;
      }
    },
    [kind, id, load],
  );

  if (unavailable) return null;

  const toggleLike = () =>
    act({ action: feed?.liked ? "unlike" : "like" }, (f) => ({ ...f, liked: !f.liked, likes: f.likes + (f.liked ? -1 : 1) }));

  const comments = feed ? [...feed.comments] : [];
  if (sort === "top") comments.sort((a, b) => b.likes + (b.replies?.length ?? 0) - (a.likes + (a.replies?.length ?? 0)));

  return (
    <section id="comments" aria-labelledby={`fan-${id}`} className="scroll-mt-28 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`fan-${id}`} className="font-display text-xl font-extrabold tracking-wide uppercase">
          Fan Zone
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLike}
            disabled={!feed}
            aria-pressed={feed?.liked ?? false}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors disabled:opacity-50 ${
              feed?.liked ? "border-live/40 bg-live/10 text-live" : "border-line bg-surface text-ink hover:bg-subtle"
            }`}
          >
            <HeartIcon size={17} filled={feed?.liked} />
            <span className="tabular-nums">{feed?.likes ?? 0}</span>
            <span className="sr-only">{feed?.liked ? "Unlike" : "Like"}</span>
          </button>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-bold">
            <CommentIcon size={16} />
            <span className="tabular-nums">{feed?.comment_count ?? 0}</span>
            <span className="sr-only">comments</span>
          </span>
        </div>
      </div>

      {kind === "match" && teams && <FanGames matchId={id} teams={teams} name={feed?.name ?? null} onSignedIn={load} live={live} />}

      {kind === "match" && teams && feed?.vote && (
        <VoteCard teams={teams} vote={feed.vote} open={voteOpen} onVote={(pick) => act({ action: "vote", pick })} />
      )}

      <Composer
        name={feed?.name ?? null}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        busy={busy}
        onSignedIn={load}
        onSubmit={async (body) => {
          setBusy(true);
          const ok = await act({ action: "comment", body, parent_id: replyTo?.id ?? null });
          setBusy(false);
          if (ok) setReplyTo(null);
          return ok;
        }}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-live/10 px-3 py-2 text-sm font-medium text-live">
          {error}
        </p>
      )}

      {feed && feed.comments.length > 0 && (
        <div className="rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="text-xs font-bold tracking-wide text-ink-muted uppercase">Banter</span>
            <div role="group" aria-label="Sort comments" className="flex rounded-full bg-subtle p-0.5 text-xs font-bold">
              {(["new", "top"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => setSort(s)}
                  className={`rounded-full px-3 py-1 ${sort === s ? "bg-surface text-ink shadow-sm" : "text-ink-faint"}`}
                >
                  {s === "new" ? "Newest" : "Top"}
                </button>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-line">
            {comments.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <CommentRow c={c} now={now} onAct={act} onReply={() => setReplyTo(c)} />
                {c.replies && c.replies.length > 0 && (
                  <ul className="mt-3 space-y-3 border-l-2 border-line pl-3 sm:ml-11">
                    {c.replies.map((r) => (
                      <li key={r.id}>
                        <CommentRow c={r} now={now} onAct={act} small />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {feed && feed.comments.length === 0 && (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
          No banter yet. Start it off.
        </p>
      )}
      {!feed && <div className="h-28 animate-pulse rounded-card bg-subtle" aria-hidden="true" />}
    </section>
  );
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: avatarColor(name) }}
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white uppercase ${small ? "size-7 text-xs" : "size-8 text-sm"}`}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function CommentRow({
  c,
  now,
  onAct,
  onReply,
  small,
}: {
  c: FanComment;
  now: number;
  onAct: (b: FanAction, o?: (f: FanFeed) => FanFeed) => Promise<boolean>;
  onReply?: () => void;
  small?: boolean;
}) {
  const [reported, setReported] = useState(false);
  const like = () =>
    onAct({ action: c.liked ? "unlike_comment" : "like_comment", comment_id: c.id }, (f) => ({
      ...f,
      comments: f.comments.map(function patch(x): FanComment {
        if (x.id === c.id) return { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) };
        return x.replies ? { ...x, replies: x.replies.map(patch) } : x;
      }),
    }));
  return (
    <div className="flex gap-3">
      <Avatar name={c.name} small={small} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight">
          <span className="font-bold">{c.name}</span>
          {c.mine && <span className="ml-1.5 rounded bg-brand-50 px-1 text-[10px] font-bold text-brand-fg uppercase">You</span>}
          <span className="ml-1.5 text-xs text-ink-faint">
            <time dateTime={c.at}>{now ? ago(c.at, now) : ""}</time>
          </span>
        </p>
        <p className="mt-0.5 text-[15px] leading-snug break-words whitespace-pre-line">{c.body}</p>
        <div className="mt-1.5 flex items-center gap-4 text-xs font-bold text-ink-faint">
          <button type="button" onClick={like} aria-pressed={c.liked} className={`inline-flex items-center gap-1 ${c.liked ? "text-live" : "hover:text-ink"}`}>
            <HeartIcon size={14} filled={c.liked} />
            {c.likes > 0 && <span className="tabular-nums">{c.likes}</span>}
            <span className="sr-only">{c.liked ? "Unlike comment" : "Like comment"}</span>
          </button>
          {onReply && (
            <button type="button" onClick={onReply} className="inline-flex items-center gap-1 hover:text-ink">
              <ReplyIcon size={14} /> Reply
            </button>
          )}
          {c.mine ? (
            <button
              type="button"
              onClick={() => confirm("Delete your comment?") && onAct({ action: "delete", comment_id: c.id })}
              className="inline-flex items-center gap-1 hover:text-ink"
            >
              <TrashIcon size={14} /> Delete
            </button>
          ) : (
            <button
              type="button"
              disabled={reported}
              onClick={async () => {
                if (!confirm("Report this comment as abusive or spam?")) return;
                if (await onAct({ action: "report", comment_id: c.id })) setReported(true);
              }}
              className="inline-flex items-center gap-1 hover:text-ink disabled:opacity-60"
            >
              <FlagIcon size={14} /> {reported ? "Reported" : "Report"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Comment box (asks for a name first). `bare`: no card chrome, for news cards. */
export function Composer({
  name,
  replyTo,
  onCancelReply,
  busy,
  onSubmit,
  onSignedIn,
  bare = false,
}: {
  name: string | null;
  replyTo: FanComment | null;
  onCancelReply: () => void;
  busy: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onSignedIn: () => void;
  bare?: boolean;
}) {
  const shell = bare ? "" : "rounded-card border border-line bg-surface p-3";
  const [body, setBody] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) ref.current?.focus();
  }, [replyTo]);

  if (!name) return <NameForm onSignedIn={onSignedIn} className={shell} />;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim() || busy) return;
        if (await onSubmit(body)) setBody("");
      }}
      className={bare ? "" : `${shell} focus-within:border-brand-400`}
    >
      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-subtle px-2.5 py-1.5 text-xs">
          <span className="min-w-0 truncate">
            Replying to <b>{replyTo.name}</b>: {replyTo.body}
          </span>
          <button type="button" onClick={onCancelReply} className="shrink-0 font-bold text-brand-fg">
            Cancel
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Avatar name={name} />
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          placeholder={replyTo ? `Reply to ${replyTo.name}…` : `Say something, ${name}…`}
          aria-label="Write a comment"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-2xl bg-subtle px-3.5 py-2.5 text-[16px] leading-snug outline-none ring-brand-500/50 transition-shadow focus:ring-2 [field-sizing:content]"
        />
        <button
          type="submit"
          disabled={!body.trim() || busy}
          aria-label="Post comment"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition-opacity disabled:opacity-40"
        >
          <SendIcon size={18} />
        </button>
      </div>
      <p className={`mt-1.5 flex justify-between text-[11px] text-ink-faint ${bare && body.length < BODY_MAX - 80 ? "hidden" : ""}`}>
        <span>{bare ? "" : "Keep it banter, not abuse. No links."}</span>
        {body.length > BODY_MAX - 80 && <span className="tabular-nums">{BODY_MAX - body.length}</span>}
      </p>
    </form>
  );
}

function VoteCard({
  teams,
  vote,
  open,
  onVote,
}: {
  teams: { home: VoteTeam; away: VoteTeam };
  vote: NonNullable<FanFeed["vote"]>;
  open: boolean;
  onVote: (pick: "HOME" | "DRAW" | "AWAY") => void;
}) {
  const total = vote.home + vote.draw + vote.away;
  const showResults = !!vote.mine || !open;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const options = [
    { pick: "HOME" as const, label: teams.home.shortName, n: vote.home, team: teams.home },
    { pick: "DRAW" as const, label: "Draw", n: vote.draw, team: null },
    { pick: "AWAY" as const, label: teams.away.shortName, n: vote.away, team: teams.away },
  ];
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-xs font-bold tracking-wide text-ink-muted uppercase">Who will win?</h3>
        <span className="text-xs text-ink-faint">
          {total} {total === 1 ? "vote" : "votes"}
          {!open && " · closed"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const mine = vote.mine === o.pick;
          return (
            <button
              key={o.pick}
              type="button"
              disabled={!open}
              aria-pressed={mine}
              onClick={() => onVote(o.pick)}
              className={`relative flex flex-col items-center gap-1 overflow-hidden rounded-lg border px-2 py-2.5 text-sm font-bold transition-colors disabled:cursor-default ${
                mine ? "border-brand-500 bg-brand-50 text-brand-fg" : "border-line hover:bg-subtle"
              }`}
            >
              {showResults && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-brand-500/15 transition-[height]" style={{ height: `${pct(o.n)}%` }} />
              )}
              {o.team ? (
                <TeamCrest team={o.team} size="sm" />
              ) : (
                <span className="grid size-6 place-items-center text-base leading-none" aria-hidden="true">
                  =
                </span>
              )}
              <span className="relative max-w-full truncate">{o.label}</span>
              {showResults && <span className="relative text-xs tabular-nums text-ink-muted">{pct(o.n)}%</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

