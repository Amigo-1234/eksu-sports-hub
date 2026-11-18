/** Operator applications: constants and validation shared by the public form, the server action and admin. */

export const DAYS = [
  ["MON", "Monday"],
  ["TUE", "Tuesday"],
  ["WED", "Wednesday"],
  ["THU", "Thursday"],
  ["FRI", "Friday"],
  ["SAT", "Saturday"],
  ["SUN", "Sunday"],
] as const;
export type Day = (typeof DAYS)[number][0];

export const PERIODS = [
  ["MORNING", "Morning", "7am – 12pm"],
  ["AFTERNOON", "Afternoon", "12pm – 4pm"],
  ["EVENING", "Evening", "4pm – 7pm"],
] as const;
export type Period = (typeof PERIODS)[number][0];

export const STATUSES = ["NEW", "SHORTLISTED", "APPROVED", "REJECTED", "INVITED"] as const;
export type ApplicationStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  NEW: "New",
  SHORTLISTED: "Shortlisted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INVITED: "Invited",
};

export const STATUS_TONE: Record<ApplicationStatus, "neutral" | "brand" | "ok" | "bad" | "muted"> = {
  NEW: "brand",
  SHORTLISTED: "neutral",
  APPROVED: "ok",
  REJECTED: "bad",
  INVITED: "muted",
};

export const QUESTIONS = {
  why: "Why do you want to become an EKSU Sports Hub operator?",
  wrongGoal: "How would you handle recording a goal for the wrong team?",
  offline: "What would you do if your internet connection failed during a live match?",
  commit: "Can you commit to providing accurate and timely match updates?",
} as const;

export const LIMITS = { name: [2, 80], why: [20, 1500], answer: [10, 1500], experience: [0, 1500] } as const;

export interface ApplicationInput {
  full_name: string;
  email: string;
  phone: string;
  department: string;
  level: string;
  experience: string;
  available_days: string[];
  periods: string[];
  can_attend: boolean | null;
  answer_why: string;
  answer_wrong_goal: string;
  answer_offline: string;
  commits_accuracy: boolean | null;
  consent: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_KEYS = new Set<string>(DAYS.map(([k]) => k));
const PERIOD_KEYS = new Set<string>(PERIODS.map(([k]) => k));

export const cleanPhone = (v: string) => v.replace(/[\s()-]/g, "");

/** Field → message for everything that is wrong (empty object = valid). */
export function validateApplication(a: ApplicationInput): Partial<Record<keyof ApplicationInput, string>> {
  const e: Partial<Record<keyof ApplicationInput, string>> = {};
  const len = (s: string) => s.trim().length;
  if (len(a.full_name) < LIMITS.name[0] || len(a.full_name) > LIMITS.name[1]) e.full_name = "Enter your full name.";
  if (!EMAIL.test(a.email.trim()) || a.email.length > 200) e.email = "Enter a valid email address.";
  if (a.phone.trim() && !/^\+?[0-9]{7,15}$/.test(cleanPhone(a.phone))) e.phone = "Enter a valid phone number, e.g. 08012345678.";
  if (len(a.department) > 80) e.department = "Keep this under 80 characters.";
  if (len(a.level) > 20) e.level = "Keep this under 20 characters.";
  if (len(a.experience) > LIMITS.experience[1]) e.experience = "Keep this under 1,500 characters.";
  const days = new Set(a.available_days.filter((d) => DAY_KEYS.has(d)));
  if (days.size < 2 || days.size > 3) e.available_days = "Choose 2 or 3 days.";
  if (a.periods.filter((p) => PERIOD_KEYS.has(p)).length === 0) e.periods = "Choose at least one time of day.";
  if (a.can_attend === null) e.can_attend = "Tell us whether you can attend matches in person.";
  if (len(a.answer_why) < LIMITS.why[0]) e.answer_why = "Tell us a little more (at least 20 characters).";
  else if (len(a.answer_why) > LIMITS.why[1]) e.answer_why = "Keep this under 1,500 characters.";
  if (len(a.answer_wrong_goal) < LIMITS.answer[0]) e.answer_wrong_goal = "Please answer this question.";
  else if (len(a.answer_wrong_goal) > LIMITS.answer[1]) e.answer_wrong_goal = "Keep this under 1,500 characters.";
  if (len(a.answer_offline) < LIMITS.answer[0]) e.answer_offline = "Please answer this question.";
  else if (len(a.answer_offline) > LIMITS.answer[1]) e.answer_offline = "Keep this under 1,500 characters.";
  if (a.commits_accuracy === null) e.commits_accuracy = "Please answer this question.";
  if (!a.consent) e.consent = "Please confirm you have read how we use your details.";
  return e;
}

export const dayLabel = (k: string) => DAYS.find(([d]) => d === k)?.[1] ?? k;
export const periodLabel = (k: string) => PERIODS.find(([p]) => p === k)?.[1] ?? k;
