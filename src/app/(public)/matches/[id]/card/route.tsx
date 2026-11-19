import { ImageResponse } from "next/og";
import { getMatch } from "@/lib/data";
import { CARD_SIZE, MatchCard, cardFonts, type CardFormat } from "@/lib/match-card";
import { isLive } from "@/lib/status";

/** GET /matches/:id/card?format=status|wide → PNG share card for the match. */
export async function GET(request: Request, { params }: RouteContext<"/matches/[id]/card">) {
  const { id } = await params;
  const match = await getMatch(id);
  if (!match) return new Response("Not found", { status: 404 });
  const format: CardFormat = new URL(request.url).searchParams.get("format") === "wide" ? "wide" : "status";
  try {
    return new ImageResponse(await MatchCard({ match, format }), {
      ...CARD_SIZE[format],
      fonts: await cardFonts(),
      headers: {
        // Live scores change: short cache while in play, longer otherwise.
        "Cache-Control": isLive(match.status) ? "public, max-age=30, s-maxage=30" : "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return new Response("Could not draw the card", { status: 500 });
  }
}
