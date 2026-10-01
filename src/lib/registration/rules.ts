/**
 * Registration rules shared by the browser form, the server and the tests.
 * Postgres re-checks every one of them (service_submit_registration); these
 * copies only give people instant, friendly feedback.
 */

export const POSITIONS = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST", "OTHER"] as const;
export type RegPosition = (typeof POSITIONS)[number];
export const POSITION_LABEL: Record<RegPosition, string> = {
  GK: "Goalkeeper",
  CB: "Centre-back",
  LB: "Left-back",
  RB: "Right-back",
  DM: "Defensive midfielder",
  CM: "Central midfielder",
  AM: "Attacking midfielder",
  LW: "Left winger",
  RW: "Right winger",
  ST: "Striker",
  OTHER: "Other / not sure",
};

export const LEVELS = ["100", "200", "300", "400", "500", "600", "700", "PG", "OTHER"] as const;
export type RegLevel = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<RegLevel, string> = {
  "100": "100 level",
  "200": "200 level",
  "300": "300 level",
  "400": "400 level",
  "500": "500 level",
  "600": "600 level",
  "700": "700 level",
  PG: "Postgraduate",
  OTHER: "Other",
};

export type RegistrationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "NEEDS_CORRECTION"
  | "ACCEPTED_FOR_SCREENING"
  | "REJECTED"
  | "WITHDRAWN";
export const REGISTRATION_STATUSES: RegistrationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_CORRECTION",
  "ACCEPTED_FOR_SCREENING",
  "REJECTED",
  "WITHDRAWN",
];
export const STATUS_LABEL: Record<RegistrationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  NEEDS_CORRECTION: "Needs correction",
  ACCEPTED_FOR_SCREENING: "Accepted for screening",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
export type RegistrationType = "PLAYER_SELF" | "TEAM_ROSTER";

/** Same normalisation as Postgres (player_identities.student_id_key): case and spaces ignored. */
export function normaliseMatric(v: string): string {
  return v.replace(/\s+/g, "").toUpperCase();
}

/** "+234 803 000 0000", "0803-000-0000" → "+2348030000000" / "08030000000". */
export function cleanPhone(v: string): string {
  return v.replace(/[\s()-]/g, "");
}
export function isPhone(v: string): boolean {
  return /^\+?[0-9]{10,15}$/.test(cleanPhone(v));
}
export function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 120;
}

// ── Documents ───────────────────────────────────────────────────────────────
export type DocKind = "photo" | "id";
export const MAX_DOC_BYTES = 4 * 1024 * 1024; // must stay under the hosting request limit (4.5 MB)
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const DOC_TYPES: Record<DocKind, Record<string, string>> = {
  photo: IMAGE_TYPES,
  id: { ...IMAGE_TYPES, "application/pdf": "pdf" },
};
const EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};
export const ACCEPT: Record<DocKind, string> = {
  photo: "image/jpeg,image/png,image/webp",
  id: "image/jpeg,image/png,image/webp,application/pdf",
};

/** Real type from the file's first bytes (never trust the name or the browser's claim alone). */
export function sniffType(head: Uint8Array): string | null {
  const b = (i: number) => head[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50)
    return "image/webp";
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) return "application/pdf";
  return null;
}

/**
 * Validate a document: size, declared MIME type, file extension and the
 * actual content must all agree with what this kind of document allows.
 * Returns the storage extension, or an error message.
 */
export function checkDocument(
  kind: DocKind,
  file: { name: string; type: string; size: number },
  head: Uint8Array,
): { ok: true; ext: string; type: string } | { ok: false; error: string } {
  const what = kind === "photo" ? "The passport photograph" : "The ID document";
  const allowed = DOC_TYPES[kind];
  const kinds = kind === "photo" ? "JPG, PNG or WebP image" : "JPG, PNG or WebP image, or a PDF";
  if (file.size <= 0) return { ok: false, error: `${what} is empty.` };
  if (file.size > MAX_DOC_BYTES) return { ok: false, error: `${what} is larger than 4 MB.` };
  const real = sniffType(head);
  if (!real || !(real in allowed)) return { ok: false, error: `${what} must be a ${kinds}.` };
  if (file.type && file.type !== real) return { ok: false, error: `${what} does not match its file type. Choose the original file.` };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (file.name.includes(".") && !EXTENSIONS[real].includes(ext)) {
    return { ok: false, error: `${what} has the wrong file extension for a ${kinds}.` };
  }
  return { ok: true, ext: allowed[real], type: real };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Opaque storage path: {registration}/{person}/{photo|id}.{ext} — never names or matric numbers. */
export function documentPath(registrationId: string, personId: string, kind: DocKind, ext: string): string {
  if (!isUuid(registrationId) || !isUuid(personId)) throw new Error("invalid document path");
  return `${registrationId.toLowerCase()}/${personId.toLowerCase()}/${kind}.${ext}`;
}

/** Public references look like EKSU-FC26-7K4P2D (no 0/O/1/I). */
export function normaliseReference(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "");
}
export const REFERENCE_PATTERN = /^EKSU-[A-Z0-9]{2,6}-[2-9A-HJ-NP-Z]{6}$/;
