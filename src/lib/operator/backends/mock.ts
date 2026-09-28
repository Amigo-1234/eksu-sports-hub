/**
 * mockOperatorBackend — in-browser DEMO. Nothing leaves the device.
 * Deliberately selected with NEXT_PUBLIC_OPERATOR_BACKEND=mock.
 */
import { operatorStore } from "../store";
import type { OperatorBackend } from "./types";

const SIMULATED_LATENCY_MS = 700;

export const mockOperatorBackend: OperatorBackend = {
  kind: "mock",
  async deliver() {
    await new Promise((r) => setTimeout(r, SIMULATED_LATENCY_MS));
    if (!operatorStore.isOnline()) return { ok: false, retryable: true, error: "Connection lost while sending" };
    if (operatorStore.get().networkSim === "failing") {
      return { ok: false, retryable: false, error: "Server rejected the request (simulated)" };
    }
    return { ok: true };
  },
};
