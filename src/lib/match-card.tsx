import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { crestFor } from "@/lib/crests";
import { scorersFor } from "@/lib/events";
import { formatLongDate, formatTime } from "@/lib/format";
import { isFinished, isLive, showsScore, statusLongLabel } from "@/lib/status";
import type { MatchDetail, Team } from "@/lib/types";

/*
 * Shareable match card (Satori via next/og): a tall 1080×1920 image for
 * WhatsApp Status and a 1200×630 one for link previews. Only flexbox and
 * inline styles; crests and fonts are read from disk and inlined.
 */

export type CardFormat = "status" | "wide";
export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  status: { width: 1080, height: 1920 },
  wide: { width: 1200, height: 630 },
};

const ROOT = process.cwd();
const fontCache: { barlow?: Buffer; inter?: Buffer } = {};
export async function cardFonts() {
  fontCache.barlow ??= await readFile(join(ROOT, "src/assets/fonts/barlow-condensed-800.ttf"));
  fontCache.inter ??= await readFile(join(ROOT, "src/assets/fonts/inter-600.ttf"));
  return [
    { name: "Barlow", data: fontCache.barlow, weight: 800 as const, style: "normal" as const },
    { name: "Inter", data: fontCache.inter, weight: 600 as const, style: "normal" as const },
  ];
}

