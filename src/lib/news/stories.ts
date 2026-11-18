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
  /** Lead photo. Dashboard-published stories may have none (a branded header is shown). */
  image: { src: string; alt: string; width: number; height: number } | null;
  gallery: { src: string; alt: string; width: number; height: number }[];
  imageCredit: string | null;
  matchId: string | null;
  /** Byline. Defaults to the EKSU Sports Hub desk; never an invented person. */
  author?: string;
}

const DIR = "/news/2026-11-15-downfall-school-gate";

const FT = "/news/2026-11-15-downfall-school-gate-ft";

const AMIGO = "/news/2026-11-17-amigo-unavailable";

const ENG = "/news/2026-11-17-engineering-training";

const MARK = "/news/2026-11-17-mark-ready";

const CBPS = "/news/2026-11-17-crystal-bams-political-science";

const PSFT = "/news/2026-11-17-political-science-beat-crystal-bams";

const KDHT = "/news/2026-11-17-khe-downfall-half-time";

const DFKFT = "/news/2026-11-17-downfall-beat-khe";

const C4T = "/news/2026-11-18-civil-400l-training";

const C5R = "/news/2026-11-18-civil-500l-ready";

const C4CB = "/news/2026-11-18-civil-400l-comeback";

export const STORIES: Story[] = [
  {
    id: "civil-400l-comeback-beat-civil-500l-3-2",
    published: true,
    featured: true,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-18T11:50:00+01:00",
    headline: "Civil 400L stage stunning comeback to beat 500L 3–2",
    summary:
      "Two goals down, Civil Engineering 400L hit back through Surprise, Femight and substitute Qd to win the departmental derby 3–2 in Wednesday's Sports Directorate friendly.",
    body: [
      "Civil Engineering 400 Level came from two goals down to beat Civil 500L 3–2 in a dramatic departmental derby on Wednesday morning.",
      "500L looked in control early on. Mentoli opened the scoring in the 8th minute and Lexi doubled the lead in the 24th to give the seniors a 2–0 cushion.",
      "But 400L refused to give up. Surprise pulled one back and Femight levelled the score, before substitute Qd, brought on for Alamite, completed the turnaround with the winner.",
      "It was a morning to remember for 400L, who were seen sharpening up before kick-off, while 500L will be left wondering how they let a two-goal lead slip.",
      "Bragging rights in Civil Engineering belong to 400L — for now.",
    ],
    image: { src: `${C4CB}/lead.jpg`, alt: "Civil Engineering 400L players on the pitch", width: 1600, height: 1200 },
    gallery: [{ src: `${C4CB}/squad.jpg`, alt: "Civil 400L players before kick-off", width: 1600, height: 1200 }],
    imageCredit: "EKSU Sports Hub",
    matchId: "bb6df3ea-ccb9-4351-9aaa-84fd10e91768",
  },
  {
    id: "civil-500l-gather-ahead-of-civil-400l-clash",
    published: true,
    featured: false,
    category: "TEAM_UPDATE",
    kind: "report",
    publishedAt: "2026-11-18T09:55:00+01:00",
    headline: "Civil Engineering 500L squad gathers, ready for 400L showdown",
    summary: "The 500L side came together on the pitch ahead of today's Sports Directorate friendly against Civil 400L, with 17 players named in their squad.",
    body: [
      "Civil Engineering 500 Level gathered on the pitch ahead of today's Sports Directorate friendly against Civil 400L.",
      "The squad came together for a team talk before kick-off, with plenty of smiles in the group as they got ready for the departmental derby.",
      "Teacha starts in goal for 500L, with Robbo, Black Sam, Rudiger and Oro in defence, Aluko, Lexi and Mentoli in midfield, and Otto, Jeff and Prince leading the attack. Dave, Manny, Imole, Active, Henry and Martins are on the bench.",
      "With 400L also out warming up, the stage is set for a battle of the levels. Follow it live on EKSU Sports Hub.",
    ],
    image: { src: `${C5R}/lead.jpg`, alt: "Civil Engineering 500L players gathered on the pitch before kick-off", width: 1600, height: 1200 },
    gallery: [
      { src: `${C5R}/team-talk.jpg`, alt: "Civil 500L players during their pre-match team talk", width: 1600, height: 1200 },
      { src: `${C5R}/gathered.jpg`, alt: "The Civil 500L squad together before the match", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "bb6df3ea-ccb9-4351-9aaa-84fd10e91768",
  },
  {
    id: "civil-400l-train-ahead-of-civil-500l-clash",
    published: true,
    featured: false,
    category: "TEAM_UPDATE",
    kind: "report",
    publishedAt: "2026-11-18T09:50:00+01:00",
    headline: "Civil Engineering 400L sharpen up ahead of 500L showdown",
    summary: "Civil 400L were spotted going through their paces on the pitch ahead of today's Sports Directorate friendly against Civil 500L.",
    body: [
      "Civil Engineering 400 Level were out on the pitch getting ready ahead of today's Sports Directorate friendly against Civil 500L.",
      "The players were seen passing the ball around, loosening up and talking through their shape as they prepared for the departmental clash.",
      "Bragging rights within Civil Engineering are on the line, with the two levels going head to head.",
      "Follow the match live on EKSU Sports Hub.",
    ],
    image: { src: `${C4T}/lead.jpg`, alt: "Civil Engineering 400L players on the pitch before the match", width: 1600, height: 1200 },
    gallery: [
      { src: `${C4T}/passing.jpg`, alt: "Civil 400L players passing the ball during their warm-up", width: 1600, height: 1200 },
      { src: `${C4T}/warm-up.jpg`, alt: "Civil 400L players talking on the pitch ahead of kick-off", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "bb6df3ea-ccb9-4351-9aaa-84fd10e91768",
  },
  {
    id: "downfall-beat-khe-4-3-jamal-mbappe-hat-trick",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-17T15:00:00+01:00",
    headline: "Jamal Mbappé hat-trick fires Downfall FC past KHE in seven-goal thriller",
    summary:
      "Jamal Mbappé struck three times in the second half, including a penalty, as Downfall FC beat KHE 4–3 in Tuesday's Sports Directorate friendly.",
    body: [
      "Downfall FC beat KHE 4–3 in a seven-goal thriller in Tuesday's Sports Directorate friendly, with Jamal Mbappé the hero after a second-half hat-trick.",
      "Mark gave Downfall the lead in the 14th minute before Damola equalised for KHE ten minutes later, and the sides went in level at 1–1. Muba was booked for KHE in the 30th minute.",
      "KHE edged in front for the first time when Classified scored in the 55th minute, but Jamal Mbappé took over. He levelled in the 59th minute, converted a penalty in the 68th after Downfall were awarded a spot kick a minute earlier, and completed his hat-trick in the 85th minute.",
      "KHE pulled one back from the spot through Damola in the 88th minute, but Downfall held on for the win.",
      "Downfall made four substitutions: Mr Money for Al Ameen (30'), Sammy for Beejay (33'), Zico for Tife (46') and Seeygo for Mark (89'). KHE brought on Foden for Gabriel (52').",
      "The result follows Downfall's 3–0 win over School Gate United on Sunday — two wins from two in this week's friendlies.",
    ],
    image: { src: `${DFKFT}/jamal-mbappe.jpg`, alt: "Hat-trick hero Jamal Mbappé of Downfall FC with the match ball", width: 1600, height: 1200 },
    gallery: [
      { src: `${DFKFT}/shot-on-goal.jpg`, alt: "A Downfall FC player shoots at goal", width: 1600, height: 1200 },
      { src: `${DFKFT}/aerial-duel.jpg`, alt: "Players challenge for a header in the box", width: 1600, height: 1200 },
      { src: `${DFKFT}/penalty-area.jpg`, alt: "Downfall FC attack the KHE penalty area", width: 1600, height: 1200 },
      { src: `${DFKFT}/comrade-challenge.jpg`, alt: "KHE's Comrade (19) challenges a Downfall FC player", width: 1600, height: 1200 },
      { src: `${DFKFT}/on-the-ball.jpg`, alt: "Players battle for the ball in midfield", width: 1600, height: 1200 },
      { src: `${DFKFT}/damola-embrace.jpg`, alt: "KHE's Damola (8) and a Downfall FC player embrace", width: 1600, height: 1200 },
      { src: `${DFKFT}/khe-pair.jpg`, alt: "Two KHE players on the pitch", width: 1600, height: 1200 },
      { src: `${DFKFT}/restart.jpg`, alt: "Players wait for the restart", width: 1600, height: 1200 },
      { src: `${DFKFT}/full-time-huddle.jpg`, alt: "Both teams gather at full-time", width: 1600, height: 1200 },
      { src: `${DFKFT}/handshakes.jpg`, alt: "Players shake hands after the final whistle", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4705804f-a7c5-40df-bfd2-184bbb3d62df",
  },
  {
    id: "khe-downfall-level-at-half-time",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-17T13:10:00+01:00",
    headline: "\"Mr Talk and Do\" Mark delivers, but KHE level with Downfall at the break",
    summary: "Mark put Downfall FC ahead on 14 minutes before Damola equalised for KHE, leaving the Sports Directorate friendly 1–1 at half-time.",
    body: [
      "KHE and Downfall FC go into half-time level at 1–1 in Tuesday's Sports Directorate friendly.",
      "Mark — Mr Talk and Do — backed up his pre-match promise to deliver, putting Downfall in front in the 14th minute.",
      "KHE hit back ten minutes later, Damola levelling the score in the 24th minute.",
      "KHE's Muba was booked in the 30th minute. Downfall made two changes before the break: Mr Money replaced Al Ameen on 30 minutes and Sammy came on for Beejay three minutes later.",
      "All to play for in the second half. Follow it live on EKSU Sports Hub.",
    ],
    image: { src: `${KDHT}/mark.jpg`, alt: "Downfall FC goalscorer Mark smiles on the pitch", width: 1200, height: 1600 },
    gallery: [
      { src: `${KDHT}/goalmouth.jpg`, alt: "Action in front of goal", width: 1600, height: 1200 },
      { src: `${KDHT}/midfield.jpg`, alt: "Downfall FC and KHE players in midfield", width: 1600, height: 1200 },
      { src: `${KDHT}/chase.jpg`, alt: "Players chase the ball across the pitch", width: 1200, height: 1600 },
      { src: `${KDHT}/break.jpg`, alt: "Players during a break in play", width: 1200, height: 1600 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4705804f-a7c5-40df-bfd2-184bbb3d62df",
  },
  {
    id: "political-science-beat-crystal-bams-4-0",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-17T12:25:00+01:00",
    headline: "Political Science hit four past Crystal Bams as super-sub Aloro shines",
    summary:
      "Four goals in 13 second-half minutes gave Political Science a 4–0 win in Tuesday's Sports Directorate friendly, with substitute Aloro named man of the match.",
    body: [
      "Political Science beat Crystal Bams 4–0 in Tuesday morning's Sports Directorate friendly, scoring all four goals in a devastating 13-minute spell after the break.",
      "The first half ended goalless, and both sides turned to their benches five minutes after the restart: Aloro replaced Iwobi for Political Science, while Matic came on for Bruno for Crystal Bams.",
      "The change sparked Political Science into life. Omo opened the scoring in the 64th minute, Tife doubled the lead four minutes later, Aloro got his name on the scoresheet in the 73rd minute and Santa completed the rout in the 77th.",
      "Aloro was named man of the match after making the difference from the bench.",
      "Crystal Bams will look to bounce back in their next outing, while Political Science can take plenty of confidence from a ruthless second-half display.",
    ],
    image: { src: `${PSFT}/aloro.jpg`, alt: "Man of the match Aloro of Political Science", width: 1200, height: 1600 },
    gallery: [
      { src: `${PSFT}/aloro-celebrates.jpg`, alt: "Aloro on the pitch after the final whistle", width: 1200, height: 1600 },
      { src: `${PSFT}/second-half.jpg`, alt: "Players spread across the pitch in the second half", width: 1600, height: 1200 },
      { src: `${PSFT}/goalmouth.jpg`, alt: "Players gather in the goalmouth", width: 1200, height: 1600 },
      { src: `${PSFT}/goalmouth-2.jpg`, alt: "Players crowd the penalty area", width: 1200, height: 1600 },
      { src: `${PSFT}/touchline.jpg`, alt: "A player watches from the touchline", width: 1200, height: 1600 },
      { src: `${PSFT}/play-resumes.jpg`, alt: "Players take their positions as play resumes", width: 1200, height: 1600 },
      { src: `${PSFT}/full-time.jpg`, alt: "Players leave the pitch at full-time", width: 1200, height: 1600 },
      { src: `${PSFT}/walking-off.jpg`, alt: "Players walk off at the final whistle", width: 1200, height: 1600 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "87b9f992-8b3f-405a-b3d7-7586340f1cca",
  },
  {
    id: "crystal-bams-political-science-goalless-half-time",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-17T11:35:00+01:00",
    headline: "Crystal Bams and Political Science level at 0–0 at half-time",
    summary: "Nothing to separate the sides after the first half of Tuesday morning's Sports Directorate friendly.",
    body: [
      "Crystal Bams and Political Science go into the break level at 0–0 in Tuesday morning's Sports Directorate friendly.",
      "Neither side found the net in the first half, and no cards or substitutions were recorded.",
      "Both teams lined up in a 4-3-3. Crystal Bams have Matic available on the bench for the second half.",
      "Everything is still to play for. Follow the second half live on EKSU Sports Hub.",
    ],
    image: { src: `${CBPS}/lead.jpg`, alt: "Players from both teams take their positions on the pitch", width: 1600, height: 1200 },
    gallery: [
      { src: `${CBPS}/midfield.jpg`, alt: "Players spread across the pitch during the first half", width: 1600, height: 1200 },
      { src: `${CBPS}/in-position.jpg`, alt: "Players hold their positions on the red-earth pitch", width: 1600, height: 1200 },
      { src: `${CBPS}/waiting-for-play.jpg`, alt: "Players wait for play to restart", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "87b9f992-8b3f-405a-b3d7-7586340f1cca",
  },
  {
    id: "mark-fit-for-downfall-v-khe",
    published: true,
    featured: false,
    category: "PLAYER_SPOTLIGHT",
    kind: "report",
    publishedAt: "2026-11-17T09:10:00+01:00",
    headline: "Mark fully fit and ready for Downfall's clash with KHE",
    summary: "Downfall FC's number 11 is fit for today's friendly against KHE and is hoping to deliver a good performance.",
    body: [
      "Mark is fully fit and ready for Downfall FC's Sports Directorate friendly against KHE today, Tuesday 17 November.",
      "The number 11 is in Downfall's starting line-up and goes into the game hoping to deliver a good performance for his side.",
      "Downfall come into the match on the back of Sunday's 3–0 win over School Gate United. Kick-off is at 11:30 AM.",
      "Follow every moment live on EKSU Sports Hub.",
    ],
    image: { src: `${MARK}/lead.jpg`, alt: "Mark of Downfall FC on the ball", width: 608, height: 1080 },
    gallery: [
      { src: `${MARK}/on-the-ball.jpg`, alt: "Mark, number 11, brings the ball under control", width: 608, height: 1080 },
      { src: `${MARK}/in-action.jpg`, alt: "Mark in action for Downfall FC", width: 608, height: 1080 },
      { src: `${MARK}/corner-flag.jpg`, alt: "Mark by the corner flag", width: 608, height: 1080 },
      { src: `${MARK}/on-the-pitch.jpg`, alt: "Mark on the pitch in Downfall FC's orange kit", width: 608, height: 1080 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4705804f-a7c5-40df-bfd2-184bbb3d62df",
  },
  {
    id: "engineering-training-ahead-of-competition",
    published: true,
    featured: false,
    category: "TEAM_UPDATE",
    kind: "report",
    publishedAt: "2026-11-17T00:25:00+01:00",
    headline: "Engineering turn up the intensity ahead of the new competition",
    summary:
      "Cones out, boots laced, no shortcuts: Engineering's footballers put in a hard shift on the training pitch, within sight of the university's main gate, as they build up to the upcoming competition.",
    body: [
      "Engineering are not waiting for the big kick-off to get serious. The team's footballers were out on the training pitch putting in the work ahead of the upcoming competition.",
      "The session had a bit of everything: laps around the pitch to build the legs, quick-feet work weaving through the cones, and a small-sided game to finish, played out in the shadow of the Ekiti State University main gate.",
      "The mood was sharp and the energy high, with players pushing each other through the drills and celebrating the good moments along the way.",
      "Fixtures will appear on EKSU Sports Hub as soon as they are confirmed. Follow Engineering's journey, and every match, live here.",
    ],
    image: { src: `${ENG}/lead.jpg`, alt: "Engineering players in a small-sided game in front of the Ekiti State University main gate", width: 1200, height: 1600 },
    gallery: [
      { src: `${ENG}/laps.jpg`, alt: "Players running laps around the training pitch", width: 1200, height: 1600 },
      { src: `${ENG}/cone-drills.jpg`, alt: "Quick-feet work through the cones", width: 1200, height: 1600 },
      { src: `${ENG}/celebration.jpg`, alt: "A player leaps in celebration during the session", width: 1200, height: 1600 },
      { src: `${ENG}/small-sided-game.jpg`, alt: "Players battle for the ball in a small-sided game", width: 1200, height: 1600 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: null,
  },
  {
    id: "amigo-unavailable-downfall-v-khe",
    published: true,
    featured: false,
    category: "TEAM_UPDATE",
    kind: "report",
    publishedAt: "2026-11-17T00:20:00+01:00",
    headline: "Amigo left out of Downfall FC line-up for KHE friendly",
    summary: "Amigo will not be available for Downfall FC's Sports Directorate friendly against KHE today, Tuesday 17 November.",
    body: [
      "Amigo has been left out of Downfall FC's line-up for today's Sports Directorate friendly against KHE and will not be available for the match.",
      "Kick-off is at 11:30 AM on Tuesday 17 November.",
      "Downfall go into the game after Sunday's 3–0 win over School Gate United.",
      "Follow the match live on EKSU Sports Hub.",
    ],
    image: { src: `${AMIGO}/lead.jpg`, alt: "A Downfall FC player in action, alongside the Downfall FC crest", width: 1600, height: 1200 },
    gallery: [{ src: `${AMIGO}/photo.jpg`, alt: "Downfall FC players in their orange kit on the pitch", width: 900, height: 1600 }],
    imageCredit: "EKSU Sports Hub",
    matchId: "4705804f-a7c5-40df-bfd2-184bbb3d62df",
  },
  {
    id: "preview-khe-v-downfall-17-nov",
    published: true,
    featured: false,
    category: "UPDATE",
    kind: "report",
    publishedAt: "2026-11-16T20:30:00+01:00",
    headline: "Preview: Downfall FC take on KHE in Tuesday friendly",
    summary:
      "Fresh from Sunday's 3–0 win over School Gate United, Downfall FC face KHE at 11:30 on Tuesday 17 November in a Sports Directorate friendly.",
    body: [
      "Downfall FC are back in action on Tuesday 17 November, when they face KHE in a Sports Directorate friendly. Kick-off is at 11:30 AM.",
      "Downfall go into the game on the back of Sunday's 3–0 win over School Gate United, when goals from Al Ameen, Zico (penalty) and substitute Seeygo gave them a clean-sheet victory.",
      "The match is a friendly, not part of any league or cup, so no points or table are at stake. It is the second of two friendlies on Tuesday, following Crystal Bams against Political Science at 10:00 AM.",
      "The Sports Directorate has asked all teams to arrive at the pitch before their assigned time. Follow the match live on EKSU Sports Hub.",
    ],
    image: { src: `${FT}/shape.jpg`, alt: "Downfall FC in action against School Gate United on Sunday", width: 1600, height: 1200 },
    gallery: [],
    imageCredit: "EKSU Sports Hub",
    matchId: "4705804f-a7c5-40df-bfd2-184bbb3d62df",
  },
  {
    id: "downfall-beat-school-gate-3-0",
    published: true,
    featured: false,
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
