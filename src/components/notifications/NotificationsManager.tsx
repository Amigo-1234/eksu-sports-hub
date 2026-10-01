"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet } from "@/components/operator/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { BellIcon, HeartIcon } from "@/components/ui/icons";
import { formatShortDate, formatTime } from "@/lib/format";
import { MATCH_DEFAULTS, PREF_KEYS, summarisePrefs, type FollowedMatch, type FollowedTeam } from "@/lib/notifications/prefs";
import { AlertPrefsSheet } from "./AlertPrefsSheet";
import { useAlerts } from "./AlertsProvider";

const ENDED = ["FT", "CANCELLED", "ABANDONED"];
const STATUS_TEXT: Record<string, string> = {
  "1H": "Live",
  HT: "Half-time",
  "2H": "Live",
  FT: "Full-time",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  ABANDONED: "Abandoned",
};

type Editing = { kind: "match"; item: FollowedMatch } | { kind: "team"; item: FollowedTeam } | null;

/** /notifications — everything this device follows, and the browser's permission state. */
export function NotificationsManager() {
  const alerts = useAlerts();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { refresh } = alerts;

  // This page always asks the server (the local cache is only a first-paint hint).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!alerts.available) {
    return (
      <EmptyState
        icon={<BellIcon size={22} />}
        title="Match alerts are coming soon"
        description="Live notifications for goals, kick-offs and results aren't switched on yet. Check back soon."
      />
    );
  }

  const { matches, teams } = alerts.state;
  const upcoming = matches.filter((m) => !ENDED.includes(m.status)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = matches.filter((m) => ENDED.includes(m.status));
  const hasAny = matches.length > 0 || teams.length > 0;

  async function run(key: string, fn: () => Promise<boolean>, done?: string) {
    setBusy(key);
    try {
      if ((await fn()) && done) alerts.toast(done);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PermissionCard />

      <section aria-labelledby="n-teams">
        <h2 id="n-teams" className="mb-2 font-display text-xl font-extrabold tracking-tight uppercase">
          Teams you follow
        </h2>
        {teams.length === 0 ? (
          <EmptyState
            compact
            icon={<HeartIcon size={22} />}
            title="No teams yet"
            description="Follow a team from its page to get alerts for all of its matches."
            action={{ href: "/competitions", label: "Find a team" }}
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface" data-testid="followed-teams">
            {teams.map((t) => (
              <Row
                key={t.team_id}
                title={<Link href={`/teams/${t.team_id}`} className="hover:underline">{t.name}</Link>}
                detail={t.enabled ? summarisePrefs(t.events) : "Paused"}
                actions={
                  <>
                    <RowButton onClick={() => setEditing({ kind: "team", item: t })}>Edit</RowButton>
                    <RowButton danger disabled={busy !== null} onClick={() => run(`t:${t.team_id}`, () => alerts.unfollowTeam(t.team_id), `Unfollowed ${t.name}`)}>
                      Unfollow
                    </RowButton>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="n-matches">
        <h2 id="n-matches" className="mb-2 font-display text-xl font-extrabold tracking-tight uppercase">
          Matches you follow
        </h2>
        {matches.length === 0 ? (
          <EmptyState
            compact
            icon={<BellIcon size={22} />}
            title="No matches yet"
            description="Tap “Notify me” on any match to get its kick-off, goals and result."
            action={{ href: "/fixtures", label: "See fixtures" }}
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface" data-testid="followed-matches">
            {[...upcoming, ...past].map((m) => (
              <Row
                key={m.match_id}
                title={
                  <Link href={`/matches/${m.match_id}`} className="hover:underline">
                    {m.home} vs {m.away}
                  </Link>
                }
                meta={`${m.competition} · ${STATUS_TEXT[m.status] ?? `${formatShortDate(m.scheduled_at)}, ${formatTime(m.scheduled_at)}`}`}
                detail={m.enabled ? summarisePrefs(m.events) : "Muted for this match"}
                actions={
                  <>
                    {!ENDED.includes(m.status) && <RowButton onClick={() => setEditing({ kind: "match", item: m })}>Edit</RowButton>}
                    <RowButton danger disabled={busy !== null} onClick={() => run(`m:${m.match_id}`, () => alerts.removeMatch(m.match_id), "Match removed")}>
                      Remove
                    </RowButton>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      {(hasAny || alerts.state.push_enabled) && (
        <section className="rounded-card border border-line bg-surface p-4">
          <h2 className="font-display text-lg font-extrabold tracking-tight uppercase">Turn everything off</h2>
          <p className="mt-1 text-sm text-ink-muted">Stops all alerts on this device and removes every team and match you follow.</p>
          <button
            type="button"
            onClick={() => setConfirmOff(true)}
            className="mt-3 h-11 rounded-xl border border-live/40 px-4 text-sm font-bold text-live hover:bg-live-soft"
          >
            Disable all notifications
          </button>
        </section>
      )}

      <p className="text-xs leading-relaxed text-ink-faint">
        No account needed. Your alert settings are linked to this browser only — we don&apos;t collect your name, number or
        email. Clearing this site&apos;s data resets them.
      </p>

      {editing?.kind === "match" && (
        <AlertPrefsSheet
          open
          onClose={() => setEditing(null)}
          title="Match alerts"
          subtitle={<>Alerts for <strong className="text-ink">{editing.item.home} vs {editing.item.away}</strong>.</>}
          initial={editing.item.enabled && editing.item.events.length ? editing.item.events : MATCH_DEFAULTS}
          options={PREF_KEYS}
          primaryLabel={alerts.pushOn ? "Save" : "Turn on alerts"}
          onSave={(events) => alerts.saveMatch(editing.item.match_id, true, events)}
        />
      )}
      {editing?.kind === "team" && (
        <AlertPrefsSheet
          open
          onClose={() => setEditing(null)}
          title="Team alerts"
          subtitle={<>Alerts for every <strong className="text-ink">{editing.item.name}</strong> match.</>}
          initial={editing.item.events}
          options={PREF_KEYS}
          primaryLabel={alerts.pushOn ? "Save" : "Turn on alerts"}
          onSave={(events) => alerts.saveTeam(editing.item.team_id, events)}
        />
      )}
      <Sheet
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Disable all notifications?"
        closeLabel="Cancel"
        footer={
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run("all", async () => {
                const ok = await alerts.disableAll();
                if (ok) setConfirmOff(false);
                return ok;
              }, "All notifications are off")
            }
            className="h-12 w-full rounded-xl bg-live text-base font-bold text-white disabled:opacity-50"
          >
            {busy === "all" ? "Turning off…" : "Disable all notifications"}
          </button>
        }
      >
        <p className="text-[15px] text-ink-muted">
          You&apos;ll stop receiving alerts on this device, and every team and match you follow here will be removed.
        </p>
      </Sheet>
    </div>
  );
}

function PermissionCard() {
  const alerts = useAlerts();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const s = alerts.support;

  let state: "Enabled" | "Disabled" | "Blocked" | "Not supported" | "Checking";
  let body: ReactNode;
  let action: ReactNode = null;

  if (!s) {
    state = "Checking";
    body = "Checking what this browser supports…";
  } else if (s.kind === "ios-install") {
    state = "Disabled";
    body = "On iPhone and iPad, alerts work once EKSU Sports is added to your Home Screen.";
    action = <PrimaryButton onClick={alerts.showIosInstall}>Show me how</PrimaryButton>;
  } else if (s.kind === "unsupported") {
    state = "Not supported";
    body = "Push notifications aren't supported in this browser yet. Try the latest Chrome, Edge, Firefox or Safari.";
  } else if (alerts.permission === "denied") {
    state = "Blocked";
    body =
      "Notifications are blocked for this site, so we can't send alerts. To turn them on, allow notifications for this site in your browser or device settings, then reload this page.";
  } else if (alerts.pushOn) {
    state = "Enabled";
    body = "This device can receive live match alerts.";
  } else {
    state = "Disabled";
    body = "Turn on notifications to get alerts for the teams and matches you follow.";
    action = (
      <PrimaryButton
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await alerts.enablePush();
          setBusy(false);
          if (r.ok) alerts.toast("Notifications on");
          else if (r.reason === "error") setMsg(r.message ?? "Something went wrong. Please try again.");
          else if (r.reason === "dismissed") setMsg("No problem — nothing was turned on.");
        }}
      >
        {busy ? "Turning on…" : "Enable notifications"}
      </PrimaryButton>
    );
  }

  const tone =
    state === "Enabled" ? "bg-win/10 text-win" : state === "Blocked" ? "bg-live-soft text-live" : "bg-subtle text-ink-muted";
  return (
    <section aria-labelledby="n-status" className="rounded-card border border-line bg-surface p-4" data-testid="permission-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="n-status" className="font-display text-lg font-extrabold tracking-tight uppercase">
          Notifications on this device
        </h2>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${tone}`} data-testid="permission-state">
          {state}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
      {msg && (
        <p className="mt-2 text-sm font-semibold text-ink" role="status">
          {msg}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </section>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 rounded-xl bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Row({ title, meta, detail, actions }: { title: ReactNode; meta?: string; detail: string; actions: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-[1_1_12rem]">
        <p className="truncate text-[15px] font-bold text-ink">{title}</p>
        {meta && <p className="truncate text-xs text-ink-faint">{meta}</p>}
        <p className="mt-0.5 text-sm text-ink-muted">{detail}</p>
      </div>
      <div className="flex shrink-0 gap-2">{actions}</div>
    </li>
  );
}

function RowButton({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-9 rounded-lg border px-3 text-sm font-bold disabled:opacity-50 ${
        danger ? "border-live/30 text-live hover:bg-live-soft" : "border-line text-ink hover:bg-subtle"
      }`}
    >
      {children}
    </button>
  );
}
