import { EmptyState } from "@/components/ui/EmptyState";
import { WhistleIcon } from "@/components/ui/icons";

export default function NotFound() {
  return (
    <div className="py-10">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={<WhistleIcon size={22} />}
        title="Offside! We couldn't find that page"
        description="The match, team or competition may have been removed, or the link is wrong."
        action={{ href: "/", label: "Back to scores" }}
      />
    </div>
  );
}
