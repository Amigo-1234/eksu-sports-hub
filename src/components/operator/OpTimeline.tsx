"use client";

import type { Intent, IntentState } from "@/lib/operator/queue";
import type { AssignmentSeed, OpEvent, OpLogEntry, OpMatchState, PauseReason } from "@/lib/operator/types";
import { CardGlyph } from "./CardGlyph";
import { EVENT_LABEL, PAUSE_LABEL } from "./labels";

type Sync = IntentState | "VOIDED";

const SYNC: Record<Sync, { text: string; cls: string; icon: string }> = {
  CONFIRMED: { text: "Synced", cls: "text-win", icon: "✓" },
  PENDING: { text: "Queued", cls: "text-accent-700", icon: "◷" },
  SENDING: { text: "Sending", cls: "text-accent-700", icon: "↻" },
  FAILED: { text: "Failed", cls: "text-live", icon: "!" },
  VOIDED: { text: "Voided", cls: "text-ink-muted", icon: "⊘" },
};

function EventIcon({ e }: { e: OpEvent }) {
  if (e.type === "YELLOW_CARD") return <CardGlyph kind="YELLOW" size={26} />;
  if (e.type === "RED_CARD") return <CardGlyph kind="RED" size={26} />;
  if (e.type === "SECOND_YELLOW") return <CardGlyph kind="SECOND_YELLOW" size={26} />;
  if (e.type === "SUBSTITUTION") return <span className="text-xl font-black">⇅</span>;
  if (e.type === "PENALTY_MISS") return <span className="text-lg font-black">✕</span>;
  return <span className="text-xl">⚽︎</span>;
}

function logText(l: OpLogEntry): string | null {
  switch (l.kind) {
    case "MATCH_STARTED":
      return "Kick-off · 1st half started";
    case "PERIOD_ENDED":
      return "Half-time";
    case "PERIOD_STARTED":
      return "2nd half started";
    case "MATCH_FINALISED":
      return `Full-time · ${l.detail?.replace("-", "–")}`;
    case "PAUSED":
      return `Clock paused · ${PAUSE_LABEL[l.detail as PauseReason] ?? l.detail}`;
    case "RESUMED":
      return "Clock resumed";
    case "OPERATOR_TAKEOVER":
      return "Operator control changed";
    case "STOPPAGE_SET":
      return l.detail === "+0" ? "Stoppage cleared" : `Stoppage announced ${l.detail}`;
    default:
      return null; // voids are shown on the event itself
  }
}

/** Newest first. Events show their sync state; voided events stay visible. */
export function OpTimeline({ seed, state, intents }: { seed: AssignmentSeed; state: OpMatchState; intents: Intent[] }) {
  const byIntent = new Map(intents.map((i) => [i.id, i.state]));
  type Item = { kind: "event"; at: number; minute: number; e: OpEvent } | { kind: "log"; at: number; minute: number; l: OpLogEntry };
  const items: Item[] = [
    ...state.events.map((e) => ({ kind: "event" as const, at: e.recordedAt, minute: e.minute * 100 + e.addedTime, e })),
    ...state.log.filter((l) => logText(l)).map((l) => ({ kind: "log" as const, at: l.at, minute: 0, l })),
  ].sort((a, b) => b.at - a.at || b.minute - a.minute);

  if (!items.length) {
    return <p className="rounded-xl border-2 border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">No events yet.</p>;
  }

  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border-2 border-line bg-surface" aria-label="Match events, newest first">
      {items.map((item) => {
        if (item.kind === "log") {
          return (
            <li key={item.l.id} className="bg-subtle/70 px-3 py-2 text-center text-xs font-extrabold tracking-wide text-ink-muted uppercase">
              {logText(item.l)}
            </li>
          );
        }
        const e = item.e;
        const team = e.side === "home" ? seed.match.homeTeam : seed.match.awayTeam;
        const sync: Sync = e.voided ? "VOIDED" : e.intentId ? byIntent.get(e.intentId) ?? "CONFIRMED" : "CONFIRMED";
        const s = SYNC[sync];
        return (
          <li key={e.id} className={`grid grid-cols-[3.25rem_2rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 ${e.voided ? "bg-subtle" : ""}`}>
            <span className="font-display text-lg font-extrabold tabular-nums">
              {e.minute}
              {e.addedTime ? `+${e.addedTime}` : ""}&apos;
            </span>
            <span className="grid place-items-center" aria-hidden="true"><EventIcon e={e} /></span>
            <div className="min-w-0">
              <div className={e.voided ? "line-through decoration-2" : undefined}>
              <p className="truncate text-sm font-extrabold">
                {EVENT_LABEL[e.type]} · {team.code}
                <span className="font-semibold text-ink-muted"> ({e.side === "home" ? "H" : "A"})</span>
              </p>
              <p className="truncate text-xs font-semibold text-ink-muted">
                {e.type === "SUBSTITUTION"
                  ? `↑ No. ${e.shirtIn ?? "?"} on · ↓ No. ${e.shirt ?? "?"} off`
                  : e.shirt !== null ? `No. ${e.shirt}${e.type === "OWN_GOAL" ? " (own goal)" : ""}` : "Player not recorded"}
              </p>
              </div>
              {e.voided && <p className="text-xs font-bold text-ink">{e.voided.reason}</p>}
            </div>
            <span className={`text-right text-xs font-extrabold uppercase ${s.cls}`}>
              <span aria-hidden="true">{s.icon} </span>{s.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
