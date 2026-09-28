"use client";

import type { ReactNode } from "react";
import { useOperatorRuntime } from "@/lib/operator/hooks";
import { FeedbackProvider } from "./Feedback";

/** Loads this device's operator state and runs the (mock) intent queue. */
export function OperatorRuntime({ children }: { children: ReactNode }) {
  useOperatorRuntime();
  return <FeedbackProvider>{children}</FeedbackProvider>;
}
