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

const DOKU = "/news/2026-11-20-doku-super-sub";

const DHEQ = "/news/2026-11-20-darul-haq-equaliser";

const DHIFT = "/news/2026-11-20-darul-haq-iworoko-ft";

const C52HT = "/news/2026-11-20-civil-500l-200l-ht";

const BAYO = "/news/2026-11-20-bayo-civil-500l-goal";

const C52FT = "/news/2026-11-20-civil-500l-beat-200l-ft";

const C43WU = "/news/2026-11-20-civil-400l-warm-up";

const STHDSLKO = "/news/2026-11-21-satellite-darul-salam-kick-off";

const TOHEEBGOAL = "/news/2026-11-21-toheeb-satellite-goal";

const FAWAZTHIRD = "/news/2026-11-21-fawaz-satellite-third-goal";

const STHDSLFT = "/news/2026-11-21-satellite-darul-salam-full-time";

const SGDSKO = "/news/2026-11-21-school-gate-darul-sunah-kick-off";

const SGDSFT = "/news/2026-11-21-school-gate-darul-sunah-full-time";

const GREENKO = "/news/2026-11-22-dm-greeners-pathfinder-kick-off";

const BABATUNDEPEN = "/news/2026-11-22-babatunde-penalty-pathfinder-dm-greeners";

const PESNAP = "/news/2026-11-26-pessans-eksu-v-napcss-fuoye";

const PNKO = "/news/2026-11-26-pessans-napcss-kick-off";

const PNLV = "/news/2026-11-26-pessans-napcss-level";

const DSSG = "/news/2026-11-26-darul-salam-school-gate-kick-off";

const DHINJ = "/news/2026-11-27-darul-haq-injury";

