import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import JsonLd from "@/components/dom/JsonLd";
import { breadcrumbSchema, graph } from "@/lib/schema";
import { pageMetadata } from "@/lib/site";
import { BRAND, SUPPORT } from "@/lib/business";

const DESCRIPTION =
  "What this site does to stay usable with a keyboard, a screen reader or reduced motion — and, plainly, what it does not do yet.";

export const metadata: Metadata = pageMetadata("Accessibility", DESCRIPTION, "/accessibility");

/**
 * An accessibility statement that is a description rather than a claim.
 *
 * Every sentence below was checked against the code before it was written, and the gaps are named
 * instead of being left out. A statement that asserts WCAG 2.1 AA conformance without an audit
 * behind it is not a courtesy to a disabled visitor -- it is a reason for them to distrust
 * everything else on the site when the first thing they try does not work.
 */
export default function AccessibilityPage() {
  return (
    <PolicyPage
      eyebrow="Accessibility"
      title="Using this site"
      standfirst="This is a heavily visual site, and that is exactly why the text underneath it has to stand on its own. Here is what has been done, what has not, and how to tell us when something is in your way."
    >
      <JsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Accessibility", path: "/accessibility" },
          ]),
        ])}
      />

      <h2>The moving picture is decoration</h2>
      <p>
        The valley behind the pages is a canvas, and it is marked <code>aria-hidden</code>: a screen
        reader is never told it is there, because there is nothing in it to read. Every fact it
        illustrates — what a product is, what is in it, what it costs — is ordinary text in the page,
        in the order you would want it read. Nothing on this site is available only as an image, and
        no price, policy or contact detail is drawn rather than written.
      </p>

      <h2>If you have asked your device for less motion</h2>
      <p>
        The site reads that setting and changes what it does. Smooth scrolling drops to one-to-one,
        so the page goes where you put it and stops. The scene stops animating — no drifting mist,
        no swaying vines, no drop falling. Nothing on the site depends on an animation finishing for
        its content to appear, so a stilled page is a complete page, not a broken one.
      </p>

      <h2>With a keyboard</h2>
      <p>
        The first thing in the tab order on every page is a <strong>Skip to the page</strong> link
        that jumps past the navigation. Focus is drawn as a brass outline rather than the browser
        default, which is a blue that disappears against this palette. The basket opens as a dialog
        that takes focus, keeps Tab inside it, closes on <kbd>Esc</kbd>, and is removed from the tab
        order entirely while it is shut — so a closed drawer never swallows keystrokes on its way
        past.
      </p>
      <p>
        Every form field on the site has a real label attached to it, not a placeholder standing in
        for one, so the label is still there once you have started typing. Errors are announced when
        they appear and tied to the field they belong to, and submitting a form with a mistake in it
        moves focus to the first field that needs fixing.
      </p>

      <h2>Text and contrast</h2>
      <p>
        Nothing is set in an image, so text scales when you zoom or raise your browser&rsquo;s font
        size, and reflows rather than clipping. Colour is never the only way something is said: a
        sold-out bottle carries the words, a required field carries the word, an error carries the
        word.
      </p>

      <h2>What has not been done</h2>
      <p>
        There has been no independent accessibility audit of this site, so nothing here claims
        conformance to WCAG 2.1 at any level. What is written above is a description of decisions
        taken while building it, not a certificate. Specifically, three things are known to be
        imperfect:
      </p>
      <ul>
        <li>
          Some of the quieter text — captions, footnotes, the fainter labels — sits at a contrast
          ratio chosen by eye rather than measured against a target, and may be harder to read than
          it should be.
        </li>
        <li>
          The harvest wheel on the home page is an interactive diagram. It can be operated with a
          keyboard and every plant on it has its own{" "}
          <IntentLink href="/ingredients">page in plain text</IntentLink>, which is the route to take
          if the wheel is awkward — but the wheel itself is not a substitute for that page.
        </li>
        <li>
          The product viewer lets you turn a bottle by dragging it. It is decoration; nothing is
          learned by turning it that is not written beside it.
        </li>
      </ul>

      <h2>Tell us</h2>
      <p>
        If something on this site stopped you doing what you came to do, please say so — it is the
        only way it gets fixed, and we would rather hear it than not. Write to{" "}
        <Fact value={SUPPORT.email} /> or call <Fact value={SUPPORT.phone} />, {SUPPORT.hours}. Tell
        us the page and what happened; you do not need to know the technical name for it.
      </p>
      <p>
        If you would rather not use this site at all, we will take an order over the phone on that
        same number and read you anything on any page. {BRAND} is a small enough operation that this
        is a real offer and not a formality.
      </p>
    </PolicyPage>
  );
}
