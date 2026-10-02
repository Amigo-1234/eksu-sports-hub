import Link from "next/link";
import type { CompetitionOverview } from "@/lib/admin/data/engine";
import { COMPETITION_STATUS_TONE, FORMAT_LABEL } from "./CompetitionFields";
import { CompetitionNav } from "./CompetitionNav";
import { Badge, btn, PageTitle } from "./ui";

/** Title + status line + section navigation shared by the control-centre pages. */
export function CompetitionHeader({ o, section }: { o: CompetitionOverview; section?: string }) {
  const c = o.competition;
  return (
    <>
      <PageTitle
        title={section ? `${c.name} · ${section}` : c.name}
        back={{ href: "/admin/competitions", label: "Competitions" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={COMPETITION_STATUS_TONE[c.status]}>{c.status.toLowerCase()}</Badge>
            {c.kind !== "OFFICIAL" && <Badge tone="warn">{c.kind.toLowerCase()} · not official</Badge>}
            {FORMAT_LABEL[c.format]} · {c.season} · {o.summary.teams} teams
          </span>
        }
        actions={
          c.status !== "DRAFT" ? (
            <Link href={`/competitions/${c.id}`} className={btn.secondary}>
              Public page
            </Link>
          ) : undefined
        }
      />
      <CompetitionNav id={c.id} />
    </>
  );
}