async function fileDataUri(publicPath: string, type: string) {
  try {
    const buf = await readFile(join(ROOT, "public", publicPath));
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The team's official crest, or the site's shield in its colours. The shield
 * carries no text: the server has no system fonts, so the team code is drawn
 * on top by Satori with the card's own font (see teamBlock).
 */
async function crestUri(team: Team): Promise<{ uri: string; official: boolean }> {
  const file = crestFor(team.id);
  if (file) {
    const uri = await fileDataUri(file, "image/png");
    if (uri) return { uri, official: true };
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112"><path d="M50 3 92 16v38c0 28-19 46-42 55C27 100 8 82 8 54V16Z" fill="${esc(team.colors.primary)}" stroke="${esc(team.colors.secondary)}" stroke-width="5"/></svg>`;
  return { uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, official: false };
}

function headline(m: MatchDetail): { label: string; tone: "live" | "ft" | "pre" | "off" } {
  if (isLive(m.status)) return { label: m.status === "HALF_TIME" ? "HALF-TIME" : "LIVE", tone: "live" };
  if (m.status === "FULL_TIME") return { label: "FULL-TIME", tone: "ft" };
  if (m.status === "SCHEDULED") return { label: `${formatLongDate(m.kickoffAt)} · ${formatTime(m.kickoffAt)} WAT`.toUpperCase(), tone: "pre" };
  return { label: statusLongLabel(m.status).toUpperCase(), tone: "off" };
}

const BRAND = { deep: "#3d0d1e", mid: "#6b1530", gold: "#f2b631", live: "#ff3b4a" };

export async function MatchCard({ match: m, format }: { match: MatchDetail; format: CardFormat }) {
  const tall = format === "status";
  const [home, away, logo] = await Promise.all([crestUri(m.homeTeam), crestUri(m.awayTeam), fileDataUri("brand/eksu-crest-192.png", "image/png")]);
  const scored = showsScore(m.status) && m.score;
  const h = headline(m);
  const sc = (side: "home" | "away") => scorersFor(m, side).slice(0, tall ? 6 : 3);
  const crest = tall ? 260 : 150;
  const nameSize = tall ? 58 : 40;
  const scoreSize = tall ? 230 : 150;

  const teamBlock = (t: Team, c: { uri: string; official: boolean }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: tall ? 380 : 330 }}>
      <div style={{ display: "flex", position: "relative", width: crest, height: crest, alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img */}
        <img src={c.uri} width={crest} height={crest} style={{ position: "absolute", top: 0, left: 0, objectFit: "contain" }} alt="" />
        {!c.official && (
          <div style={{ display: "flex", marginTop: -crest * 0.08, fontFamily: "Barlow", fontSize: crest * (t.code.length > 3 ? 0.22 : 0.3), color: "#fff", letterSpacing: 1 }}>
            {t.code}
          </div>
        )}
      </div>
      <div style={{ marginTop: tall ? 28 : 14, fontFamily: "Barlow", fontSize: nameSize, lineHeight: 1, color: "#fff", textAlign: "center", textTransform: "uppercase" }}>
        {t.shortName}
      </div>
    </div>
  );

  const scorersBlock = (side: "home" | "away") => (
    <div style={{ display: "flex", flexDirection: "column", width: tall ? 440 : 520, alignItems: side === "home" ? "flex-end" : "flex-start" }}>
      {sc(side).map((l) => (
        <div key={l.label} style={{ display: "flex", fontFamily: "Inter", fontSize: tall ? 30 : 22, color: "rgba(255,255,255,0.9)", marginTop: 6 }}>
          {`${l.label}  ${l.minutes.join(", ")}`}
        </div>
      ))}
    </div>
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        background: `linear-gradient(160deg, ${BRAND.mid} 0%, ${BRAND.deep} 60%, #1a0710 100%)`,
        padding: tall ? "90px 60px 80px" : "34px 50px 30px",
        color: "#fff",
      }}
    >
      {/* Brand bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img
          <img src={logo} width={tall ? 96 : 56} height={tall ? 96 : 56} alt="" />
        )}
        <div style={{ display: "flex", fontFamily: "Barlow", fontSize: tall ? 64 : 38, letterSpacing: 2 }}>
          EKSU <span style={{ color: BRAND.gold, marginLeft: 12 }}>SPORTS</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", fontFamily: "Inter", fontSize: tall ? 30 : 22, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 3, textAlign: "center" }}>
          {`${m.competition.name}${m.round ? ` · ${m.round}` : ""}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: tall ? 70 : 24 }}>
          {teamBlock(m.homeTeam, home)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: tall ? 220 : 340 }}>
            {scored ? (
              <div style={{ display: "flex", fontFamily: "Barlow", fontSize: scoreSize, lineHeight: 1 }}>
                {`${m.score!.home}-${m.score!.away}`}
              </div>
            ) : (
              <div style={{ display: "flex", fontFamily: "Barlow", fontSize: tall ? 110 : 90, color: "rgba(255,255,255,0.85)" }}>VS</div>
            )}
          </div>
          {teamBlock(m.awayTeam, away)}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: tall ? 50 : 18,
            padding: tall ? "14px 34px" : "8px 24px",
            borderRadius: 999,
            fontFamily: "Barlow",
            fontSize: tall ? 40 : 28,
            letterSpacing: 2,
            background: h.tone === "live" ? BRAND.live : h.tone === "ft" ? BRAND.gold : "rgba(255,255,255,0.14)",
            color: h.tone === "ft" ? "#1a0710" : "#fff",
          }}
        >
          {h.label}
        </div>
        {scored && (sc("home").length > 0 || sc("away").length > 0) && (
          <div style={{ display: "flex", marginTop: tall ? 60 : 20, gap: tall ? 60 : 40 }}>
            {scorersBlock("home")}
            {scorersBlock("away")}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {tall && (isFinished(m.status) || m.status === "SCHEDULED") && (
          <div style={{ display: "flex", fontFamily: "Inter", fontSize: 30, color: "rgba(255,255,255,0.8)", marginBottom: 18 }}>
            {m.status === "SCHEDULED" ? "Predict the score and climb the leaderboard" : "Banter, predictions and Player of the Match"}
          </div>
        )}
        <div style={{ display: "flex", fontFamily: "Barlow", fontSize: tall ? 46 : 30, color: BRAND.gold, letterSpacing: 1 }}>eksusportshub.com.ng</div>
      </div>
    </div>
  );
}
