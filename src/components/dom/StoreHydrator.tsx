"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useConsent } from "@/lib/consent";

/**
 * Reads both persisted stores off localStorage, once, after the tree has mounted.
 *
 * Both are declared `skipHydration`. The reason is the same for each and worth stating once:
 * localStorage is synchronous, so a store that hydrates at module scope is already full on the
 * client's first render while the server's HTML was rendered from an empty one. React resolves that
 * disagreement by keeping the server's markup, so the cart badge shows nothing until some unrelated
 * state change happens to re-render the nav. Deferring the read to an effect makes the first client
 * render match the server exactly, and the second one -- a frame later -- show the real cart.
 *
 * Renders nothing.
 */
export default function StoreHydrator() {
  useEffect(() => {
    useStore.persist.rehydrate();
    useConsent.persist.rehydrate();
  }, []);
  return null;
}
