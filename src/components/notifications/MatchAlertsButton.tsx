"use client";

import { useState } from "react";
import { BellIcon } from "@/components/ui/icons";
import { effectiveMatchPrefs, MATCH_DEFAULTS, type PrefKey } from "@/lib/notifications/prefs";
import { isLive } from "@/lib/status";
import type { MatchStatus } from "@/lib/types";
import { AlertPrefsSheet, type SheetAction } from "./AlertPrefsSheet";
import { useAlerts } from "./AlertsProvider";

/** Recommended alerts first, optional ones after. */
const MATCH_ORDER: PrefKey[] = ["KICKOFF", "GOAL", "RED_CARD", "HALF_TIME", "FULL_TIME", "STATUS", "YELLOW_CARD", "SECOND_HALF", "REMINDER"];
const ENDED: MatchStatus[] = ["FULL_TIME", "CANCELLED", "ABANDONED"];

interface TeamRef {
  id: string;
  name: string;
  shortName: string;
}

/** "Notify me" on the match centre. Match settings override team follows, including muting. */
export function MatchAlertsButton({ matchId, status, home, away }: { matchId: string; status: MatchStatus; home: TeamRef; away: TeamRef }) {
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  if (!alerts.available || ENDED.includes(status)) return null;

  const eff = effectiveMatchPrefs(alerts.state, matchId, [home.id, away.id]);
  const followed = alerts.state.teams.filter((t) => t.enabled && (t.team_id === home.id || t.team_id === away.id));
  const teamNames = followed.map((t) => t.short_name || t.name).join(" and ");
  const teamEvents = effectiveMatchPrefs({ ...alerts.state, matches: [] }, matchId, [home.id, away.id]).events;
  const on = alerts.pushOn && eff.enabled && eff.events.length > 0;
  const options = isLive(status) ? MATCH_ORDER.filter((k) => k !== "REMINDER" && k !== "KICKOFF") : MATCH_ORDER;

  let initial: PrefKey[] = MATCH_DEFAULTS;
  let note: string | undefined;
  let primary = "Turn on alerts";
  let secondary: SheetAction | undefined;
  const mute: SheetAction = { label: "Turn off for this match", tone: "danger", done: "Alerts off for this match", run: () => alerts.saveMatch(matchId, false, []) };

  if (eff.source === "match" && eff.enabled) {
    initial = eff.events;
    primary = alerts.pushOn ? "Save" : "Turn on alerts";
    secondary = followed.length ? mute : { label: "Turn off alerts", tone: "danger", done: "Alerts off for this match", run: () => alerts.removeMatch(matchId) };
  } else if (eff.source === "match") {
    initial = teamEvents.length ? teamEvents : MATCH_DEFAULTS;
    if (followed.length) {
      note = `Alerts are off for this match, even though you follow ${teamNames}.`;
      secondary = { label: `Use my ${teamNames} settings`, done: "Using your team settings", run: () => alerts.removeMatch(matchId) };
    }
  } else if (eff.source === "team") {
    initial = eff.events;
    note = `You follow ${teamNames}, so these alerts are already on. Changes here apply to this match only.`;
    primary = alerts.pushOn ? "Save for this match" : "Turn on alerts";
    secondary = mute;
  }

  function click() {
    if (!alerts.support) return;
    if (alerts.support.kind === "ios-install") alerts.showIosInstall();
    else setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={click}
        aria-haspopup="dialog"
        data-testid="match-alerts-button"
        data-state={on ? "on" : "off"}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold whitespace-nowrap transition-colors ${
          on ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100" : "border-line bg-surface text-ink hover:bg-subtle"
        }`}
      >
        <BellIcon size={17} filled={on} />
        {on ? "Notifications on" : "Notify me"}
      </button>
      <AlertPrefsSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Match alerts"
        subtitle={
          <>
            Get notified about <strong className="text-ink">{home.shortName} vs {away.shortName}</strong>.
          </>
        }
        note={note}
        initial={initial.filter((k) => options.includes(k))}
        options={options}
        primaryLabel={primary}
        onSave={(events) => alerts.saveMatch(matchId, true, events)}
        secondary={secondary}
      />
    </>
  );
}
