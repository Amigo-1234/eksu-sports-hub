/**
 * Public self-registration switch (server-side only — never NEXT_PUBLIC).
 *
 *   PUBLIC_REGISTRATION_ENABLED=true   → /register shows open windows and the
 *                                         player / team forms; uploads and
 *                                         submissions are accepted.
 *   unset / anything else (default)    → "Coming soon" everywhere public, and
 *                                         the upload route + submit/draft
 *                                         actions refuse requests.
 *
 * The status check (/register/status) and admin-led registration work either
 * way. Turning it back on needs no code change: set the variable, redeploy,
 * and open a registration window.
 */
export function publicRegistrationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.PUBLIC_REGISTRATION_ENABLED ?? "").trim());
}

export const REGISTRATION_DISABLED_MESSAGE =
  "Online registration is not open yet. Registrations are being handled by the EKSU Sports Directorate.";
