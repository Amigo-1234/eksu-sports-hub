/** Official club crests supplied by the teams, keyed by team id (files in /public/crests). */
export const CRESTS: Record<string, string> = {
  "e95b26a1-4a64-4f34-941b-e3bb94a78efc": "/crests/downfall-fc.png", // Downfall FC
  "c58f765e-52a0-4d03-93fa-8e48cf94cdcf": "/crests/khe.png", // KHE
  "e439404f-fc81-4afb-8cd7-db16d8c76fa6": "/crests/ptsa-fc.png", // PTSA FC
  "75d6982a-1e7f-458d-bf31-9aa5769e5934": "/crests/gsf-eksu.png", // GSF EKSU
};

export const crestFor = (teamId: string | undefined): string | undefined => (teamId ? CRESTS[teamId] : undefined);
