/**
 * DEMO DATA — development only.
 *
 * Team, competition and venue names are generic EKSU faculty/department
 * labels. No real players are represented anywhere in the demo data.
 */
import type { Competition, Sport, Team, Venue } from "../../types";

export const sports: Sport[] = [
  { id: "football", name: "Football", slug: "football", status: "active" },
  { id: "basketball", name: "Basketball", slug: "basketball", status: "coming_soon" },
  { id: "volleyball", name: "Volleyball", slug: "volleyball", status: "coming_soon" },
  { id: "athletics", name: "Athletics", slug: "athletics", status: "coming_soon" },
];

export const venues: Venue[] = [
  { id: "v-main", name: "University Sports Complex — Main Pitch", shortName: "Main Pitch" },
  { id: "v-pitch2", name: "University Sports Complex — Pitch 2", shortName: "Pitch 2" },
  { id: "v-edu", name: "Faculty of Education Field", shortName: "Education Field" },
];

const team = (
  id: string,
  name: string,
  shortName: string,
  code: string,
  kind: Team["kind"],
  category: Team["category"],
  primary: string,
  secondary = "#FFFFFF",
): Team => ({ id, name, shortName, code, kind, category, colors: { primary, secondary } });

export const teams: Team[] = [
  // Inter-Faculty (men)
  team("fac-sci", "Faculty of Science", "Science", "SCI", "faculty", "men", "#1D4ED8"),
  team("fac-eng", "Faculty of Engineering", "Engineering", "ENG", "faculty", "men", "#9A3412"),
  team("fac-law", "Faculty of Law", "Law", "LAW", "faculty", "men", "#1F2937"),
  team("fac-art", "Faculty of Arts", "Arts", "ART", "faculty", "men", "#6D28D9"),
  team("fac-edu", "Faculty of Education", "Education", "EDU", "faculty", "men", "#047857"),
  team("fac-ssc", "Faculty of Social Sciences", "Social Sciences", "SSC", "faculty", "men", "#0E7490"),
  team("fac-mgt", "Faculty of Management Sciences", "Management Sci.", "MGT", "faculty", "men", "#4338CA"),
  team("fac-agr", "Faculty of Agricultural Sciences", "Agriculture", "AGR", "faculty", "men", "#3F6212"),
  // Inter-Faculty (women)
  team("fac-sci-w", "Faculty of Science Women", "Science", "SCI", "faculty", "women", "#1D4ED8"),
  team("fac-edu-w", "Faculty of Education Women", "Education", "EDU", "faculty", "women", "#047857"),
  team("fac-ssc-w", "Faculty of Social Sciences Women", "Social Sciences", "SSC", "faculty", "women", "#0E7490"),
  team("fac-mgt-w", "Faculty of Management Sciences Women", "Management Sci.", "MGT", "faculty", "women", "#4338CA"),
  // Inter-Departmental Cup
  team("dep-csc", "Computer Science", "Computer Sci.", "CSC", "department", "men", "#0F766E"),
  team("dep-mcb", "Microbiology", "Microbiology", "MCB", "department", "men", "#A16207"),
  team("dep-mee", "Mechanical Engineering", "Mech. Eng.", "MEE", "department", "men", "#374151"),
  team("dep-acc", "Accounting", "Accounting", "ACC", "department", "men", "#1E40AF"),
  team("dep-mac", "Mass Communication", "Mass Comm.", "MAC", "department", "men", "#9D174D"),
  team("dep-eco", "Economics", "Economics", "ECO", "department", "men", "#166534"),
  team("dep-pol", "Political Science", "Political Sci.", "POL", "department", "men", "#5B21B6"),
  team("dep-tma", "Theatre & Media Arts", "Theatre Arts", "TMA", "department", "men", "#B91C1C"),
];

export const competitions: Competition[] = [
  {
    id: "ifc-2026",
    sportId: "football",
    name: "Inter-Faculty Football Championship",
    shortName: "Inter-Faculty",
    season: "2026/27",
    format: "league",
    category: "men",
    description:
      "The flagship men's football league between EKSU faculties. Single round-robin; top two contest the championship final.",
    teamIds: ["fac-sci", "fac-eng", "fac-law", "fac-art", "fac-edu", "fac-ssc", "fac-mgt", "fac-agr"],
  },
  {
    id: "ifw-2026",
    sportId: "football",
    name: "Inter-Faculty Women's Championship",
    shortName: "Women's Inter-Faculty",
    season: "2026/27",
    format: "league",
    category: "women",
    description: "Women's football league between EKSU faculties. Double round-robin.",
    teamIds: ["fac-sci-w", "fac-edu-w", "fac-ssc-w", "fac-mgt-w"],
  },
  {
    id: "idc-2026",
    sportId: "football",
    name: "Inter-Departmental Cup",
    shortName: "Dept. Cup",
    season: "2026/27",
    format: "knockout",
    category: "men",
    description: "Single-elimination cup between departmental sides.",
    teamIds: ["dep-csc", "dep-mcb", "dep-mee", "dep-acc", "dep-mac", "dep-eco", "dep-pol", "dep-tma"],
  },
];
