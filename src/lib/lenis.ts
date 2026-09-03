import type Lenis from "lenis";

/** The single Lenis instance, shared with components that must lock or resync scroll. */
export const lenisRef: { current: Lenis | null } = { current: null };
