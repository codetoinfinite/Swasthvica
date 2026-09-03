"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Cookie and tracking consent.
 *
 * India's Digital Personal Data Protection Act, 2023 asks for consent that is free, specific,
 * informed, unconditional and unambiguous, given by a clear affirmative action, and as easy to
 * withdraw as it was to give. Three things follow, and all three are load-bearing:
 *
 *  - `null` is not "no". An undecided visitor is a visitor who has not been asked yet, and the
 *    banner has to keep asking. A `false` is an answer, and the banner goes away.
 *  - Reject is one click, in the same place and at the same weight as accept. A reject buried a
 *    layer down is not consent freely given.
 *  - Withdrawal has a permanent home. The /cookies page reopens this, so it is as easy to take
 *    back on day thirty as it was to give on day one.
 *
 * `necessary` is not in the shape because it is not a choice: the cart lives in localStorage under
 * `swasthvica-cart` and is what the customer asked for by putting something in it.
 *
 * The store is `skipHydration`, so `hydrated` starts false and the banner draws nothing until the
 * stored answer is actually in hand. Without that gate a visitor who answered months ago gets the
 * banner flashed at them on every cold load, which is the single most common way a consent banner
 * is got wrong.
 */

export type Bucket = "analytics" | "marketing";

export type ConsentState = {
  /** null until the visitor has answered */
  analytics: boolean | null;
  marketing: boolean | null;
  /** ISO timestamp of the decision -- DPDP wants the record, not just the flag */
  decidedAt: string | null;
  decided: boolean;
  /** false until localStorage has been read -- see StoreHydrator */
  hydrated: boolean;
  accept: (choice: { analytics: boolean; marketing: boolean }) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** puts it back to undecided, which brings the banner back */
  withdraw: () => void;
};

const stamp = () => new Date().toISOString();

export const useConsent = create<ConsentState>()(
  persist(
    (set) => ({
      analytics: null,
      marketing: null,
      decidedAt: null,
      decided: false,
      hydrated: false,
      accept: ({ analytics, marketing }) =>
        set({ analytics, marketing, decided: true, decidedAt: stamp() }),
      acceptAll: () => set({ analytics: true, marketing: true, decided: true, decidedAt: stamp() }),
      rejectAll: () => set({ analytics: false, marketing: false, decided: true, decidedAt: stamp() }),
      withdraw: () => set({ analytics: null, marketing: null, decided: false, decidedAt: null }),
    }),
    {
      name: "swasthvica-consent",
      version: 1,
      // Same reason as the cart store: hydrate in an effect so the first client render matches the
      // server's. StoreHydrator calls rehydrate() for both.
      skipHydration: true,
      onRehydrateStorage: () => () => useConsent.setState({ hydrated: true }),
      partialize: (s) => ({
        analytics: s.analytics,
        marketing: s.marketing,
        decided: s.decided,
        decidedAt: s.decidedAt,
      }),
    }
  )
);

/** Non-reactive read, for the event layer, which runs outside React. */
export const consentFor = (bucket: Bucket) => useConsent.getState()[bucket] === true;
