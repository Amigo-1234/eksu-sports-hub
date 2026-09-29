import { signOutAdmin } from "@/lib/admin/actions/auth";
import { btn } from "./ui";

export function SignOut({ className = btn.small }: { className?: string }) {
  return (
    <form action={signOutAdmin}>
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}
