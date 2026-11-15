/** Public-site colour theme. Light is the default; dark is an opt-in stored in a cookie. */
export type SiteTheme = "light" | "dark";
export const THEME_COOKIE = "eksu-theme";
export const THEME_CLASS = "theme-dark";

export function parseTheme(value: string | undefined): SiteTheme {
  return value === "dark" ? "dark" : "light";
}
