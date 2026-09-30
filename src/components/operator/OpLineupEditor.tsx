"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LineupBuilder } from "@/components/lineup/LineupBuilder";
import type { LineupEditorState, LineupResult } from "@/lib/lineup";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { TakeOverBanner } from "./TakeOverBanner";

function message(e: PostgrestError): string {
  if (e.code === "EK401" || e.code === "PGRST301" || e.code === "PGRST303") return "Your session has expired — sign in again.";
  if ((e.code ?? "").startsWith("EK")) return e.message;
  return "The line-up could not be saved. Check your connection and try again.";
}

/**
 * Operator line-up editing for an assigned match (before kick-off). Talks to
 * the same RPCs as the admin editor; Postgres checks the assignment, the
 * eligibility of every player and the line-up rules.
 */
export function OpLineupEditor({ initial, backHref }: { initial: LineupEditorState; backHref: string }) {
  const router = useRouter();
  const matchId = initial.match.id;
  const teamId = initial.team.id;
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<LineupResult> => {
    const { data, error } = await supabaseBrowser().rpc(fn, { p_match_id: matchId, p_team_id: teamId, ...args });
    if (error) return { ok: false, error: message(error) };
    router.refresh();
    return { ok: true, state: data as LineupEditorState };
  };
  const viewOnly = initial.viewer_role === "VIEWER" && initial.match.status === "SCHEDULED";
  return (
    <>
      {viewOnly && (
        <div className="mb-4">
          <TakeOverBanner
            matchId={matchId}
            title="View only"
            body={`${initial.in_control ?? "The primary operator"} manages line-ups before kick-off. Take over only if they cannot continue — the take-over is recorded in the audit log.`}
            onTaken={() => router.refresh()}
          />
        </div>
      )}
      <LineupBuilder
        key={initial.viewer_role}
        initial={initial}
        actions={{
          save: (formation, players) => rpc("save_lineup", { p_formation: formation, p_players: players }),
          confirm: () => rpc("confirm_lineup", {}),
          reopen: (reason) => rpc("reopen_lineup", { p_reason: reason }),
        }}
      />
      <Link href={backHref} className="mt-4 flex h-12 items-center justify-center rounded-xl border-2 border-ink font-extrabold uppercase">
        Back to match prep
      </Link>
    </>
  );
}
