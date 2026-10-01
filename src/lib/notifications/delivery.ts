/** Outcome of one push attempt, reported back to Postgres (service_notification_report). */
export type DeliveryResult = { id: string; result: "SENT" | "RETRY" | "GONE" | "FAILED"; code?: number; error?: string };

/** Push-service status → what to do with the delivery. */
export function classify(status: number | undefined): DeliveryResult["result"] {
  if (status !== undefined && status >= 200 && status < 300) return "SENT";
  if (status === 404 || status === 410) return "GONE"; // subscription expired / unsubscribed
  if (status === undefined || status === 408 || status === 429 || status >= 500) return "RETRY"; // network, throttled, outage
  return "FAILED"; // 400/401/403/413: our request is wrong — retrying will not help
}
