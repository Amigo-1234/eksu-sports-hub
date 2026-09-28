import { PublicShell } from "@/components/layout/PublicShell";
import { NotFoundContent } from "@/components/ui/NotFoundContent";

/** Unmatched URLs render outside any route group, so wrap in the public chrome. */
export default function NotFound() {
  return (
    <PublicShell>
      <NotFoundContent />
    </PublicShell>
  );
}
