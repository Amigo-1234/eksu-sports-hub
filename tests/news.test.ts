/** Sports News feed parsing (Amigo World previews). Run: npm run test:news */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNewsFeed, parseNewsItem } from "../src/lib/news/feed.ts";

const HOST = "amigoworld.com.ng";
const ok = {
  id: "a1", status: "published", headline: "Downfall lead at the break", summary: "Two first-half goals.",
  category: "MATCH_REPORT", kind: "report", published_at: "2026-11-15T07:20:00Z",
  url: "https://amigoworld.com.ng/news/a1", image_url: "https://cdn.example.com/a1.jpg", image_alt: "Players", featured: true,
  match_id: "12684ff4-d1c5-4173-86c8-884381330409",
};

test("a published article becomes a preview linking to that exact story, with referral tags only", () => {
  const n = parseNewsItem(ok, HOST)!;
  assert.equal(n.headline, "Downfall lead at the break");
  const u = new URL(n.url);
  assert.equal(u.host, HOST);
  assert.equal(u.pathname, "/news/a1");
  assert.deepEqual([...u.searchParams.keys()].sort(), ["utm_campaign", "utm_medium", "utm_source"]);
  assert.equal(n.matchId, ok.match_id);
  assert.equal(n.featured, true);
});

test("drafts, unpublished and incomplete items are never shown", () => {
  for (const status of ["draft", "unpublished", "pending", undefined]) assert.equal(parseNewsItem({ ...ok, status }, HOST), null);
  assert.equal(parseNewsItem({ ...ok, headline: "" }, HOST), null);
  assert.equal(parseNewsItem({ ...ok, published_at: "soon" }, HOST), null);
});

test("Read Full Story links must be https on Amigo World (no broken or foreign links)", () => {
  assert.equal(parseNewsItem({ ...ok, url: "http://amigoworld.com.ng/news/a1" }, HOST), null);
  assert.equal(parseNewsItem({ ...ok, url: "https://evil.example/news/a1" }, HOST), null);
  assert.equal(parseNewsItem({ ...ok, url: "javascript:alert(1)" }, HOST), null);
  assert.equal(parseNewsItem({ ...ok, image_url: "http://insecure/x.jpg" }, HOST)?.imageUrl, null);
});

test("unknown categories fall back; opinion is labelled; ids that are not UUIDs are ignored", () => {
  const n = parseNewsItem({ ...ok, category: "RUMOUR", kind: "opinion", match_id: "1; drop" }, HOST)!;
  assert.equal(n.category, "UPDATE");
  assert.equal(n.kind, "opinion");
  assert.equal(n.matchId, null);
});

test("feed: newest first, duplicates removed, bad payloads tolerated", () => {
  const f = parseNewsFeed({ items: [{ ...ok, id: "old", published_at: "2026-11-01T00:00:00Z" }, ok, ok, { junk: 1 }], has_more: true }, HOST);
  assert.deepEqual(f.items.map((i) => i.id), ["a1", "old"]);
  assert.equal(f.hasMore, true);
  assert.deepEqual(parseNewsFeed(null, HOST), { items: [], hasMore: false });
  assert.deepEqual(parseNewsFeed({ items: "nope" }, HOST), { items: [], hasMore: false });
});

import { getStory, publishedStories, STORIES } from "../src/lib/news/stories.ts";

test("Sports Hub stories: only published ones are listed; each has an image, summary and internal page", () => {
  const ids = publishedStories().map((s) => s.id);
  assert.ok(ids.includes("downfall-lead-school-gate-at-half-time"));
  for (const s of STORIES.filter((x) => !x.published)) assert.equal(getStory(s.id), null);
  for (const s of publishedStories()) {
    // Stories published in code always carry a lead photo (dashboard stories may not).
    assert.ok(s.headline && s.summary && s.body.length && s.image && s.image.src.startsWith("/news/") && s.image.alt);
    assert.ok(!/amigo\s*world|amigoworld/i.test(JSON.stringify(s)), "no Amigo World links until it launches");
  }
  assert.equal(getStory("does-not-exist"), null);
});
