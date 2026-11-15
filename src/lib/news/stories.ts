/**
 * Sports News published on EKSU Sports Hub itself (until Amigo World's
 * article platform launches). Editorial content: only facts recorded in the
 * official match data, no invented quotes or statistics; photos credited.
 * Publishing = an approved, reviewed change to this list. To unpublish, set
 * `published: false` (or remove the entry).
 */
import type { NewsCategory } from "./feed";

export interface Story {
  id: string;
  published: boolean;
  featured: boolean;
  category: NewsCategory;
  kind: "report" | "opinion";
  publishedAt: string;
  headline: string;
  summary: string;
  body: string[];
  image: { src: string; alt: string; width: number; height: number };
  gallery: { src: string; alt: string; width: number; height: number }[];
  imageCredit: string | null;
  matchId: string | null;
}

const DIR = "/news/2026-11-15-downfall-school-gate";

const FT = "/news/2026-11-15-downfall-school-gate-ft";

export const STORIES: Story[] = [
  {
    id: "downfall-beat-school-gate-3-0",
    published: true,
    featured: true,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-15T09:15:00+01:00",
    headline: "Downfall FC beat School Gate United 3–0",
    summary:
      "Goals from Al Ameen and Zico before the break, then substitute Seeygo on 83 minutes, gave Downfall a clean-sheet win in Sunday's Sports Directorate friendly.",
    body: [
      "Downfall FC beat School Gate United 3–0 in Sunday morning's Sports Directorate friendly, keeping a clean sheet.",
      "Al Ameen opened the scoring in the 38th minute, and Zico made it 2–0 from the penalty spot in the 43rd to give Downfall a two-goal lead at half-time.",
      "Seeygo came on for Al Ameen in the 63rd minute and sealed the win with Downfall's third goal in the 83rd. Beejay replaced Tokunbo in the 86th minute.",
      "Three yellow cards were shown: Richard (Downfall FC, 22'), Elijah (School Gate United, 28') and Mr Money (Downfall FC, 62').",
    ],
    image: { src: `${FT}/lead.jpg`, alt: "Players from both teams track the ball in midfield", width: 1600, height: 1200 },
    gallery: [
      { src: `${FT}/header.jpg`, alt: "Players watch a high ball drop in midfield", width: 1200, height: 1600 },
      { src: `${FT}/player-down.jpg`, alt: "A player in red sits on the pitch as play continues", width: 1200, height: 1600 },
      { src: `${FT}/build-up.jpg`, alt: "A player in orange shields the ball", width: 1200, height: 1600 },
      { src: `${FT}/shape.jpg`, alt: "Players hold their positions during the second half", width: 1600, height: 1200 },
      { src: `${FT}/counter.jpg`, alt: "Players break forward across the pitch", width: 1600, height: 1200 },
      { src: `${FT}/appeal.jpg`, alt: "A player raises an arm as play moves upfield", width: 1600, height: 1200 },
      { src: `${FT}/restart.jpg`, alt: "Players return to position for a restart", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "12684ff4-d1c5-4173-86c8-884381330409",
  },
  {
    id: "downfall-lead-school-gate-at-half-time",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-15T08:20:00+01:00",
    headline: "Downfall FC lead School Gate United 2–0 at half-time",
    summary:
      "Al Ameen opened the scoring on 38 minutes and Zico converted a penalty on 43 to give Downfall a two-goal lead at the break in Sunday's Sports Directorate friendly.",
    body: [
      "Downfall FC went into half-time two goals up against School Gate United in Sunday morning's Sports Directorate friendly.",
      "Al Ameen broke the deadlock in the 38th minute, and Zico doubled the lead from the penalty spot five minutes later.",
      "Both sides were shown a yellow card in the first half: Richard of Downfall FC in the 22nd minute and Elijah of School Gate United in the 28th.",
      "School Gate United have 45 minutes to respond. Follow the second half live on EKSU Sports Hub.",
    ],
    image: { src: `${DIR}/lead.jpg`, alt: "A School Gate United player strikes the ball as a Downfall FC player closes in", width: 1600, height: 1200 },
    gallery: [
      { src: `${DIR}/aerial-duel.jpg`, alt: "Players from both teams contest a high ball", width: 1200, height: 1600 },
      { src: `${DIR}/downfall-player.jpg`, alt: "A Downfall FC player in orange during the first half", width: 1600, height: 1200 },
      { src: `${DIR}/injury-stoppage.jpg`, alt: "Play stopped while a player receives attention near the goal", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "12684ff4-d1c5-4173-86c8-884381330409",
  },
];

export const publishedStories = () =>
  STORIES.filter((s) => s.published).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

export const getStory = (id: string) => publishedStories().find((s) => s.id === id) ?? null;
