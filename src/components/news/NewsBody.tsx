import type { ReactNode } from "react";

/*
 * Renders an article body written as plain text — no HTML is ever injected.
 * Blank lines separate paragraphs; "## " starts a subheading; lines starting
 * with "- " form a bullet list; http(s) links become clickable.
 */

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function linkify(text: string, keyBase: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={`${keyBase}-${i}`} href={part} className="font-semibold break-all text-brand-fg underline underline-offset-2" rel="noopener noreferrer" target={part.includes("eksusportshub.com.ng") ? undefined : "_blank"}>
        {part.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    ) : (
      part
    ),
  );
}

function lines(text: string, keyBase: string): ReactNode[] {
  return text.split("\n").flatMap((l, i, all) => [...linkify(l, `${keyBase}-${i}`), i < all.length - 1 ? <br key={`${keyBase}-br-${i}`} /> : null]);
}

export function NewsBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
  return (
    <div className="space-y-4 text-[16px] leading-relaxed text-ink">
      {blocks.map((b, i) => {
        if (b.startsWith("## ")) {
          return (
            <h2 key={i} className="pt-2 font-display text-[22px] leading-tight font-extrabold tracking-[0.01em] uppercase">
              {b.slice(3).trim()}
            </h2>
          );
        }
        const rows = b.split("\n");
        if (rows.every((r) => r.trimStart().startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {rows.map((r, j) => (
                <li key={j}>{linkify(r.trimStart().slice(2), `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{lines(b, String(i))}</p>;
      })}
    </div>
  );
}
