# Sports News ↔ Amigo World

EKSU Sports Hub: **follow the game**. Amigo World: **join the conversation**.

Sports Hub shows previews only. Every full article, comment and reaction lives on
Amigo World. Sports Hub never stores, writes or publishes news.

## Sports Hub side (implemented, `claude/sports-news`)

- `src/lib/news/feed.ts`: strict parser for the feed contract below. It keeps
  only `status: "published"` items with a headline, summary, date and an
  `https` article URL on `AMIGO_WORLD_ORIGIN`. It adds referral tags
  (`utm_source=eksusportshub&utm_medium=referral&utm_campaign=sports_news`),
  with no personal data.
- `src/lib/news/source.ts`: server-only fetch, 3 s timeout, cached 5 min (tag
  `sports-news`).
  - Unset → `unconfigured`: the homepage section is hidden and `/news` shows
    "No stories published yet".
  - Error → `unavailable`: a friendly notice. Scores are unaffected.
- `NewsSection` on the homepage (after Results; hidden when empty), `/news`
  (12 per page, `?page=`), and `NewsCard` showing the image, category,
  Report/Opinion label, date, headline, summary, photo credit and
  "Read Full Story on Amigo World".
- No database tables, no credentials, and no coupling to match or operator
  logic.

Environment variables (server-side, no secrets):

| Variable | Example |
|---|---|
| `AMIGO_NEWS_FEED_URL` | `https://amigoworld.com.ng/api/sports-news` |
| `AMIGO_WORLD_ORIGIN` | `https://amigoworld.com.ng` |

## Feed contract Amigo World must serve

`GET AMIGO_NEWS_FEED_URL?page=1&limit=12` (public, read-only, cacheable):

```json
{ "items": [ {
    "id": "stable-article-id", "status": "published",
    "headline": "…", "summary": "…",
    "category": "MATCH_REPORT|PLAYER_SPOTLIGHT|TEAM_UPDATE|COMPETITION|INTERVIEW|UPDATE",
    "kind": "report|opinion", "published_at": "ISO-8601",
    "url": "https://amigoworld.com.ng/news/<id>",
    "image_url": "https://… (≈1200×675, optimised)", "image_alt": "…", "image_credit": "…",
    "featured": false,
    "match_id": "<Sports Hub match uuid, optional>", "team_id": "…", "competition_id": "…"
} ], "has_more": false }
```

Only published items may appear. Unpublishing removes an item from the next
feed response, and Sports Hub drops it within 5 minutes.

## What Amigo World is missing (checked against `amigo-app`, Nov 2026)

1. **An article model.** Posts are capped at 2,000 characters and 4 photos,
   with no headline, summary, category, featured image, report/opinion flag,
   draft/publish state or editorial approval.
2. **An editorial role and workflow.** Authorised publishers need to draft,
   preview, publish, edit, unpublish and feature articles. Only admins and
   designated editors should be able to publish official EKSU Sports Hub news,
   and it must be visibly separate from user posts.
3. **The public, read-only feed** above. It needs no service-role keys in any
   browser, and RLS must expose published rows only.
4. **Public article pages** (`/news/:id`) readable without signing in, with
   Open Graph tags and `og:image`. Sign-in must return to the same article for
   likes, comments, replies and sharing, which can reuse the existing post
   interactions and moderation.
5. **A back-link on each article** ("View Match Details on EKSU Sports Hub"),
   built from `match_id` / `team_id` / `competition_id`. For example
   `https://eksusportshub.com.ng/matches/<match_id>`.
6. **Production readiness.** Amigo's own launch notes say the newer work is
   only on Preview, and promotion still needs the owner's approval.

Content rules:
- Never invent results, statistics or quotations.
- AI drafts need editorial approval before publishing.
- Credit photos and get consent from the people shown.
- Never show matric numbers or private records.
