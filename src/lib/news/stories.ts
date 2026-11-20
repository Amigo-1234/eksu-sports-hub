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

const SVU = "/news/2026-11-18-saviola-beat-unstoppable";

const MSSN = "/news/2026-11-19-mssn-league-kicks-off";

const DSWU = "/news/2026-11-19-darul-saadah-warm-up";

const MKO = "/news/2026-11-19-mssn-kick-off";

const OKP = "/news/2026-11-19-okikiola-penalty";

const OLFK = "/news/2026-11-19-olaleye-free-kick";

const DSHT = "/news/2026-11-19-darul-saadah-darul-hudah-ht";

const OL2 = "/news/2026-11-19-olaleye-second-free-kick";

const AKR = "/news/2026-11-19-akanbi-sent-off";

const DSFT = "/news/2026-11-19-darul-saadah-beat-darul-hudah-ft";

const MD2 = "/news/2026-11-20-mssn-day-2-kick-off";

const DHIHT = "/news/2026-11-20-darul-haq-iworoko-ht";

const DHG = "/news/2026-11-20-darul-haq-guests";

export const STORIES: Story[] = [
  {
    id: "guests-in-attendance-at-darul-haq-v-iworoko-humah",
    published: true,
    featured: true,
    category: "COMPETITION",
    kind: "report",
    publishedAt: "2026-11-20T10:11:00+01:00",
    headline: "Guests turn out for Darul Haq v Iworoko Humah",
    summary:
      "Guests were in attendance at the pitch on Friday morning to watch Darul Haq take on Iworoko Humah in the MSSN EKSU Football League.",
    body: [
      "Darul Haq against Iworoko Humah drew guests to the pitch on Friday morning, as the MSSN EKSU Football League continued with its second day of action.",
      "The guests sat together by the side of the pitch to watch the Week 1 match, with spectators gathered behind them and volunteers in orange bibs on hand.",
      "Their presence added to the occasion as both teams chased their first points of the season.",
      "Follow Darul Haq v Iworoko Humah live on EKSU Sports Hub.",
    ],
    image: { src: `${DHG}/lead.jpg`, alt: "Guests seated by the pitch at Darul Haq against Iworoko Humah", width: 1080, height: 810 },
    gallery: [
      { src: `${DHG}/guests-2.jpg`, alt: "Guests watching from the side of the pitch", width: 1080, height: 810 },
      { src: `${DHG}/guests-3.jpg`, alt: "Guests seated together at the MSSN League match", width: 1080, height: 810 },
      { src: `${DHG}/guests-4.jpg`, alt: "Guests in attendance at the match, with spectators behind", width: 1080, height: 810 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "cfbc483d-8201-4a2b-8084-f5d4950bad6d",
  },
  {
    id: "darul-haq-iworoko-humah-goalless-at-half-time",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-20T09:54:00+01:00",
    headline: "Darul Haq and Iworoko Humah goalless at the break",
    summary:
      "Darul Haq and Iworoko Humah are level at 0–0 at half-time in their MSSN League Week 1 match, with one booking for each side.",
    body: [
      "Darul Haq and Iworoko Humah go into the break level at 0–0 in Friday's MSSN EKSU Football League match.",
      "Both goals came under pressure in a busy first half, with players sliding in and the ball bouncing around the goalmouth, but neither side could find the finish.",
      "The referee showed two yellow cards in the 24th minute, one for each team: Kabir Wasiu of Iworoko Humah and Adebayo Faisol of Darul Haq.",
      "Both teams are chasing their first points of the season. Follow the second half live on EKSU Sports Hub.",
    ],
    image: { src: `${DHIHT}/lead.jpg`, alt: "Players slide in as the ball bounces in front of goal during the first half", width: 1600, height: 1200 },
    gallery: [
      { src: `${DHIHT}/goalmouth-scramble.jpg`, alt: "A scramble in front of goal kicks up dust", width: 1600, height: 1200 },
      { src: `${DHIHT}/shot.jpg`, alt: "A player shoots as the goalkeeper dives", width: 1600, height: 1200 },
      { src: `${DHIHT}/on-the-ball.jpg`, alt: "A player in blue brings the ball under control", width: 1600, height: 1200 },
      { src: `${DHIHT}/on-the-run.jpg`, alt: "A player in blue runs with the ball", width: 1600, height: 1200 },
      { src: `${DHIHT}/player-look.jpg`, alt: "Players walk back into position", width: 1600, height: 1200 },
      { src: `${DHIHT}/player-rest.jpg`, alt: "A player catches his breath during the first half", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "cfbc483d-8201-4a2b-8084-f5d4950bad6d",
  },
  {
    id: "mssn-league-day-2-darul-haq-v-iworoko-humah-kicks-off",
    published: true,
    featured: false,
    category: "COMPETITION",
    kind: "report",
    publishedAt: "2026-11-20T09:19:00+01:00",
    headline: "MSSN League Day 2 under way: Darul Haq v Iworoko Humah kicks off",
    summary:
      "Day 2 of the MSSN EKSU Football League has started, with Darul Haq and Iworoko Humah shaking hands before their Week 1 meeting on Friday morning.",
    body: [
      "The MSSN EKSU Football League is back for Day 2. Darul Haq and Iworoko Humah kicked off their Week 1 match on Friday morning after the traditional line-up and handshakes in the middle of the pitch.",
      "The captains met the referee for the coin toss before both teams walked out, then lined up side by side and greeted each other ahead of kick-off.",
      "Both sides set up in a 4-2-3-1. Darul Haq have Olayiwola Abdulsamad in goal and Amuda Muhammed leading the attack, while Iworoko Humah start with Quadri in goal and Adewoye Malik up front.",
      "The two teams are chasing their first points of the season. Darul Saadah lead the table after beating Darul Hudah 4–1 in Thursday's opener, while Shonibare against Darul Hikmah was postponed.",
      "Follow Darul Haq v Iworoko Humah live on EKSU Sports Hub for the score, line-ups and every key moment.",
    ],
    image: { src: `${MD2}/lead.jpg`, alt: "Darul Haq and Iworoko Humah players shake hands before kick-off", width: 1600, height: 1200 },
    gallery: [
      { src: `${MD2}/handshakes.jpg`, alt: "Players from both teams greet each other in the pre-match line", width: 1600, height: 1200 },
      { src: `${MD2}/handshakes-2.jpg`, alt: "Handshakes along the line before the match", width: 1600, height: 1200 },
      { src: `${MD2}/handshakes-3.jpg`, alt: "The two teams lined up side by side before kick-off", width: 1600, height: 1200 },
      { src: `${MD2}/line-up.jpg`, alt: "Players lined up before the match with spectators watching", width: 1600, height: 1200 },
      { src: `${MD2}/walk-out.jpg`, alt: "Players run past the line before kick-off", width: 1600, height: 1200 },
      { src: `${MD2}/coin-toss.jpg`, alt: "The referee with the two captains at the coin toss", width: 1600, height: 1200 },
      { src: `${MD2}/coin-toss-2.jpg`, alt: "The captains and referee in the centre circle", width: 1600, height: 1200 },
      { src: `${MD2}/coin-toss-3.jpg`, alt: "The captains talk with the referee before kick-off", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "cfbc483d-8201-4a2b-8084-f5d4950bad6d",
  },
  {
    id: "darul-saadah-beat-darul-hudah-4-1-mssn-league-opener",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-19T10:02:00+01:00",
    headline: "Darul Saadah beat Darul Hudah 4–1 to top the MSSN League",
    summary:
      "Captain Olaleye Habeeb scored twice from free kicks as Darul Saadah won the MSSN EKSU Football League opener 4–1, despite finishing with ten men.",
    body: [
      "Darul Saadah are the first leaders of the MSSN EKSU Football League 2026/2027 after beating Darul Hudah 4–1 in Thursday morning's opening match.",
      "Shamsudeen Okikiola scored the league's first goal from the penalty spot in the 12th minute, and captain Olaleye Habeeb doubled the lead with a direct free kick in the 20th.",
      "Darul Hudah hit back five minutes before half-time through Satar, leaving it 2–1 at the break.",
      "Darul Hudah brought on Abdul Salam for Abdulrasaq at the start of the second half, but Olaleye struck again from a free kick in the 58th minute. Ayaniyi Muhammed added the fourth in the 75th.",
      "Darul Saadah finished with ten men after centre back Akanbi Abdulsobur was shown a second yellow card in the 77th minute. Abdulmalik Aro and Shamsudeen Okikiola were also booked for Darul Saadah, and Abdulafeez for Darul Hudah.",
      "The win puts Darul Saadah top of the table on three points with a goal difference of +3, and Olaleye leads the scoring chart with two goals. At the end, players from both sides shook hands and embraced on the pitch.",
      "Next up in Week 1: Shonibare play Darul Hikmah. Follow every match live on EKSU Sports Hub.",
    ],
    image: { src: `${DSFT}/lead.jpg`, alt: "Darul Hudah players shake hands and embrace with match staff at full-time", width: 1600, height: 1200 },
    gallery: [
      { src: `${DSFT}/saadah-smiles.jpg`, alt: "Darul Saadah players on the pitch after the win", width: 1600, height: 1200 },
      { src: `${DSFT}/handshakes.jpg`, alt: "Handshakes on the pitch after the final whistle", width: 1600, height: 1200 },
      { src: `${DSFT}/laughs.jpg`, alt: "Smiles among the players and match crew at full-time", width: 1600, height: 1200 },
      { src: `${DSFT}/saadah-run.jpg`, alt: "A Darul Saadah player during the second half", width: 1600, height: 1200 },
      { src: `${DSFT}/player-down.jpg`, alt: "A Darul Hudah player down on the pitch during the second half", width: 1600, height: 1200 },
      { src: `${DSFT}/referee.jpg`, alt: "The referee during the second half of Darul Saadah against Darul Hudah", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "akanbi-sent-off-darul-saadah-down-to-ten",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-19T09:50:00+01:00",
    headline: "Akanbi sent off as Darul Saadah go down to ten men at 4–1",
    summary:
      "Darul Saadah centre back Akanbi Abdulsobur was sent off for a second yellow card in the 77th minute, two minutes after Ayaniyi Muhammed made it 4–1 against Darul Hudah.",
    body: [
      "Darul Saadah will finish the MSSN League opener with ten men. Centre back Akanbi Abdulsobur was shown a second yellow card in the 77th minute and sent off.",
      "Akanbi, wearing number 4, had first been booked in the 36th minute, one of two Darul Saadah centre backs cautioned in the first half.",
      "The red card came just two minutes after Darul Saadah had extended their lead. Ayaniyi Muhammed scored in the 75th minute to make it 4–1, following Shamsudeen Okikiola's penalty and two free kicks from captain Olaleye Habeeb.",
      "Even with a man down, Darul Saadah still hold a three-goal lead over Darul Hudah and sit top of the live MSSN League table. Follow the closing minutes live on EKSU Sports Hub.",
    ],
    image: { src: `${AKR}/lead.jpg`, alt: "Darul Saadah's Akanbi Abdulsobur walks off the pitch after his red card", width: 1600, height: 1200 },
    gallery: [
      { src: `${AKR}/walking-off.jpg`, alt: "Akanbi Abdulsobur of Darul Saadah leaves the pitch", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "olaleye-second-free-kick-darul-saadah-3-1",
    published: true,
    featured: false,
    category: "PLAYER_SPOTLIGHT",
    kind: "report",
    publishedAt: "2026-11-19T09:35:00+01:00",
    headline: "Olaleye does it again: second free kick puts Darul Saadah 3–1 up",
    summary:
      "Darul Saadah captain Olaleye Habeeb scored his second direct free kick of the game in the 58th minute to make it 3–1 against Darul Hudah.",
    body: [
      "Olaleye Habeeb is having a morning to remember. The Darul Saadah captain scored his second direct free kick of the match in the 58th minute to make it 3–1 against Darul Hudah in the MSSN EKSU Football League opener.",
      "Darul Hudah set up their wall and packed the goalmouth, but Olaleye struck the ball over the defenders and into the net, just as he had in the first half.",
      "The goal came three minutes after Darul Hudah's Abdulafeez was shown a yellow card.",
      "Olaleye now has two goals in the game, adding to Shamsudeen Okikiola's first-half penalty. Satar scored Darul Hudah's goal before the break.",
      "On the live MSSN League table, Darul Saadah sit top while the match goes on. Follow the rest of the game live on EKSU Sports Hub.",
    ],
    image: { src: `${OL2}/lead.jpg`, alt: "Darul Saadah captain Olaleye Habeeb strikes the free kick towards the Darul Hudah goal", width: 1600, height: 1200 },
    gallery: [
      { src: `${OL2}/lining-up.jpg`, alt: "A Darul Saadah player stands over the ball before the free kick", width: 1600, height: 1200 },
      { src: `${OL2}/wall-set.jpg`, alt: "Darul Hudah set up to defend the free kick", width: 1600, height: 1200 },
      { src: `${OL2}/ball-in-flight.jpg`, alt: "The ball flies towards the Darul Hudah goal", width: 1600, height: 1200 },
      { src: `${OL2}/goalmouth.jpg`, alt: "Players from both teams in the Darul Hudah goalmouth", width: 1600, height: 1200 },
      { src: `${OL2}/after.jpg`, alt: "Darul Hudah players react in front of their goal", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "darul-saadah-lead-darul-hudah-2-1-at-half-time",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-19T09:07:00+01:00",
    headline: "Satar strikes before the break as Darul Saadah lead Darul Hudah 2–1",
    summary:
      "Darul Saadah lead 2–1 at half-time in the MSSN League opener, but Satar's goal five minutes before the break has given Darul Hudah hope.",
    body: [
      "Darul Saadah lead Darul Hudah 2–1 at half-time in the opening match of the MSSN EKSU Football League, but the game is far from over.",
      "Shamsudeen Okikiola opened the scoring from the penalty spot in the 12th minute, and captain Olaleye Habeeb doubled the lead with a free kick eight minutes later.",
      "Darul Saadah's defence was then shown two yellow cards: centre backs Akanbi Abdulsobur in the 36th minute and Abdulmalik Aro in the 40th.",
      "Darul Hudah made them pay. In the 40th minute, five minutes before the break, striker Satar found the net to cut the gap to one goal.",
      "With two of their centre backs on a booking, Darul Saadah will need to be careful in the second half. Follow it live on EKSU Sports Hub.",
    ],
    image: { src: `${DSHT}/lead.jpg`, alt: "A Darul Hudah player in blue and a Darul Saadah player in pink challenge for the ball", width: 1600, height: 1200 },
    gallery: [
      { src: `${DSHT}/darul-hudah-ball.jpg`, alt: "A Darul Hudah player holds the match ball", width: 1600, height: 1200 },
      { src: `${DSHT}/player-down.jpg`, alt: "A Darul Hudah player is helped up after going down in the first half", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "captain-olaleye-free-kick-doubles-darul-saadah-lead",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-19T08:47:00+01:00",
    headline: "Captain Olaleye's free kick puts Darul Saadah 2–0 up",
    summary:
      "Darul Saadah captain Olaleye Habeeb scored from a free kick in the 20th minute to double his side's lead over Darul Hudah in the MSSN League opener.",
    body: [
      "Darul Saadah have doubled their lead in the opening match of the MSSN EKSU Football League. Captain Olaleye Habeeb scored from a free kick in the 20th minute to make it 2–0 against Darul Hudah.",
      "It came eight minutes after Shamsudeen Okikiola had opened the scoring from the penalty spot.",
      "Darul Hudah, in blue, packed the area to defend the set piece, but Olaleye, wearing the number 1 shirt in midfield, found the net to lead from the front.",
      "Follow the rest of the match live on EKSU Sports Hub.",
    ],
    image: { src: `${OLFK}/lead.jpg`, alt: "The ball flies towards goal as Darul Saadah attack from a free kick against Darul Hudah", width: 1600, height: 1200 },
    gallery: [
      { src: `${OLFK}/box.jpg`, alt: "Players from both teams in the Darul Hudah penalty area", width: 1600, height: 1200 },
      { src: `${OLFK}/wall.jpg`, alt: "Darul Hudah players defend a set piece near their goal", width: 1600, height: 1200 },
      { src: `${OLFK}/set-piece.jpg`, alt: "Darul Saadah and Darul Hudah players wait for the free kick", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "okikiola-scores-first-mssn-league-goal-from-the-spot",
    published: true,
    featured: false,
    category: "PLAYER_SPOTLIGHT",
    kind: "report",
    publishedAt: "2026-11-19T08:38:00+01:00",
    headline: "Okikiola scores the MSSN League's first goal from the spot",
    summary:
      "Shamsudeen Okikiola converted a 12th-minute penalty to put Darul Saadah 1–0 up against Darul Hudah and score the first goal of the MSSN EKSU Football League.",
    body: [
      "Shamsudeen Okikiola has written his name into the record books as the scorer of the first goal of the MSSN EKSU Football League 2026/2027.",
      "Darul Saadah were awarded a penalty in the 12th minute of the opening match against Darul Hudah, and Okikiola, wearing the number 10 shirt, stepped up to take it.",
      "He sent the goalkeeper the wrong way and rolled the ball into the net to give Darul Saadah a 1–0 lead.",
      "Okikiola started on the left wing in Darul Saadah's 4-3-3. Follow the rest of the match live on EKSU Sports Hub.",
    ],
    image: { src: `${OKP}/lead.jpg`, alt: "The goalkeeper dives the wrong way as Shamsudeen Okikiola's penalty goes in for Darul Saadah", width: 1600, height: 1200 },
    gallery: [
      { src: `${OKP}/run-up.jpg`, alt: "Shamsudeen Okikiola steps up to take the penalty for Darul Saadah", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "mssn-league-kicks-off-darul-saadah-v-darul-hudah",
    published: true,
    featured: false,
    category: "COMPETITION",
    kind: "report",
    publishedAt: "2026-11-19T08:26:00+01:00",
    headline: "MSSN League is under way: Darul Saadah v Darul Hudah kicks off",
    summary:
      "The MSSN EKSU Football League 2026/2027 has started. Darul Saadah and Darul Hudah lined up together before the opening match kicked off on Thursday morning.",
    body: [
      "The MSSN EKSU Football League 2026/2027 is officially under way. Darul Saadah and Darul Hudah kicked off the opening match of the season on Thursday morning.",
      "Before the start, both teams walked out with the match officials and lined up side by side on the pitch: Darul Saadah in pink, Darul Hudah in blue.",
      "Darul Saadah, captained by Olaleye Habeeb, set up in a 4-3-3 with Abdulwasiu Ayomipo leading the line. Darul Hudah also lined up in a 4-3-3, with Satar up front and Abdulsalam in goal.",
      "It is the first of 45 matches in the league, with ten teams competing for the title over the next nine weeks.",
      "Follow the match live on EKSU Sports Hub for the score, line-ups and every key moment.",
    ],
    image: { src: `${MKO}/lead.jpg`, alt: "Darul Hudah in blue and Darul Saadah in pink line up with the match officials before kick-off", width: 1600, height: 1200 },
    gallery: [
      { src: `${MKO}/walk-out.jpg`, alt: "Players from both teams walk out with a match official before the opening match", width: 1600, height: 1200 },
      { src: `${MKO}/line-up-side.jpg`, alt: "The two teams line up on the pitch before kick-off", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "darul-saadah-warm-up-for-mssn-opener",
    published: true,
    featured: false,
    category: "TEAM_UPDATE",
    kind: "report",
    publishedAt: "2026-11-19T08:10:00+01:00",
    headline: "Darul Saadah warm up for MSSN League opener",
    summary:
      "Darul Saadah are warming up in their pink kit ahead of the first match of the MSSN EKSU Football League against Darul Hudah.",
    body: [
      "Darul Saadah are on the pitch and getting ready for the opening match of the MSSN EKSU Football League 2026/2027 against Darul Hudah.",
      "Dressed in their pink and purple kit, the players gathered on the track for a team talk before heading out to loosen up with the ball.",
      "Captain Olaleye Habeeb leads the side, and Darul Saadah's line-up has been confirmed on EKSU Sports Hub in a 4-3-3 formation, with Abdulwasiu Ayomipo leading the attack.",
      "This is the first of 45 matches in the league. Follow it live on EKSU Sports Hub for the score, line-ups and every key moment.",
    ],
    image: { src: `${DSWU}/lead.jpg`, alt: "Darul Saadah players in pink kit gather on the track before the match", width: 1600, height: 901 },
    gallery: [
      { src: `${DSWU}/squad-huddle.jpg`, alt: "Darul Saadah players talk beside the pitch before warm-up", width: 1600, height: 901 },
      { src: `${DSWU}/gathered.jpg`, alt: "Darul Saadah players gathered on the track", width: 1600, height: 901 },
      { src: `${DSWU}/ball-work.jpg`, alt: "Darul Saadah players warming up with the ball", width: 1600, height: 1200 },
      { src: `${DSWU}/passing.jpg`, alt: "A Darul Saadah player kicks the ball during warm-up", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "mssn-eksu-football-league-kicks-off-tomorrow",
    published: true,
    featured: false,
    category: "COMPETITION",
    kind: "report",
    publishedAt: "2026-11-18T18:36:00+01:00",
    headline: "MSSN EKSU Football League kicks off tomorrow",
    summary:
      "Ten teams, 45 matches, one trophy: the MSSN EKSU Football League 2026/2027 starts on Thursday with Darul Saadah against Darul Hudah.",
    body: [
      "The wait is over. The MSSN EKSU Football League 2026/2027 kicks off tomorrow, Thursday 19 November, with ten teams chasing the title.",
      "The league is a single round robin: every team plays every other team once, making 45 matches over nine weeks, with the final round on Saturday 16 January 2027. A win is worth three points and a draw one.",
      "The ten teams are Darul Haq, Darul Hikmah, Darul Hudah, Darul Saadah, Darul Salam, Darul Sunah, Iworoko Humah, Satellite Humah, School Gate Humah and Shonibare.",
      "Darul Saadah and Darul Hudah open the season at 7:00 AM on Thursday, followed by Shonibare against Darul Hikmah at 9:00 AM.",
      "Week 1 continues on Friday with Darul Haq against Iworoko Humah at 10:00, and ends on Saturday with School Gate Humah against Darul Sunah at 10:00 and Darul Salam against Darul Hikmah at 12:00.",
      "Follow every match live on EKSU Sports Hub, with live scores, line-ups and the league table updated after every game.",
    ],
    image: { src: `${MSSN}/lead.jpg`, alt: "Gold trophy graphic: MSSN EKSU Football League kicks off Thursday 19 November", width: 1600, height: 1200 },
    gallery: [],
    imageCredit: "EKSU Sports Hub",
    matchId: "4c24c4ca-fe1b-4ad3-9d8b-6355e7a3182c",
  },
  {
    id: "saviola-beat-unstoppable-3-0",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-18T14:39:00+01:00",
    headline: "Taiwo double fires Saviola past Unstoppable 3–0",
    summary:
      "Taiwo scored twice and Holy-sinner added the other as Saviola beat Unstoppable 3–0 in Wednesday's Sports Directorate friendly.",
    body: [
      "Saviola kept a clean sheet and beat Unstoppable 3–0 in Wednesday morning's Sports Directorate friendly.",
      "Taiwo was the star of the show with two goals, and Holy-sinner got the other to complete a comfortable win.",
      "Unstoppable could not find a way past the Saviola defence and finished the game without a goal.",
      "Full details are on the match page on EKSU Sports Hub.",
    ],
    image: { src: `${SVU}/lead.jpg`, alt: "Full-time graphic: Saviola 3–0 Unstoppable, scorers Taiwo (2) and Holy-sinner", width: 1600, height: 1200 },
    gallery: [],
    imageCredit: "EKSU Sports Hub",
    matchId: "3d6b6c13-469f-44ac-ae2b-9e4f6876b6fa",
  },
  {
    id: "civil-400l-comeback-beat-civil-500l-3-2",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-18T11:50:00+01:00",
    headline: "Civil 400L stage stunning comeback to beat 500L 3–2",
    summary:
      "Two goals down, Civil Engineering 400L hit back through Surprise, Femight and substitute Qd to win the departmental derby 3–2 in Wednesday's Sports Directorate friendly.",
    body: [
      "Civil Engineering 400 Level came from two goals down to beat Civil 500L 3–2 in a dramatic departmental derby on Wednesday morning.",
      "500L looked in control early on. Mentoli opened the scoring in the 8th minute and Lexi doubled the lead in the 24th to give the seniors a 2–0 cushion.",
      "But 400L refused to give up. Surprise pulled one back in the 78th minute and Femight levelled in the 85th, before substitute Qd, brought on for Alamite, completed the turnaround with the winner in the 92nd minute (90+2).",
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
    headline: "Jamal hat-trick fires Downfall FC past KHE in seven-goal thriller",
    summary:
      "Jamal struck three times in the second half, including a penalty, as Downfall FC beat KHE 4–3 in Tuesday's Sports Directorate friendly.",
    body: [
      "Downfall FC beat KHE 4–3 in a seven-goal thriller in Tuesday's Sports Directorate friendly, with Jamal the hero after a second-half hat-trick.",
      "Vini Jr gave Downfall the lead in the 14th minute before Damola equalised for KHE ten minutes later, and the sides went in level at 1–1. Muba was booked for KHE in the 30th minute.",
      "KHE edged in front for the first time when Classified scored in the 55th minute, but Jamal took over. He levelled in the 59th minute, converted a penalty in the 68th after Downfall were awarded a spot kick a minute earlier, and completed his hat-trick in the 85th minute.",
      "KHE pulled one back from the spot through Damola in the 88th minute, but Downfall held on for the win.",
      "Downfall made four substitutions: Mr Money for Al Ameen (30'), Sammy for Beejay (33'), Zico for Tife (46') and Seeygo for Vini Jr (89'). KHE brought on Foden for Gabriel (52').",
      "The result follows Downfall's 3–0 win over School Gate United on Sunday — two wins from two in this week's friendlies.",
    ],
    image: { src: `${DFKFT}/jamal-mbappe.jpg`, alt: "Hat-trick hero Jamal of Downfall FC with the match ball", width: 1600, height: 1200 },
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
    headline: "\"Mr Talk and Do\" Vini Jr delivers, but KHE level with Downfall at the break",
    summary: "Vini Jr put Downfall FC ahead on 14 minutes before Damola equalised for KHE, leaving the Sports Directorate friendly 1–1 at half-time.",
    body: [
      "KHE and Downfall FC go into half-time level at 1–1 in Tuesday's Sports Directorate friendly.",
      "Vini Jr — Mr Talk and Do — backed up his pre-match promise to deliver, putting Downfall in front in the 14th minute.",
      "KHE hit back ten minutes later, Damola levelling the score in the 24th minute.",
      "KHE's Muba was booked in the 30th minute. Downfall made two changes before the break: Mr Money replaced Al Ameen on 30 minutes and Sammy came on for Beejay three minutes later.",
      "All to play for in the second half. Follow it live on EKSU Sports Hub.",
    ],
    image: { src: `${KDHT}/mark.jpg`, alt: "Downfall FC goalscorer Vini Jr smiles on the pitch", width: 1200, height: 1600 },
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
    headline: "Vini Jr fully fit and ready for Downfall's clash with KHE",
    summary: "Downfall FC's number 11 is fit for today's friendly against KHE and is hoping to deliver a good performance.",
    body: [
      "Vini Jr is fully fit and ready for Downfall FC's Sports Directorate friendly against KHE today, Tuesday 17 November.",
      "The number 11 is in Downfall's starting line-up and goes into the game hoping to deliver a good performance for his side.",
      "Downfall come into the match on the back of Sunday's 3–0 win over School Gate United. Kick-off is at 11:30 AM.",
      "Follow every moment live on EKSU Sports Hub.",
    ],
    image: { src: `${MARK}/lead.jpg`, alt: "Vini Jr of Downfall FC on the ball", width: 608, height: 1080 },
    gallery: [
      { src: `${MARK}/on-the-ball.jpg`, alt: "Vini Jr, number 11, brings the ball under control", width: 608, height: 1080 },
      { src: `${MARK}/in-action.jpg`, alt: "Vini Jr in action for Downfall FC", width: 608, height: 1080 },
      { src: `${MARK}/corner-flag.jpg`, alt: "Vini Jr by the corner flag", width: 608, height: 1080 },
      { src: `${MARK}/on-the-pitch.jpg`, alt: "Vini Jr on the pitch in Downfall FC's orange kit", width: 608, height: 1080 },
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
