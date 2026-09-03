"use client";
import Link from "next/link";
import { useState } from "react";
import type { ComponentProps } from "react";

/**
 * A <Link> that waits for intent before it prefetches.
 *
 * Next prefetches every static route whose link is in the viewport, in full. The footer is on all
 * 24 routes and carries twenty of them, so every single page load pulled roughly 110KB of RSC
 * payloads for pages nobody had asked for -- more bytes than the whole of three.js after gzip --
 * and did it on the same connection the scene was still fetching its geometry textures over.
 *
 * `prefetch={false}` alone would fix the waste and make the footer feel slow to click. This is the
 * pattern from next/dist/docs/01-app/02-guides/prefetching.md instead: hold prefetching off until
 * the pointer arrives, then hand the link back to Next by flipping the prop to `null`, which is
 * "the default", not "off". By the time a click lands the payload is usually already in.
 *
 * `onTouchStart` is in the list because a phone has no hover: the touch that begins the tap is the
 * only warning the link gets, which still buys the round trip between touchstart and click.
 * `onFocus` covers the keyboard, which would otherwise be the one input that never prefetches.
 */
export default function IntentLink({
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);
  const arm = () => setIntent(true);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={arm}
      onTouchStart={arm}
      onFocus={arm}
    >
      {children}
    </Link>
  );
}
