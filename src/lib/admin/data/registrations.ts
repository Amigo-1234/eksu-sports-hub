import "server-only";
import type { RegistrationStatus, RegistrationType } from "@/lib/registration/rules";
import { adminDb, must } from "./db";

/*
 * Registration intake (admin). Reads are admin_* RPCs (ADMIN re-checked in
 * Postgres); private documents are signed for a few minutes with the
 * admin's own session (storage policy: ADMIN may read the bucket).
 */

export type WindowStatus = "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";

export interface RegistrationWindow {
  id: string;
  slug: string;
  title: string;
  reference_code: string;
  status: WindowStatus;
  open_now: boolean;
  opens_at: string;
  closes_at: string | null;
  allow_player: boolean;
  allow_team: boolean;
  instructions: string;
  created_at: string;
  competition: { id: string; name: string; short_name: string; status: string };
  season: { id: string; name: string };
  counts: Partial<Record<RegistrationStatus, number>>;
  players: number;
}

export async function listRegistrationWindows(): Promise<RegistrationWindow[]> {
  const { db } = await adminDb();
  return (must(await db.rpc("admin_list_registration_windows"), "registration windows") as RegistrationWindow[] | null) ?? [];
}

export interface RegistrationFilters {
  window?: string;
  competition?: string;
  season?: string;
  team?: string;
  faculty?: string;
  department?: string;
  type?: RegistrationType;
  status?: RegistrationStatus;
  from?: string;
  to?: string;
  search?: string;
}

export interface RegistrationRow {
  id: string;
  reference: string;
  type: RegistrationType;
  status: RegistrationStatus;
  source: "PUBLIC" | "ADMIN";
  submitted_at: string;
  reviewed_at: string | null;
  submitter: string;
  submitter_phone: string;
  competition: { id: string; short_name: string };
  season: string;
  team: { id: string; short_name: string } | null;
  players: number;
  first_player: string | null;
  missing_documents: number;
  flags: number;
}

export async function listRegistrations(f: RegistrationFilters): Promise<{ counts: Partial<Record<RegistrationStatus, number>>; rows: RegistrationRow[] }> {
  const { db } = await adminDb();
  const res = must(
    await db.rpc("admin_list_registrations", {
      p_window_id: f.window ?? null,
      p_competition_id: f.competition ?? null,
      p_season_id: f.season ?? null,
      p_team_id: f.team ?? null,
      p_faculty_id: f.faculty ?? null,
      p_department_id: f.department ?? null,
      p_type: f.type ?? null,
      p_status: f.status ?? null,
      p_from: f.from ?? null,
      p_to: f.to ?? null,
      p_search: f.search ?? null,
      p_limit: 200,
    }),
    "registrations",
  ) as { counts: Partial<Record<RegistrationStatus, number>>; rows: RegistrationRow[] };
  return res;
}

export interface Duplicate {
  kind: "OFFICIAL_PLAYER" | "OTHER_REGISTRATION" | "REJECTED_BEFORE";
  detail: string;
  player_id?: string;
  registration_id?: string;
}

export interface RegistrationPerson {
  id: string;
  full_name: string;
  matric_number: string;
  level: string;
  phone: string | null;
  position: string;
  status: "SUBMITTED" | "ACCEPTED_FOR_SCREENING" | "REJECTED" | "WITHDRAWN";
  status_reason: string | null;
  faculty: { id: string; name: string };
  department: { id: string; name: string } | null;
  team: { id: string; name: string; short_name: string };
  photo_path: string | null;
  id_path: string | null;
  duplicates: Duplicate[];
  official_player: { id: string; name: string | null } | null;
  screening: { id: string; status: string; decided_at: string | null } | null;
  /** Short-lived signed URLs (admin only). */
  photo_url?: string | null;
  id_url?: string | null;
}

export interface RegistrationDetail {
  id: string;
  reference: string;
  type: RegistrationType;
  status: RegistrationStatus;
  status_reason: string | null;
  source: "PUBLIC" | "ADMIN";
  created_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_notes: string;
  submitter: { name: string; phone: string; email: string | null };
  window: { id: string; title: string; slug: string };
  competition: { id: string; name: string; short_name: string };
  season: { id: string; name: string };
  team: { id: string; name: string; short_name: string } | null;
  players: RegistrationPerson[];
  history: { from: string | null; to: string; reason: string | null; at: string; player: string | null; by: string | null }[];
}

const SIGNED_URL_SECONDS = 600;

export async function getRegistration(id: string): Promise<RegistrationDetail | null> {
  const { db } = await adminDb();
  const res = await db.rpc("admin_registration_detail", { p_registration_id: id });
  if (res.error?.code === "EK404") return null;
  const detail = must(res, "registration") as RegistrationDetail;
  const paths = detail.players.flatMap((p) => [p.photo_path, p.id_path]).filter((x): x is string => Boolean(x));
  if (paths.length) {
    const signed = await db.storage.from("registration-documents").createSignedUrls(paths, SIGNED_URL_SECONDS);
    const urls = new Map((signed.data ?? []).map((s) => [s.path, s.error ? null : s.signedUrl]));
    for (const p of detail.players) {
      p.photo_url = p.photo_path ? (urls.get(p.photo_path) ?? null) : null;
      p.id_url = p.id_path ? (urls.get(p.id_path) ?? null) : null;
    }
  }
  return detail;
}

export interface IntakeWindow {
  id: string;
  title: string;
  status: WindowStatus;
  reference_code: string;
  competition: { id: string; name: string; short_name: string };
  season: string;
  teams: { id: string; name: string; short_name: string; faculty_id: string | null }[];
}
export interface IntakeOptions {
  windows: IntakeWindow[];
  faculties: { id: string; name: string; code: string; departments: { id: string; name: string }[] }[];
}

/** Windows an admin may register into (open or closed, not archived), plus faculties/departments. */
export async function getIntakeOptions(): Promise<IntakeOptions> {
  const { db } = await adminDb();
  return must(await db.rpc("admin_registration_intake_options"), "registration options") as IntakeOptions;
}
