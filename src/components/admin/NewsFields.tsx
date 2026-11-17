import { toWatInput } from "@/lib/admin/time";
import { NEWS_CATEGORIES } from "@/lib/news/feed";
import type { AdminNewsPost, NewsMatchOption } from "@/lib/admin/data/news";
import { Check, Field, inputCls, selectCls } from "./ui";

/** Fields shared by "New story" and "Edit story". */
export function NewsFields({ post, matches }: { post?: AdminNewsPost; matches: NewsMatchOption[] }) {
  const sc = post?.id ?? "new";
  const linkedMissing = post?.match_id && !matches.some((m) => m.id === post.match_id);
  return (
    <div className="grid gap-4">
      {post && <input type="hidden" name="id" value={post.id} />}
      <Field scope={sc} label="Title">
        <input name="title" required minLength={3} maxLength={140} defaultValue={post?.title} placeholder="Civil 400L face Civil 500L in Wednesday friendly" className={inputCls} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field scope={sc} label="Category">
          <select name="category" defaultValue={post?.category ?? "UPDATE"} className={selectCls}>
            {Object.entries(NEWS_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field scope={sc} label="Type" hint="Shown on the story so readers can tell reporting from opinion.">
          <select name="kind" defaultValue={post?.kind ?? "report"} className={selectCls}>
            <option value="report">Report (facts)</option>
            <option value="opinion">Opinion</option>
          </select>
        </Field>
      </div>
      <Field scope={sc} label="Summary" hint="One or two sentences shown in lists and link previews (max 300 characters).">
        <textarea name="summary" rows={2} maxLength={300} defaultValue={post?.summary} className={`${inputCls} h-auto py-2`} />
      </Field>
      <Field
        scope={sc}
        label="Story"
        hint="Plain text. Leave a blank line between paragraphs. Stick to facts from the official match data — no invented quotes or statistics."
      >
        <textarea name="body" rows={12} maxLength={20000} defaultValue={post?.body} className={`${inputCls} h-auto py-2 leading-relaxed`} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field scope={sc} label="Linked match" hint="Optional — adds a link to the match centre on the story.">
          <select name="match_id" defaultValue={post?.match_id ?? ""} className={selectCls}>
            <option value="">No match</option>
            {linkedMissing && <option value={post.match_id!}>Current linked match</option>}
            {matches.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </Field>
        <Field scope={sc} label="Publish time (WAT)" hint="Leave empty to publish now. A future time schedules the story.">
          <input type="datetime-local" name="published_at" defaultValue={toWatInput(post?.published_at)} className={inputCls} />
        </Field>
        <Field scope={sc} label="Web address" hint="Made from the title if left empty.">
          <input name="slug" maxLength={90} defaultValue={post?.slug} placeholder="civil-400l-v-civil-500l" className={`${inputCls} font-mono`} />
        </Field>
        <div className="flex items-end">
          <Check name="pinned" label="Featured story" defaultChecked={post?.pinned} hint="Leads the Sports News section on the home page." />
        </div>
      </div>
    </div>
  );
}
