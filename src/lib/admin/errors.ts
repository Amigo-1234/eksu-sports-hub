/**
 * Maps database errors to messages an administrator can act on. Our RPCs
 * raise EK4xx codes with human-written messages; constraint violations are
 * translated by constraint name. Unknown errors never leak internals.
 */
export interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

const CONSTRAINTS: Record<string, string> = {
  teams_slug_unique: "Another team already uses that slug.",
  teams_slug_format: "Slug may only use lowercase letters, numbers and single hyphens.",
  teams_sport_id_name_key: "A team with that name already exists.",
  teams_code_key: "Another team already uses that code.",
  squad_players_squad_id_shirt_number_key: "That shirt number is already taken in this squad.",
  squad_players_squad_id_player_id_key: "That player is already in this squad.",
  squad_players_one_captain: "This squad already has a captain. Remove the armband from them first.",
  squads_team_id_season_id_key: "This team already has a squad for that season.",
  seasons_name_key: "A season with that name already exists.",
  seasons_single_current: "Another season is already current.",
  seasons_current_not_archived: "The current season cannot be archived. Make another season current first.",
  faculties_name_key: "A faculty with that name already exists.",
  faculties_code_key: "Another faculty already uses that short name.",
  departments_code_key: "Another department already uses that short name.",
  departments_faculty_id_name_key: "That faculty already has a department with this name.",
  venues_name_key: "A venue with that name already exists.",
  competitions_season_id_name_key: "This season already has a competition with that name.",
  competition_stages_competition_id_stage_order_key: "Another stage already uses that order number.",
  competition_groups_stage_id_name_key: "This stage already has a group with that name.",
  competition_entries_competition_id_team_id_key: "That team is already entered in this competition.",
  operator_assignments_one_primary: "This match already has an active primary operator.",
};

function constraintOf(e: DbError): string | null {
  const m = /constraint "([^"]+)"/.exec(e.message ?? "") ?? /index "([^"]+)"/.exec(e.message ?? "");
  return m?.[1] ?? null;
}

export function describeDbError(e: DbError | null | undefined): string {
  if (!e) return "Something went wrong. Try again.";
  const code = e.code ?? "";
  if (code.startsWith("EK")) {
    if (code === "EK401") return "Your session has expired. Sign in again.";
    return e.message || "The request was refused.";
  }
  const c = constraintOf(e);
  if (c && CONSTRAINTS[c]) return CONSTRAINTS[c];
  switch (code) {
    case "23505":
      return "That already exists.";
    case "23503":
      return "It is still used by other records, so it cannot be removed. Deactivate or archive it instead.";
    case "23514":
      return "Some values are not allowed. Check the form and try again.";
    case "23502":
      return "A required field is missing.";
    case "42501":
      return "Administrator access required.";
    case "22P02":
      return "One of the values is not in the expected format.";
    case "PGRST301":
    case "PGRST303":
      return "Your session has expired. Sign in again.";
  }
  return "Something went wrong. Try again.";
}
