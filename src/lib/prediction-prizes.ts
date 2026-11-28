/** Matches whose "Predict the score" game carries a prize (shown on the match page and homepage banner). */
export interface PredictionPrize {
  sponsor: string;
}

export const PREDICTION_PRIZES: Record<string, PredictionPrize> = {
  // F8 Ballers FC v EKSU Galacticos FC, NLO Cup, Sat 28 Nov 2026 12:00
  "697df93b-5cd8-4be1-bc69-9130c7c0b52e": { sponsor: "EKSU Galacticos FC" },
};

export const predictionPrizeFor = (matchId: string): PredictionPrize | null => PREDICTION_PRIZES[matchId] ?? null;
