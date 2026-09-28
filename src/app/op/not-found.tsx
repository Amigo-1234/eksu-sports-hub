import Link from "next/link";

export default function OperatorNotFound() {
  return (
    <div className="py-12 text-center">
      <h1 className="font-display text-2xl font-extrabold uppercase">Not assigned to you</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
        This match doesn&apos;t exist or isn&apos;t one of your assignments. Operators can only open matches they are assigned to.
      </p>
      <Link href="/op" className="mt-5 inline-flex h-12 items-center rounded-xl bg-brand-700 px-6 font-bold text-white">
        My assigned matches
      </Link>
    </div>
  );
}
