"use client";
import { useEffect } from "react";
import Interstitial from "@/components/dom/shell/Interstitial";
import { Button, LinkButton } from "@/components/dom/shell/Buttons";

/**
 * The route error boundary. It sits inside the root layout, so the nav and the cart survive
 * whatever threw -- a customer who hits this mid-order still has their basket.
 *
 * `retry`, not `reset`. In Next 16 the error component is handed both: `reset()` re-renders the
 * boundary's children from the cache it already has, `retry()` re-fetches them first. For a page
 * that failed while fetching, re-rendering the same failed payload just draws the same error a
 * second time, which is why the docs point at retry for the ordinary case. `reset` is not
 * destructured here at all -- there is no cache-only failure on this site worth the second button.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Left as a console report on purpose. Nothing here should reach a third party before the
    // visitor has agreed to be measured, and an error reporter is exactly the kind of third party
    // the consent banner is asking about. Wire one behind `consentFor("analytics")` when there is
    // one to wire.
    console.error("[swasthvica] route error", error.digest ?? "", error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1}>
      <Interstitial
        eyebrow="Something broke"
        title="The press jammed."
        actions={
          <>
            <Button onClick={() => retry()}>Try again</Button>
            <LinkButton href="/" weight="outline">
              Back to the valley
            </LinkButton>
          </>
        }
        footnote={
          error.digest ? (
            <>
              Reference <span className="font-mono tracking-wider text-cream-200/70">{error.digest}</span>{" "}
              — quote it if you write to us.
            </>
          ) : undefined
        }
      >
        <p>
          This page failed to load. Nothing you had in your cart has been lost, and nothing has been
          charged.
        </p>
      </Interstitial>
    </main>
  );
}
