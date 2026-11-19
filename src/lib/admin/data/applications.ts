import "server-only";
import { STATUSES, type ApplicationStatus } from "@/lib/operator-applications/shared";
import { adminDb, must } from "./db";

export interface OperatorApplication {
  id: string;
  reference: string;
  full_name: string;
  email: string;
  phone: string | null;
  department: string;
  level: string;
  experience: string;
  available_days: string[];
  periods: string[];
  can_attend: boolean;
  answer_why: string;
  answer_wrong_goal: string;
  answer_offline: string;
  commits_accuracy: boolean;
  status: ApplicationStatus;
  review_notes: string;
  reviewed_at: string | null;
  invited_user_id: string | null;
  invited_at: string | null;
  created_at: string;
}

const COLS =
  "id, reference, full_name, email, phone, department, level, experience, available_days, periods, can_attend, answer_why, answer_wrong_goal, answer_offline, commits_accuracy, status, review_notes, reviewed_at, invited_user_id, invited_at, created_at";

export interface ApplicationFilters {
  q?: string;
  status?: string;
  day?: string;
}

export async function listApplications(f: ApplicationFilters): Promise<OperatorApplication[]> {
  const { db } = await adminDb();
  let query = db.from("operator_applications").select(COLS).order("created_at", { ascending: false }).limit(500);
  if (f.status && (STATUSES as readonly string[]).includes(f.status)) query = query.eq("status", f.status);
  if (f.day && /^(MON|TUE|WED|THU|FRI|SAT|SUN)$/.test(f.day)) query = query.contains("available_days", [f.day]);
  const q = (f.q ?? "").trim().slice(0, 80).replace(/[%,()*\\]/g, " ").trim();
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,reference.ilike.%${q}%,department.ilike.%${q}%`);
  return must(await query, "applications") as OperatorApplication[];
}

/** Totals per status, for the summary strip. */
export async function applicationCounts(): Promise<Record<ApplicationStatus | "ALL", number>> {
  const { db } = await adminDb();
  const rows = must(await db.from("operator_applications").select("status"), "applications") as { status: ApplicationStatus }[];
  const out = Object.fromEntries([...STATUSES, "ALL"].map((s) => [s, 0])) as Record<ApplicationStatus | "ALL", number>;
  for (const r of rows) {
    out[r.status] += 1;
    out.ALL += 1;
  }
  return out;
}

export async function getApplication(id: string): Promise<OperatorApplication | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { db } = await adminDb();
  return must(await db.from("operator_applications").select(COLS).eq("id", id).maybeSingle(), "application") as OperatorApplication | null;
}

export interface PracticeLink {
  id: string;
  token: string;
  created_at: string;
  expires_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  submitted_name: string | null;
  score: number | null;
  result: {
    items?: { id: string; label: string; points: number; max: number; note?: string }[];
    finalScore?: { home: number; away: number } | null;
    strayEvents?: number;
    avgDelaySeconds?: number | null;
  } | null;
  revoked_at: string | null;
}

/** Practice (skills test) links for an application, newest first. Empty if the feature is not installed yet. */
export async function listPracticeLinks(applicationId: string): Promise<PracticeLink[]> {
  const { db } = await adminDb();
  const res = await db
    .from("operator_practice_links")
    .select("id, token, created_at, expires_at, opened_at, submitted_at, submitted_name, score, result, revoked_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  return res.error ? [] : ((res.data ?? []) as PracticeLink[]);
}