export const STORIES: Story[] = [
  {
    id: "darul-haq-olayiwola-abdulsamad-injury-shonibare",
    published: true,
    featured: true,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-27T09:15:00+01:00",
    headline: "Darul Haq goalkeeper Olayiwola Abdulsamad injured against Shonibare",
    summary:
      "An injury to Olayiwola Abdulsamad was recorded in the 7th minute of Darul Haq's friendly with Shonibare. Photos show a player receiving support at the pitch.",
    body: [
      "An injury was recorded in the 7th minute of Darul Haq's friendly with Shonibare.",
      "The match record identifies Darul Haq goalkeeper Olayiwola Abdulsamad in the injury event.",
      "Photographs from the ground show a player seated on the pitch as others gather around, then being supported by people nearby.",
      "The type and extent of the injury have not been confirmed.",
      "Follow Darul Haq v Shonibare live on EKSU Sports Hub.",
    ],
    image: { src: `${DHINJ}/lead.jpg`, alt: "A player sits on the pitch while others gather to assist", width: 960, height: 720 },
    gallery: [
      { src: `${DHINJ}/assisted.jpg`, alt: "People support a player beside the pitch", width: 720, height: 960 },
      { src: `${DHINJ}/pitch.jpg`, alt: "Players gather near the goal during a pause in play", width: 960, height: 720 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "c6b58e92-fa13-4780-a350-db4aa19404f1",
  },
  {
    id: "mssn-week-2-darul-salam-v-school-gate-humah-kick-off",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-26T13:45:00+01:00",
    headline: "MSSN Week 2: Darul Salam and School Gate Humah ready for kick-off",
    summary:
      "Darul Salam take on School Gate Humah in the MSSN EKSU Football League. Both line-ups are in, and the teams have posed for their pre-match photos.",
    body: [
      "The MSSN EKSU Football League continues with Week 2 as Darul Salam face School Gate Humah.",
      "Both sides have handed in their team sheets. Darul Salam, in orange, line up in a 4-3-3, with Adewale in goal and Quadri, known as Haaland, leading the attack between Olaitan and Adam Adeshina.",
      "School Gate Humah, in sky blue, have gone for a 3-5-2. Sodiq starts in goal behind a back three of Waris, Uthman and Abdullahi, and Muhammed partners Al-Ameen up front.",
      "The teams have posed for their pre-match photos and are warming up for kick-off.",
      "Follow Darul Salam v School Gate Humah live on EKSU Sports Hub.",
    ],
    image: { src: `${DSSG}/lead.jpg`, alt: "School Gate Humah, in sky blue, pose for their team photo before kick-off", width: 1600, height: 1200 },
    gallery: [
      { src: `${DSSG}/school-gate-team.jpg`, alt: "School Gate Humah players line up for a close-up team photo, with their goalkeeper in orange holding the ball", width: 1600, height: 1200 },
      { src: `${DSSG}/darul-salam.jpg`, alt: "Darul Salam players, in orange, on the pitch before the match", width: 1600, height: 1200 },
      { src: `${DSSG}/darul-salam-2.jpg`, alt: "Darul Salam players, in orange, get ready on the pitch", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "10976da2-328b-4ba4-ab4d-548e180a8364",
  },
  {
    id: "eksu-v-fuoye-pessans-eksu-napcss-fuoye-level-at-1-1",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-26T11:52:00+01:00",
    headline: "EKSU v FUOYE still level: PESSANS EKSU and NAPCSS FUOYE locked at 1–1",
    summary:
      "Daniel's penalty put NAPCSS FUOYE ahead before Abubakri levelled for PESSANS EKSU. Into the second half, the inter-school friendly is still all square.",
    body: [
      "Nothing separates EKSU and FUOYE so far. PESSANS EKSU and NAPCSS FUOYE went in level at the break at the EKSU Sports Complex, and it is still 1–1 in the second half.",
      "The visitors struck first. NAPCSS FUOYE were awarded a penalty in the 13th minute, and Daniel stepped up to score it a minute later.",
      "PESSANS EKSU made an early change in the 24th minute, sending on Figmen in place of Tobi, and the hosts were back on terms almost straight away. Abubakri equalised in the 25th minute.",
      "The game has grown tetchy since. NAPCSS FUOYE had two players booked in quick succession, Joseph in the 26th minute and Dotun in the 27th.",
      "Both sides have had their moments around the box on a dusty afternoon, with set pieces and challenges flying in.",
      "PESSANS EKSU have turned to their bench in the second half. Ayo replaced Dimeji in the 47th minute, and Dammy came on for Galapo in the 52nd.",
      "The match is refereed by Ogooluwa (SOS).",
      "Follow PESSANS EKSU v NAPCSS FUOYE live on EKSU Sports Hub.",
    ],
    image: { src: `${PNLV}/lead.jpg`, alt: "PESSANS EKSU, in black, and NAPCSS FUOYE, in grey, crowd the goalmouth during a set piece", width: 1600, height: 1200 },
    gallery: [
      { src: `${PNLV}/battle.jpg`, alt: "A PESSANS EKSU player twists in a challenge as NAPCSS FUOYE players close in on the ball", width: 1600, height: 1200 },
      { src: `${PNLV}/down.jpg`, alt: "A PESSANS EKSU player sits on the pitch after a challenge as players gather round", width: 1600, height: 1200 },
      { src: `${PNLV}/huddle.jpg`, alt: "Players from both teams gather around the ball during a break in play", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "c668c2ed-34a0-4652-9023-b9bd55fa3eac",
  },
  {
    id: "eksu-v-fuoye-pessans-eksu-napcss-fuoye-kick-off",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-26T10:47:00+01:00",
    headline: "EKSU v FUOYE is on: PESSANS EKSU and NAPCSS FUOYE line up for kick-off",
    summary:
      "PESSANS EKSU and NAPCSS FUOYE lined up side by side at the EKSU Sports Complex before their inter-school friendly got under way.",
    body: [
      "The inter-school clash between EKSU and FUOYE is under way. PESSANS EKSU and NAPCSS FUOYE lined up side by side at the EKSU Sports Complex before kick-off.",
      "The home side, in black with blue and red stripes, were led out by their captain wearing the armband and number 3, with their goalkeeper in green. The visitors from FUOYE wore grey and white, with their goalkeeper in blue.",
      "Both teams shook hands down the line before taking their positions. PESSANS EKSU have set up in a 3-4-3.",
      "The match is refereed by Ogooluwa (SOS).",
      "Follow PESSANS EKSU v NAPCSS FUOYE live on EKSU Sports Hub.",
    ],
    image: { src: `${PNKO}/lead.jpg`, alt: "PESSANS EKSU, in black, and NAPCSS FUOYE, in grey, line up side by side before kick-off", width: 1600, height: 1200 },
    gallery: [
      { src: `${PNKO}/line-up.jpg`, alt: "The two teams line up at the EKSU Sports Complex", width: 1600, height: 1200 },
      { src: `${PNKO}/handshakes.jpg`, alt: "Players from both teams before the pre-match handshakes", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "c668c2ed-34a0-4652-9023-b9bd55fa3eac",
  },
  {
    id: "pessans-eksu-host-napcss-fuoye-inter-school-clash",
    published: true,
    featured: false,
    category: "TEAM_UPDATE",
    kind: "report",
    publishedAt: "2026-11-26T10:36:00+01:00",
    headline: "EKSU v FUOYE: PESSANS EKSU warm up for inter-school clash with NAPCSS FUOYE",
    summary:
      "PESSANS EKSU are warming up at the EKSU Sports Complex ahead of an inter-school friendly against NAPCSS FUOYE, with EKSU pride on the line.",
    body: [
      "It is EKSU against FUOYE this morning. PESSANS EKSU are on the pitch at the EKSU Sports Complex, warming up for an inter-school friendly against NAPCSS FUOYE.",
      "The home side went through their stretches together in their black, blue and pink kit before lining up in shape ahead of kick-off.",
      "PESSANS EKSU have named a 3-4-3, with A.A Solution in goal and a front three of Tobi, Ridwan and Daniel.",
      "The match will be refereed by Ogooluwa, known on the pitch as SOS.",
      "Follow PESSANS EKSU v NAPCSS FUOYE live on EKSU Sports Hub.",
    ],
    image: { src: `${PESNAP}/lead.jpg`, alt: "PESSANS EKSU players line up in shape with their goalkeeper before the match", width: 1600, height: 1200 },
    gallery: [
      { src: `${PESNAP}/stretch.jpg`, alt: "PESSANS EKSU players stretch together during the warm-up", width: 1600, height: 1200 },
      { src: `${PESNAP}/stretch-2.jpg`, alt: "PESSANS EKSU players stretch in a line in front of the goal", width: 1600, height: 1200 },
      { src: `${PESNAP}/stretch-3.jpg`, alt: "The PESSANS EKSU squad warms up at the EKSU Sports Complex", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "c668c2ed-34a0-4652-9023-b9bd55fa3eac",
  },
  {
    id: "babatunde-penalty-pathfinder-dm-greeners",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-22T09:36:50+01:00",
    headline: "Kenny restores DM Greeners lead with second penalty",
    summary: "Kenny scored his second penalty of the friendly in the 53rd minute to put DM Greeners 2–1 ahead of Pathfinder.",
    body: [
      "Kenny gave DM Greeners the lead from the penalty spot in the 13th minute of Sunday’s friendly.",
      "Pathfinder were awarded a penalty in the 39th minute. Babatunde converted two minutes later to make it 1–1 before half-time.",
      "DM Greeners won another penalty in the 52nd minute. Kenny converted in the 53rd to restore his side’s lead and make it 2–1.",
      "Follow the friendly on EKSU Sports Hub.",
    ],
    image: { src: `${BABATUNDEPEN}/lead.jpg`, alt: "Kenny takes DM Greeners’ second penalty as the goalkeeper dives", width: 1536, height: 1152 },
    gallery: [
      { src: `${BABATUNDEPEN}/second-penalty.jpg`, alt: "The ball moves towards goal as the goalkeeper dives during the penalty", width: 1536, height: 1152 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "f8cd1e47-8f9a-4bbe-94a4-a7e4b41b111d",
  },

  {
    id: "dm-greeners-pathfinder-kick-off",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-22T08:37:26+01:00",
    headline: "DM Greeners kick off against Pathfinder FC",
    summary: "Mangala leads the line for DM Greeners, with Sunday on the left and Kenny on the right in Sunday morning’s friendly.",
    body: [
      "DM Greeners and Pathfinder FC kicked off at 8:34am WAT on Sunday. Greeners started in a 4-3-3, with Gakpo, Matic and Kante in midfield.",
      "Pathfinder lined up in a 4-4-2. Oba started in goal, Benjamin took the left-back spot and Sancho partnered Babatunde up front.",
    ],
    image: { src: `${GREENKO}/lead.jpg`, alt: "DM Greeners teammates greet each other on the pitch", width: 1536, height: 1152 },
    gallery: [
      { src: `${GREENKO}/team.jpg`, alt: "Players in mint-green shirts gather on the red-earth pitch", width: 1152, height: 1536 },
      { src: `${GREENKO}/opening-play.jpg`, alt: "Players follow the play across midfield", width: 1536, height: 1152 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "f8cd1e47-8f9a-4bbe-94a4-a7e4b41b111d",
  },
{
  "id": "school-gate-humah-darul-sunah-goalless-draw-full-time",
  "published": true,
  "featured": false,
  "category": "MATCH_REPORT",
  "kind": "report",
  "publishedAt": "2026-11-21T12:37:15+01:00",
  "headline": "School Gate Humah and Darul Sunah share goalless draw",
  "summary": "School Gate Humah and Darul Sunah finished 0–0 in the MSSN EKSU Football League 2026/2027. Neither side found a breakthrough, with five yellow cards recorded across the match.",
  "body": [
    "School Gate Humah and Darul Sunah played out a goalless draw in the MSSN EKSU Football League 2026/2027 on Saturday 21 November. The 0–0 result gives each side a point, with neither team conceding.",
    "The sides were level at the interval and remained so through the second half. Match photographs show players in dark blue and light blue contesting the ball, alongside set-piece action around the penalty area. Neither side added a goal to the final score.",
    "Darul Sunah's Adejumo Sodiq received the first recorded yellow card in the 11th minute. Tiamiyu Sodiq was booked in the 47th minute, while goalkeeper Ganiu Roqeeb received a yellow card in the 70th.",
    "School Gate Humah had two players booked: Mohamed in the 52nd minute and Teslim in the 55th. That brings the recorded total to five yellow cards, three for Darul Sunah and two for School Gate Humah, with no red cards logged.",
    "An injury involving Darul Sunah's Abdulkarim Abdulmalik was recorded in the 62nd minute. The record does not specify its nature or severity. The match is marked full-time, confirming a 0–0 draw and a clean sheet for both sides.",
    "Follow the MSSN EKSU Football League 2026/2027 live on EKSU Sports Hub."
  ],
  "image": {
    "src": `${SGDSFT}/lead.jpg`,
    "alt": "A player in dark blue controls the ball as a player in light blue closes in",
    "width": 1536,
    "height": 1152
  },
  "gallery": [
    {
      "src": `${SGDSFT}/free-kick.jpg`,
      "alt": "A player in light blue strikes the ball towards a group of players near goal",
      "width": 1536,
      "height": 1152
    },
    {
      "src": `${SGDSFT}/goalmouth.jpg`,
      "alt": "A goalkeeper reaches towards the ball as players watch near the goalmouth",
      "width": 1536,
      "height": 1152
    },
    {
      "src": `${SGDSFT}/set-piece.jpg`,
      "alt": "A player in dark blue approaches a stationary ball with two light-blue-shirted players ahead",
      "width": 1536,
      "height": 1152
    }
  ],
  "imageCredit": "EKSU Sports Hub",
  "matchId": "79930e0d-d07e-43a8-9695-8723314fa623"
},

{
  "id": "school-gate-humah-darul-sunah-kick-off-mssn-league",
  "published": true,
  "featured": false,
  "category": "MATCH_REPORT",
  "kind": "report",
  "publishedAt": "2026-11-21T11:02:39+01:00",
  "headline": "School Gate Humah and Darul Sunah kick off MSSN clash",
  "summary": "School Gate Humah and Darul Sunah are under way in the MSSN EKSU Football League 2026/2027. The match kicked off at 11:00 am WAT, with the score 0–0 in this opening update.",
  "body": [
    "School Gate Humah and Darul Sunah have kicked off their MSSN EKSU Football League 2026/2027 meeting on Saturday 21 November. Play began at 11:00 am WAT, with both starting line-ups confirmed before the match.",
    "The pre-match photographs show players in dark blue and light blue shirts lined up on the red-earth pitch. Another image captures players and others gathered near the touchline, with spectators behind them.",
    "School Gate Humah's submitted shape is 3-2-3-2, with Sodiq in goal. Uthman, Waris and Alameen are the named defenders; Jamal and Teslim are joined in midfield by Mumbarak, Mohamed and Hamid. Malik and Salam complete the starting side in attack. No substitutes are listed.",
    "Darul Sunah have a confirmed 4-3-3 with Ganiu Roqeeb in goal. Abdulkarim Abdulmalik, Adejumo Sodiq, Aminu Fawaz and Sulaimon Mubarak form the defence. Anifowoshe Teslim, Ganiu Temitope and Tiamiyu Sodiq are in midfield, with Damilare Rasheed, Mustapha Khalid and Olatunde Ibrahim in attack. Abimbola Samad is the named substitute.",
    "The sides remain level at 0–0 at the time of this kick-off update. No goals, cards or substitutions have been logged in the live event list. The match centre carries the confirmed line-ups and live score as the first half continues.",
    "Follow School Gate Humah v Darul Sunah live on EKSU Sports Hub."
  ],
  "image": {
    "src": `${SGDSKO}/lead.jpg`,
    "alt": "Players in dark blue and light blue shirts line up on the red-earth pitch before kick-off",
    "width": 1536,
    "height": 1152
  },
  "gallery": [
    {
      "src": `${SGDSKO}/pre-match-gathering.jpg`,
      "alt": "Players and others gather near the touchline with spectators behind them",
      "width": 1536,
      "height": 1152
    }
  ],
  "imageCredit": "EKSU Sports Hub",
  "matchId": "79930e0d-d07e-43a8-9695-8723314fa623"
},

{
  "id": "satellite-humah-beat-darul-salam-6-1-full-time",
  "published": true,
  "featured": false,
  "category": "MATCH_REPORT",
  "kind": "report",
  "publishedAt": "2026-11-21T10:47:14+01:00",
  "headline": "Fawaz scores twice as Satellite Humah beat Darul Salam 6–1",
  "summary": "Satellite Humah recorded a 6–1 win over Darul Salam in the MSSN EKSU Football League 2026/2027. Fawaz scored twice, while Darul Salam converted a late penalty for their only goal.",
  "body": [
    "Satellite Humah beat Darul Salam 6–1 in their MSSN EKSU Football League 2026/2027 meeting on Saturday 21 November. Fawaz scored twice as Satellite Humah built on a three-goal first-half lead to secure the victory.",
    "Toheeb scored the opener in the 10th minute, putting Satellite Humah 1–0 ahead. Akeremokewu added the second in the 13th minute, before Fawaz scored the third in the 18th. Those three goals established a 3–0 advantage before the interval.",
    "Fawaz added his second goal in the 49th minute to make it 4–0. He was then replaced by Alamite in the 55th minute. Khalid extended the lead with Satellite Humah's fifth goal in the 63rd minute.",
    "Noqeeb converted a penalty in the 66th minute, taking the score to 6–0. Darul Salam were awarded a penalty in the 68th minute and converted it in the 69th for a late consolation. The scorer of Darul Salam's penalty is not named in the match record.",
    "Darul Salam's Abdul Malik received the match's only recorded yellow card in the 57th minute, before Kolawole Samad replaced him in the 60th. The completed event list contains two substitutions and no red cards. The final score confirms six goals for Satellite Humah and one for Darul Salam.",
    "Follow the MSSN EKSU Football League 2026/2027 live on EKSU Sports Hub."
  ],
  "image": {
    "src": `${STHDSLFT}/lead.jpg`,
    "alt": "A player in blue approaches the ball in front of goal as players in fluorescent yellow watch",
    "width": 1536,
    "height": 1152
  },
  "gallery": [
    {
      "src": `${STHDSLFT}/goalmouth.jpg`,
      "alt": "A player in blue runs past a goalkeeper seated on the ground in front of goal",
      "width": 1536,
      "height": 1152
    },
    {
      "src": `${STHDSLFT}/penalty-action.jpg`,
      "alt": "Players in blue and fluorescent yellow watch the action near the penalty area",
      "width": 1536,
      "height": 1152
    }
  ],
  "imageCredit": "EKSU Sports Hub",
  "matchId": "011deea3-6e05-43b4-91b8-360726c7b1cd"
},

{
  "id": "fawaz-scores-third-as-satellite-humah-lead-darul-salam",
  "published": true,
  "featured": false,
  "category": "MATCH_REPORT",
  "kind": "report",
  "publishedAt": "2026-11-21T10:07:07+01:00",
  "headline": "Fawaz adds third as Satellite Humah lead Darul Salam 3–0",
  "summary": "Fawaz scored in the 18th minute to extend Satellite Humah's lead to 3–0. Toheeb scored the opener in the 10th minute, with Akeremokewu adding the second in the 13th.",
  "body": [
    "Fawaz has scored Satellite Humah's third goal against Darul Salam in the MSSN EKSU Football League 2026/2027. His effort in the 18th minute extended the lead to 3–0 in the first half.",
    "Toheeb scored the opening goal in the 10th minute. Akeremokewu then made it 2–0 in the 13th minute, before Fawaz added the third five minutes later. Three different players have therefore scored Satellite Humah's three goals.",
    "Fawaz is listed in Satellite Humah's starting attack alongside Akeremokewu and Ridwan. Toheeb started at centre-back, giving the home side contributions from both defence and attack on the scoresheet.",
    "Darul Salam now have a three-goal deficit to recover, with the match still in its opening half at the time of this update. Their confirmed starting sheet includes Adewale in goal, with Adelusi Wasiu and Mohammed among the attacking players.",
    "The latest photographs show players in blue and fluorescent yellow competing near the goal, while another image captures a player in blue with both hands raised. The live event list records three valid goals, with no cards or substitutions logged at this point.",
    "Follow Satellite Humah v Darul Salam live on EKSU Sports Hub."
  ],
  "image": {
    "src": `${FAWAZTHIRD}/lead.jpg`,
    "alt": "A player in a blue shirt raises both hands beside the pitch",
    "width": 1536,
    "height": 1152
  },
  "gallery": [
    {
      "src": `${FAWAZTHIRD}/goalmouth.jpg`,
      "alt": "Players in blue and fluorescent yellow contest the ball in front of goal",
      "width": 1536,
      "height": 1152
    },
    {
      "src": `${FAWAZTHIRD}/high-ball.jpg`,
      "alt": "Players track a ball in the air near the goal on the red-earth pitch",
      "width": 1536,
      "height": 1152
    }
  ],
  "imageCredit": "EKSU Sports Hub",
  "matchId": "011deea3-6e05-43b4-91b8-360726c7b1cd"
},

{
  "id": "toheeb-opens-scoring-as-satellite-humah-lead-darul-salam",
  "published": true,
  "featured": false,
  "category": "MATCH_REPORT",
  "kind": "report",
  "publishedAt": "2026-11-21T09:57:13+01:00",
  "headline": "Toheeb scores opener before Akeremokewu doubles Satellite Humah's lead",
  "summary": "Toheeb scored Satellite Humah's first goal in the 10th minute. Akeremokewu scored their second in the 13th, giving Satellite Humah a 2–0 lead over Darul Salam at the time of this update.",
  "body": [
    "Toheeb scored the first goal of Satellite Humah's meeting with Darul Salam in the MSSN EKSU Football League 2026/2027. His opener in the 10th minute put Satellite Humah 1–0 ahead in Saturday's match.",
    "Akeremokewu scored Satellite Humah's second goal in the 13th minute, taking the score from 1–0 to 2–0. Toheeb was the scorer of the opener; Akeremokewu scored the second, three minutes later.",
    "Toheeb, wearing shirt number 3 on the confirmed match sheet, started at centre-back in Satellite Humah's 4-3-3. Akeremokewu, listed in the central attacking position, is wearing number 10.",
    "Satellite Humah's starting line-up also includes Amroo in goal, with Mikun, Mustapha and Khalid alongside Toheeb in defence. Noqeeb, Samad and Alhameen make up the midfield, while Fawaz and Ridwan join Akeremokewu in attack. Alamite is the named substitute.",
    "The match remains in the first half at the time of this update. The latest photographs show play continuing on the red-earth pitch, with players in fluorescent yellow and blue contesting the ball. No cards or substitutions are recorded in the live event list at this point.",
    "Follow Satellite Humah v Darul Salam live on EKSU Sports Hub."
  ],
  "image": {
    "src": `${TOHEEBGOAL}/lead.jpg`,
    "alt": "A player in fluorescent yellow strikes the ball with players in blue nearby",
    "width": 1536,
    "height": 1152
  },
  "gallery": [
    {
      "src": `${TOHEEBGOAL}/goalmouth.jpg`,
      "alt": "A goalkeeper reaches across the goalmouth as players in blue and fluorescent yellow watch",
      "width": 1536,
      "height": 1152
    },
    {
      "src": `${TOHEEBGOAL}/high-ball.jpg`,
      "alt": "Players in blue and fluorescent yellow follow a high ball on the red-earth pitch",
      "width": 1536,
      "height": 1152
    },
    {
      "src": `${TOHEEBGOAL}/match-action.jpg`,
      "alt": "A player in fluorescent yellow controls the ball as players in blue approach",
      "width": 1536,
      "height": 1152
    }
  ],
  "imageCredit": "EKSU Sports Hub",
  "matchId": "011deea3-6e05-43b4-91b8-360726c7b1cd"
},

  {
    id: "satellite-humah-darul-salam-kick-off-mssn-league",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-21T09:49:07+01:00",
    headline: "Satellite Humah and Darul Salam kick off MSSN League clash",
    summary: "Satellite Humah and Darul Salam are under way in the MSSN EKSU Football League 2026/2027. The match began at 9:43 am WAT, with the sides level at 0–0 in this kick-off update.",
    body: [
      "Satellite Humah and Darul Salam have kicked off their MSSN EKSU Football League 2026/2027 meeting on Saturday 21 November. Play began at 9:43 am WAT, with the match set for two 45-minute halves.",
      "The opening photographs show players in fluorescent yellow and blue shirts on the red-earth pitch. Before play, players gathered together and posed for photographs; the action shots show the ball being carried forward and players tracking a high ball near the goal.",
      "Satellite Humah have named a 4-3-3, with Amroo in goal. Mikun, Toheeb, Mustapha and Khalid form the defence, with Noqeeb, Samad and Alhameen in midfield. Fawaz, Akeremokewu and Ridwan complete the attack, while Alamite is the named substitute.",
      "Darul Salam's confirmed sheet lists ten starters, with Adewale in goal. Abudulsamad, Mustapha, Wasiu, Kehinde Yusuf and Abdul Malik are named in defensive positions, with Jimoh and Toyeeb in midfield and Adelusi Wasiu and Mohammed in attack. No substitutes are listed.",
      "The live record remains 0–0 at the time of this kick-off update, with no goals, cards or substitutions logged. Both confirmed line-ups can be viewed in the match centre alongside the live score.",
      "Follow Satellite Humah v Darul Salam live on EKSU Sports Hub.",
    ],
    image: { src: `${STHDSLKO}/lead.jpg`, alt: "A player in blue carries the ball as players in fluorescent yellow move across the pitch", width: 1536, height: 1152 },
    gallery: [
      { src: `${STHDSLKO}/team-photo.jpg`, alt: "Players in fluorescent yellow shirts pose together for a pre-match photograph", width: 1536, height: 1152 },
      { src: `${STHDSLKO}/blue-line-up.jpg`, alt: "Players in blue shirts stand together on the pitch before play", width: 1536, height: 1152 },
      { src: `${STHDSLKO}/goalmouth.jpg`, alt: "Players in blue and fluorescent yellow track a high ball near the goal", width: 1536, height: 1152 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "011deea3-6e05-43b4-91b8-360726c7b1cd",
  },

  {
    id: "civil-400l-warm-up-ahead-of-civil-300l",
    published: true,
    featured: false,
    category: "TEAM_UPDATE",
    kind: "report",
    publishedAt: "2026-11-20T13:16:00+01:00",
    headline: "Civil 400L and Civil 300L warm up for Unity Cup clash",
    summary:
      "Both teams are warming up ahead of their NICESA Unity Cup meeting. Civil 400L arrive after a 3–2 friendly win over Civil 500L, while Civil 300L prepare for their first recorded outing on EKSU Sports Hub.",
    body: [
      "Civil 400L and Civil 300L are going through their pre-match preparations ahead of their NICESA Unity Cup meeting on Friday 20 November. Both sides are out on the pitch as attention turns to the contest between the two Civil Engineering levels.",
      "Civil 400L's players, pictured earlier in orange shirts and black shorts, have been gathering on the red-earth surface during their warm-up. The squad's preparations now form part of the build-up to another meeting between Civil Engineering sides, two days after their friendly against Civil 500L.",
      "The latest warm-up photographs show players in navy shirts with mint-green trim working with the ball. One image captures a player moving to play a pass, with team-mates nearby, while another shows the group spread across the pitch between touches.",
      "Civil 400L have a recent victory behind them. They beat Civil 500L 3–2 in the Sports Directorate friendly on 18 November. That result came in a separate competition; today's fixture is part of the NICESA Unity Cup. Civil 300L have no previous results listed in the match-page form guide.",
      "Elsewhere in the Unity Cup, Civil 500L have already beaten Civil 200L 1–0 today, with Bayo scoring in the 53rd minute. The focus now turns to Civil 400L and Civil 300L, whose match page still shows the fixture as scheduled, with play yet to begin.",
      "Follow Civil 400L v Civil 300L live on EKSU Sports Hub.",
    ],
    image: { src: `${C43WU}/lead.jpg`, alt: "Players in orange shirts and black shorts walk across the pitch ahead of kick-off", width: 1536, height: 1152 },
    gallery: [
      { src: `${C43WU}/ball-work.jpg`, alt: "A player in navy and mint-green kit moves to pass the ball during the warm-up", width: 1536, height: 1152 },
      { src: `${C43WU}/pre-match.jpg`, alt: "Players in navy and mint-green kit gather on the red-earth pitch before the match", width: 1536, height: 1152 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "0a56dae6-0c39-4a1c-8d74-75f02c2f2660",
  },

  {
    id: "civil-500l-beat-civil-200l-1-0-nicesa-unity-cup",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-20T12:54:00+01:00",
    headline: "Bayo's goal gives Civil 500L a 1–0 win over Civil 200L",
    summary:
      "Bayo's 53rd-minute strike was enough for Civil 500L to beat Civil 200L 1–0 in the NICESA Unity Cup, two days after their defeat to Civil 400L.",
    body: [
      "Civil 500L beat Civil 200L 1–0 in Friday afternoon's NICESA Unity Cup match, thanks to a second-half goal from Bayo.",
      "After a goalless first half, Bayo broke the deadlock in the 53rd minute and the seniors held on for the rest of the match.",
      "Civil 200L pushed for an equaliser, sending on Eva for Vicky in the 56th minute and winning set pieces around the 500L box, but the defence stood firm.",
      "Civil 500L made two changes of their own: Odunayo came on for Oro in the 62nd minute and Pelxy replaced Otto in the 70th.",
      "It is a welcome bounce-back for 500L after Wednesday's 3–2 defeat to Civil 400L, while 200L can take positives from a close first outing on EKSU Sports Hub.",
      "Follow the NICESA Unity Cup and every match live on EKSU Sports Hub.",
    ],
    image: { src: `${C52FT}/lead.jpg`, alt: "Civil 200L's number 10 applauds at full-time as players from both teams walk off", width: 1600, height: 1200 },
    gallery: [
      { src: `${C52FT}/walk-off.jpg`, alt: "Players leave the pitch at the end of Civil 500L against Civil 200L", width: 1600, height: 1200 },
      { src: `${C52FT}/500l-defender.jpg`, alt: "A Civil 500L player watches the play during the second half", width: 1600, height: 1200 },
      { src: `${C52FT}/late-pressure.jpg`, alt: "Players from both teams wait in the box as Civil 200L push forward", width: 1600, height: 1200 },
      { src: `${C52FT}/corner.jpg`, alt: "Players crowd the goalmouth for a set piece", width: 1600, height: 1200 },
      { src: `${C52FT}/set-piece.jpg`, alt: "Civil 200L players in green line up for a set piece", width: 1600, height: 1200 },
      { src: `${C52FT}/free-kick.jpg`, alt: "A Civil 500L player strikes a free kick towards the Civil 200L wall", width: 1600, height: 1200 },
      { src: `${C52FT}/header.jpg`, alt: "The ball comes into the box as players challenge in front of goal", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "a1666ca1-5e05-430d-8f48-ab4dd5895ef7",
  },
  {
    id: "bayo-breaks-deadlock-civil-500l-lead-civil-200l",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-20T12:29:00+01:00",
    headline: "Bayo breaks the deadlock as Civil 500L lead Civil 200L",
    summary:
      "Bayo scored in the 53rd minute to put Civil 500L 1–0 up against Civil 200L in the NICESA Unity Cup, after a goalless first half.",
    body: [
      "Civil 500L have the lead. Bayo scored in the 53rd minute to break the deadlock against Civil 200L in the NICESA Unity Cup.",
      "After a goalless first half, the seniors made the breakthrough eight minutes after the restart. Bayo, leading the line in his white singlet, found the net to make it 1–0.",
      "The goal sparked celebrations among the 500L players in black and red, with team-mates and supporters by the touchline joining in.",
      "Civil 200L now need a response. Follow the rest of the match live on EKSU Sports Hub.",
    ],
    image: { src: `${BAYO}/lead.jpg`, alt: "Civil 500L goalscorer Bayo, in a white singlet, jogs back after scoring", width: 1600, height: 1200 },
    gallery: [
      { src: `${BAYO}/celebration.jpg`, alt: "Civil 500L players celebrate together after the goal", width: 1600, height: 1200 },
      { src: `${BAYO}/teammates-clap.jpg`, alt: "Civil 500L players clap as Bayo walks back", width: 1600, height: 1200 },
      { src: `${BAYO}/bench-celebrates.jpg`, alt: "Civil 500L team-mates and supporters celebrate by the touchline", width: 1600, height: 1200 },
      { src: `${BAYO}/jog-back.jpg`, alt: "Civil 500L players jog back smiling for the restart", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "a1666ca1-5e05-430d-8f48-ab4dd5895ef7",
  },
  {
    id: "civil-500l-civil-200l-goalless-at-half-time",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-20T12:12:00+01:00",
    headline: "Civil 500L and Civil 200L goalless at the break",
    summary:
      "Civil 500L and Civil 200L are level at 0–0 at half-time in their NICESA Unity Cup match, with both goals surviving a busy first half.",
    body: [
      "Civil 500L and Civil 200L go into the break level at 0–0 in Friday afternoon's NICESA Unity Cup match.",
      "The seniors in black and red and the 200L side in green both pushed forward in a lively first half, with set pieces and scrambles in front of goal, but neither team could find the net.",
      "Civil 500L set up in a 4-3-3 with Teacha in goal and Bayo leading the line, while Civil 200L went with a 4-2-3-1, Afeez in goal and Jayeola up front.",
      "500L come into the game after losing 3–2 to Civil 400L in Wednesday's friendly, while 200L are playing their first match on EKSU Sports Hub.",
      "Follow the second half live on EKSU Sports Hub.",
    ],
    image: { src: `${C52HT}/lead.jpg`, alt: "A player rises at the far post as the ball comes in from a corner", width: 1600, height: 1200 },
    gallery: [
      { src: `${C52HT}/oluwabusayomi.jpg`, alt: "Civil 200L's Oluwabusayomi, number 10, strikes the ball", width: 1600, height: 1200 },
      { src: `${C52HT}/goalmouth-scramble.jpg`, alt: "Players from both teams battle in front of goal as the ball is in the air", width: 1600, height: 1200 },
      { src: `${C52HT}/walk-off.jpg`, alt: "Civil 200L players in green walk off at half-time", width: 1600, height: 1200 },
      { src: `${C52HT}/walk-off-2.jpg`, alt: "Players head off the pitch for the half-time break", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "a1666ca1-5e05-430d-8f48-ab4dd5895ef7",
  },
  {
    id: "darul-haq-and-iworoko-humah-share-the-points-1-1",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-20T10:44:00+01:00",
    headline: "Darul Haq and Iworoko Humah share the points in 1–1 draw",
    summary:
      "Super sub Doku put Iworoko Humah ahead before Oyadiji Temidayo Ismail equalised, as Darul Haq and Iworoko Humah drew 1–1 in the MSSN League.",
    body: [
      "Darul Haq and Iworoko Humah drew 1–1 in Friday's MSSN EKSU Football League match, with both teams picking up their first point of the season.",
      "A tight first half ended goalless, with Kabir Wasiu of Iworoko Humah and Adebayo Faisol of Darul Haq both booked in the 24th minute.",
      "Iworoko Humah used their bench well after the break, and it paid off. Doku came on for Lekan in the 64th minute and scored three minutes later to put them 1–0 up.",
      "Darul Haq responded. They brought on Onajobi Fawas for Abdulmojeed Ajibola in the 76th minute, and three minutes later Oyadiji Temidayo Ismail found the equaliser.",
      "Neither side could find a winner in the final ten minutes. The match finished with four yellow cards: Kabir Wasiu and Ajileye Abdullahi for Iworoko Humah, and Adebayo Faisol and Oyadiji Temidayo Ismail for Darul Haq.",
      "The draw leaves both teams level on one point, behind leaders Darul Saadah, who beat Darul Hudah 4–1 on Thursday.",
      "Up next in Week 1: School Gate Humah v Darul Sunah and Darul Salam v Darul Hikmah on Saturday. Follow every match live on EKSU Sports Hub.",
    ],
    image: { src: `${DHIFT}/lead.jpg`, alt: "Darul Haq and Iworoko Humah players walk off at full-time", width: 1600, height: 1200 },
    gallery: [
      { src: `${DHIFT}/officials.jpg`, alt: "Match officials and organisers at Darul Haq against Iworoko Humah", width: 1200, height: 1600 },
      { src: `${DHIFT}/darul-haq-walk.jpg`, alt: "Darul Haq players in green on the pitch", width: 1600, height: 1200 },
      { src: `${DHIFT}/iworoko-player.jpg`, alt: "An Iworoko Humah player in blue at the end of the match", width: 1600, height: 1200 },
      { src: `${DHIFT}/doku-celebration.jpg`, alt: "Iworoko Humah players celebrate Doku's goal", width: 1600, height: 1200 },
      { src: `${DHIFT}/set-piece.jpg`, alt: "Players wait in the area for a set piece", width: 1600, height: 1200 },
      { src: `${DHIFT}/goalmouth.jpg`, alt: "Players around the goalmouth late in the match", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "cfbc483d-8201-4a2b-8084-f5d4950bad6d",
  },
  {
    id: "darul-haq-hit-back-oyadiji-equalises-against-iworoko-humah",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-20T10:33:00+01:00",
    headline: "Darul Haq hit back: Oyadiji levels it 1–1 against Iworoko Humah",
    summary:
      "Oyadiji Temidayo Ismail scored in the 79th minute to cancel out Doku's strike and bring Darul Haq level at 1–1 with Iworoko Humah.",
    body: [
      "Darul Haq are back in it. Oyadiji Temidayo Ismail scored in the 79th minute to make it 1–1 against Iworoko Humah in the MSSN EKSU Football League.",
      "Iworoko Humah had taken the lead twelve minutes earlier through substitute Doku, but Darul Haq refused to fold.",
      "The equaliser came three minutes after Darul Haq made their first change, sending on Onajobi Fawas for Abdulmojeed Ajibola in the 76th minute.",
      "It capped a big afternoon for Oyadiji, who had been booked early in the second half. The Darul Haq players in green celebrated wildly after the goal.",
      "With around ten minutes to play, both teams are pushing for a winner and their first three points. Follow the finish live on EKSU Sports Hub.",
    ],
    image: { src: `${DHEQ}/lead.jpg`, alt: "A Darul Haq player in green celebrates the equaliser against Iworoko Humah", width: 1600, height: 1200 },
    gallery: [
      { src: `${DHEQ}/celebration-run.jpg`, alt: "Darul Haq players run back smiling after levelling the score", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "cfbc483d-8201-4a2b-8084-f5d4950bad6d",
  },
  {
    id: "super-sub-doku-puts-iworoko-humah-ahead-of-darul-haq",
    published: true,
    featured: false,
    category: "MATCH_REPORT",
    kind: "report",
    publishedAt: "2026-11-20T10:23:00+01:00",
    headline: "Super sub Doku puts Iworoko Humah ahead against Darul Haq",
    summary:
      "Three minutes after coming off the bench, Doku scored in the 67th minute to give Iworoko Humah a 1–0 lead over Darul Haq in the MSSN League.",
    body: [
      "Doku has made an instant impact for Iworoko Humah. The substitute came on for Lekan in the 64th minute and found the net just three minutes later to break the deadlock against Darul Haq.",
      "The goal sparked wild celebrations among the Iworoko Humah players in blue, who ran back from the goalmouth together after a tight contest that was goalless at half-time.",
      "Iworoko Humah had turned to their bench throughout the second half. Ajagbe Musa replaced Big Classic in the 53rd minute and Saliu Yusuf came on for Adewoye Malik a minute later, before Doku's arrival and Olayinka Abdullahi's introduction for Omobolaji Taiwo in the 66th.",
      "It has been a physical game, with four yellow cards so far: Kabir Wasiu and Ajileye Abdullahi for Iworoko Humah, and Adebayo Faisol and Oyadiji Temidayo Ismail for Darul Haq.",
      "Darul Haq now need a response. Follow the rest of the match live on EKSU Sports Hub.",
    ],
    image: { src: `${DOKU}/lead.jpg`, alt: "Iworoko Humah players celebrate Doku's goal against Darul Haq", width: 1600, height: 1200 },
    gallery: [
      { src: `${DOKU}/run-off.jpg`, alt: "Iworoko Humah players run back smiling after the goal", width: 1600, height: 1200 },
      { src: `${DOKU}/celebration.jpg`, alt: "Iworoko Humah players celebrate together", width: 1600, height: 1200 },
      { src: `${DOKU}/dance.jpg`, alt: "Iworoko Humah players dance after taking the lead", width: 1600, height: 1200 },
      { src: `${DOKU}/jog-back.jpg`, alt: "Iworoko Humah players jog back for the restart", width: 1600, height: 1200 },
      { src: `${DOKU}/huddle.jpg`, alt: "Iworoko Humah players celebrate in a group", width: 1600, height: 1200 },
      { src: `${DOKU}/darul-haq-dejected.jpg`, alt: "Darul Haq players in green react as Iworoko Humah celebrate", width: 1600, height: 1200 },
      { src: `${DOKU}/restart.jpg`, alt: "The ball goes up as Iworoko Humah head back after the goal", width: 1600, height: 1200 },
    ],
    imageCredit: "EKSU Sports Hub",
    matchId: "cfbc483d-8201-4a2b-8084-f5d4950bad6d",
  },
  {
    id: "guests-in-attendance-at-darul-haq-v-iworoko-humah",
    published: true,
    featured: false,
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
