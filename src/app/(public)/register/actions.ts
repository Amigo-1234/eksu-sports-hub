"use server";

import { revalidatePath } from "next/cache";
import { getOpenWindows } from "@/lib/registration/public";
import { cleanPhone, isUuid, normaliseReference, REFERENCE_PATTERN, type RegistrationType } from "@/lib/registration/rules";
import { callerKey, publicMessage, serviceClient, sweepAbandonedDocuments, verifyDraft, issueDraft } from "@/lib/registration/server";

/*
 * Public registration actions. They run on the server only; the browser
 * receives a draft token, a reference, or a safe status — never the secret
 * key, never another person's data. Postgres validates everything again.
 */

const UNAVAILABLE = "Registration is not available right now. Please try again later.";

export async function startDraft(windowId: string): Promise<{ ok: true; registrationId: string; token: string } | { ok: false; error: string }> {
  const db = serviceClient();
  if (!db || !isUuid(windowId)) return { ok: false, error: UNAVAILABLE };
  try {
    const open = await getOpenWindows();
    if (!open.some((w) => w.id === windowId)) return { ok: false, error: "Registration for this competition is closed." };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
  await sweepAbandonedDocuments(db);
  return { ok: true, ...issueDraft(windowId) };
}

export interface SubmitPerson {
  id: string;
  full_name: string;
  matric_number: string;
  faculty_id: string;
  department_id: string | null;
  level: string;
  phone: string | null;
  position: string;
  team_id: string | null;
  photo_path: string | null;
  id_path: string | null;
}
export interface SubmitInput {
  token: string;
  type: RegistrationType;
  team_id: string | null;
  submitter: { name: string; phone: string; email: string | null };
  players: SubmitPerson[];
}
export type SubmitResult =
  | { ok: true; reference: string; players: number; competition: string; submittedAt: string }
  | { ok: false; error: string; expired?: boolean };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const optStr = (v: unknown, max: number) => str(v, max) || null;
const optId = (v: unknown) => (isUuid(v) ? v : null);

export async function submitRegistration(input: SubmitInput): Promise<SubmitResult> {
  const db = serviceClient();
  if (!db) return { ok: false, error: UNAVAILABLE };
  const draft = verifyDraft(input?.token);
  if (!draft) return { ok: false, expired: true, error: "This form has expired. Your answers are saved: reload the page to continue." };
  if (!Array.isArray(input.players) || input.players.length === 0 || input.players.length > 40) {
    return { ok: false, error: "Add at least one player." };
  }
  // Rebuild the payload field by field: nothing unexpected reaches Postgres.
  const payload = {
    id: draft.registrationId,
    window_id: draft.windowId,
    type: input.type === "TEAM_ROSTER" ? "TEAM_ROSTER" : "PLAYER_SELF",
    team_id: optId(input.team_id),
    submitter: {
      name: str(input.submitter?.name, 80),
      phone: cleanPhone(str(input.submitter?.phone, 20)),
      email: optStr(input.submitter?.email, 120),
    },
    players: input.players.map((p) => ({
      id: optId(p?.id),
      full_name: str(p?.full_name, 80),
      matric_number: str(p?.matric_number, 40),
      faculty_id: optId(p?.faculty_id),
      department_id: optId(p?.department_id),
      level: str(p?.level, 8),
      phone: optStr(p?.phone, 20),
      position: str(p?.position, 8),
      team_id: optId(p?.team_id),
      photo_path: optStr(p?.photo_path, 120),
      id_path: optStr(p?.id_path, 120),
    })),
  };
  const res = await db.rpc("service_submit_registration", { p: payload, p_rate_key: await callerKey() });
  if (res.error) {
    if (!res.error.code?.startsWith("EK")) console.error("[registration] submit failed", res.error.code);
    return { ok: false, error: publicMessage(res.error, "Your registration could not be submitted. Please try again.") };
  }
  const r = res.data as { reference: string; players: number; competition: string; submitted_at: string };
  revalidatePath("/admin/registrations");
  return { ok: true, reference: r.reference, players: r.players, competition: r.competition, submittedAt: r.submitted_at };
}

export interface SafeStatus {
  reference: string;
  competition: string;
  season: string;
  team: string | null;
  type: RegistrationType;
  status: string;
  submitted_at: string;
  players: number;
  name: string;
}
export type StatusState = { at: number; result?: SafeStatus; error?: string; reference?: string } | null;

export async function lookupStatus(_: StatusState, fd: FormData): Promise<StatusState> {
  const reference = normaliseReference(String(fd.get("reference") ?? "")).slice(0, 30);
  const phone = cleanPhone(String(fd.get("phone") ?? "")).slice(0, 20);
  const at = Date.now();
  if (!REFERENCE_PATTERN.test(reference)) return { at, reference, error: "Enter the reference exactly as shown, e.g. EKSU-FC26-7K4P2D." };
  if (phone.replace(/\D/g, "").length < 10) return { at, reference, error: "Enter the phone number used on the registration." };
  const db = serviceClient();
  if (!db) return { at, reference, error: UNAVAILABLE };
  const res = await db.rpc("service_registration_status", { p_reference: reference, p_phone: phone, p_rate_key: await callerKey() });
  if (res.error) return { at, reference, error: publicMessage(res.error, UNAVAILABLE) };
  if (!res.data) return { at, reference, error: "We could not find a registration with that reference and phone number." };
  return { at, reference, result: res.data as SafeStatus };
}
