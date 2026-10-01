"use client";

import { useState } from "react";
import { HeartIcon } from "@/components/ui/icons";
import { TEAM_DEFAULTS, type PrefKey } from "@/lib/notifications/prefs";
import { AlertPrefsSheet } from "./AlertPrefsSheet";
import { useAlerts } from "./AlertsProvider";

const TEAM_ORDER: PrefKey[] = ["REMINDER", "KICKOFF", "GOAL", "RED_CARD", "FULL_TIME", "STATUS", "YELLOW_CARD", "HALF_TIME", "SECOND_HALF"];

/** "Follow team": alerts for every future match of this team, on this device. */
export function TeamFollowButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  if (!alerts.available) return null;

  const pref = alerts.state.teams.find((t) => t.team_id === teamId && t.enabled);
  const following = Boolean(pref) && alerts.pushOn;

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
        data-testid="team-follow-button"
        data-state={following ? "on" : "off"}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold whitespace-nowrap transition-colors ${
          following ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100" : "border-brand-700 bg-brand-700 text-white hover:bg-brand-800"
        }`}
      >
        <HeartIcon size={17} filled={following} />
        {following ? "Following" : "Follow team"}
      </button>
      <AlertPrefsSheet
        open={open}
        onClose={() => setOpen(false)}
        title={pref ? "Team alerts" : "Follow team"}
        subtitle={
          <>
            Get alerts for every <strong className="text-ink">{teamName}</strong> match. You can still change or mute a
            single match from its page.
          </>
        }
        initial={pref?.events ?? TEAM_DEFAULTS}
        options={TEAM_ORDER}
        primaryLabel={pref && alerts.pushOn ? "Save" : "Follow team"}
        onSave={(events) => alerts.saveTeam(teamId, events)}
        secondary={pref ? { label: "Unfollow team", tone: "danger", done: `Unfollowed ${teamName}`, run: () => alerts.unfollowTeam(teamId) } : undefined}
      />
    </>
  );
}
