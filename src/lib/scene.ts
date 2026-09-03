"use client";
import { create } from "zustand";

/**
 * Is the 3D canvas actually contributing pixels?
 *
 * The story acts sit above a stack of fully opaque commerce sections. Once the first of them
 * reaches the top of the viewport the canvas is behind a wall, and every frame it renders from
 * there to the footer is a jungle nobody can see -- which is most of the page now that the
 * almanac and the press are on it. Flipping frameloop to "never" costs nothing to reverse and
 * hands the whole GPU back for the half of the page that is DOM.
 */
export const useScene = create<{ live: boolean; setLive: (v: boolean) => void }>((set) => ({
  live: true,
  setLive: (live) => set((s) => (s.live === live ? s : { live })),
}));
