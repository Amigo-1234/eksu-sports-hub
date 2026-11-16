/** Official club crests supplied by the teams, keyed by team id (files in /public/crests). */
export const CRESTS: Record<string, string> = {
  "e95b26a1-4a64-4f34-941b-e3bb94a78efc": "/crests/downfall-fc.png", // Downfall FC
  "c58f765e-52a0-4d03-93fa-8e48cf94cdcf": "/crests/khe.png", // KHE
};

export const crestFor = (teamId: string | undefined): string | undefined => (teamId ? CRESTS[teamId] : undefined);
