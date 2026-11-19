"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Practice mode (applicant skills test). When set, the console hides links
 * back into the real operator area and developer controls, and shows the
 * practice's own finish screen at full-time.
 */
export const PracticeContext = createContext<{ done: ReactNode } | null>(null);
export const usePractice = () => useContext(PracticeContext);
