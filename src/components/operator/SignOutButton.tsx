"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { operatorControl } from "@/lib/operator/actions";
import { useConnection } from "@/lib/operator/hooks";

export function SignOutButton() {
  const router = useRouter();
  const { snap } = useConnection();
  const [armed, setArmed] = useState(false);
  const queued = snap.intents.filter((i) => i.state !== "CONFIRMED").length;
  return (
    <button
      type="button"
      onClick={async () => {
        // Signing out with unsent actions would strand them: ask twice.
        if (queued > 0 && !armed) {
          setArmed(true);
          return;
        }
        await operatorControl.signOut();
        router.replace("/op/login");
        router.refresh();
      }}
      className={`h-11 shrink-0 rounded-lg border-2 px-2.5 text-xs font-bold ${armed ? "border-live bg-live text-white" : "border-line-strong"}`}
    >
      {armed ? `${queued} unsent — sign out?` : "Sign out"}
    </button>
  );
}
