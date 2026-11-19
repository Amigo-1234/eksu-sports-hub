import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import crest from "../../../../public/brand/eksu-crest-192.png";
import { PracticeRunner } from "@/components/practice/PracticeRunner";
import { serviceClient } from "@/lib/registration/server";

export const metadata: Metadata = {
  title: "Operator practice · EKSU Sports Hub",
  robots: { index: false, follow: false },
};

type Status = { first_name: string | null; status: "open" | "submitted" | "expired" | "revoked"; score: number | null };

/** Private practice link for an operator applicant (see operator_practice_links). */
export default async function PracticePage({ params }: PageProps<"/practice/[token]">) {
  await connection();
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) notFound();
  const db = serviceClient();
  if (!db) return <Shell><Message title="Practice unavailable" body="Practice links only work on the live site." /></Shell>;
  const { data, error } = await db.rpc("service_practice_open", { p_token: token });
  if (error) {
    if (error.code === "EK404") notFound();
    return <Shell><Message title="Practice unavailable" body="Please try again in a moment." /></Shell>;
  }
  const s = data as Status;
  if (s.status === "submitted")
    return <Shell><Message title="Already submitted" body={`Your practice result (${s.score}/100) has been sent to the EKSU Sports Hub team. Thank you!`} /></Shell>;
  if (s.status !== "open")
    return <Shell><Message title="Link no longer active" body="This practice link has expired. Ask the EKSU Sports Hub team for a new one." /></Shell>;
  return (
    <Shell>
      <PracticeRunner token={token} firstName={s.first_name} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-3">
          <Image src={crest} alt="" width={28} height={28} />
          <span className="font-display text-lg font-extrabold uppercase">Operator practice</span>
          <span className="ml-auto rounded border border-accent-700 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-accent-700 uppercase">Not a real match</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-3">{children}</main>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-display text-2xl font-extrabold uppercase">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
    </section>
  );
}
