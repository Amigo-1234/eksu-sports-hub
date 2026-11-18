"use server";

import { cleanPhone, validateApplication, type ApplicationInput } from "@/lib/operator-applications/shared";
import { callerKey, publicMessage, serviceClient } from "@/lib/registration/server";

/*
 * Public operator application. Runs on the server only: the browser gets a
 * reference or a safe message, never the secret key or anyone's data.
 * Validated here and again in Postgres (service_submit_operator_application),
 * which also rate-limits per connection and blocks duplicate applications.
 */

export type ApplyResult = { ok: true; reference: string | null } | { ok: false; error: string; fields?: Record<string, string> };

const UNAVAILABLE = "Applications are not open right now. Please try again later.";
const MIN_FILL_MS = 4000; // humans need more than a few seconds for this form

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 7) : []);
const yesNo = (v: unknown) => (v === true || v === false ? v : null);

export async function submitOperatorApplication(raw: ApplicationInput & { website?: string; startedAt?: number }): Promise<ApplyResult> {
  // Bots: a hidden field people never fill, and an implausibly fast submission.
  if (str(raw?.website, 200)) return { ok: true, reference: null };
  if (typeof raw?.startedAt !== "number" || Date.now() - raw.startedAt < MIN_FILL_MS) {
    return { ok: false, error: "Please take a moment to review your answers, then submit again." };
  }
  // Rebuild field by field: nothing unexpected reaches Postgres.
  const input: ApplicationInput = {
    full_name: str(raw.full_name, 80),
    email: str(raw.email, 200).toLowerCase(),
    phone: cleanPhone(str(raw.phone, 25)),
    department: str(raw.department, 80),
    level: str(raw.level, 20),
    experience: str(raw.experience, 1500),
    available_days: [...new Set(list(raw.available_days))],
    periods: [...new Set(list(raw.periods))],
    can_attend: yesNo(raw.can_attend),
    answer_why: str(raw.answer_why, 1500),
    answer_wrong_goal: str(raw.answer_wrong_goal, 1500),
    answer_offline: str(raw.answer_offline, 1500),
    commits_accuracy: yesNo(raw.commits_accuracy),
    consent: raw.consent === true,
  };
  const fields = validateApplication(input);
  if (Object.keys(fields).length > 0) return { ok: false, error: "Please check the highlighted answers.", fields: fields as Record<string, string> };

  const db = serviceClient();
  if (!db) return { ok: false, error: UNAVAILABLE };
  try {
    const { consent: _consent, ...payload } = input;
    void _consent;
    const { data, error } = await db.rpc("service_submit_operator_application", { p: payload, p_rate_key: await callerKey() });
    if (error) return { ok: false, error: publicMessage(error, UNAVAILABLE) };
    return { ok: true, reference: String(data) };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}
