import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import { BRAND, LICENCES, SUPPORT, isPending } from "@/lib/business";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "What Swasthvica products are and are not: personal-care and wellness preparations, not medicines, not medical advice, and not a substitute for treatment.";

export const metadata: Metadata = pageMetadata("Disclaimer", DESCRIPTION, "/disclaimer");

/**
 * The page that keeps the rest of the site inside the line.
 *
 * Two Acts set that line. Section 3 of the Drugs and Magic Remedies (Objectionable Advertisements)
 * Act, 1954 bans advertising a remedy for 54 listed conditions -- diabetes among them -- and rule
 * 106 with Schedule J of the Drugs Rules, 1945 adds 51 more, including baldness and premature
 * greying. Section 3(aaa) of the Drugs and Cosmetics Act, 1940 decides cosmetic against drug by the
 * CLAIM, not the ingredient: the same bottle of oil is a cosmetic while it says it conditions hair
 * and a misbranded drug the moment it says it cures hair loss.
 *
 * One thing this page cannot do, and must not be written as though it could: the Central Consumer
 * Protection Authority's 2022 guidelines state that a disclaimer shall not attempt to correct a
 * misleading claim. A disclaimer that is load-bearing is a failed disclaimer. The copy on the
 * product pages has to be clean on its own, and this page only adds the context a buyer needs.
 */
export default function DisclaimerPage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Disclaimer"
      standfirst="Plainly: these are herbal preparations for everyday care, not medicines. Nothing on this site is medical advice, and nothing here should replace a conversation with your doctor."
    >
      <h2>What these products are</h2>
      <p>
        {BRAND} products are herbal personal-care and general wellness preparations, made to be used
        as part of an ordinary routine. Where we describe a herb by its traditional use, we are
        describing a tradition — a use recorded in Ayurvedic practice — and not asserting a clinical
        outcome.
      </p>
      <p>
        <strong>
          They are not intended to diagnose, treat, cure or prevent any disease, disorder or
          condition.
        </strong>{" "}
        They are not a substitute for medical diagnosis, prescribed medication, surgery, or advice
        from a registered medical practitioner.
      </p>

      <h2>Who makes them, and under what licence</h2>
      <p>
        The home page says the particulars are here, so here they are. Every field below is read
        from one file in the source of this site — if a licence number is missing, it shows as a
        gap rather than as something we made up.
      </p>
      <dl>
        <dt>Made by</dt>
        <dd>
          <Fact value={LICENCES.manufacturerName} />
        </dd>
        <dt>At</dt>
        <dd>
          <Fact value={LICENCES.manufacturerAddress} />
        </dd>
        <dt>Cosmetic manufacturing licence</dt>
        <dd>
          <Fact value={LICENCES.cosmeticFormCos8} />
        </dd>
        {LICENCES.ayushFormD25 && (
          <>
            <dt>Ayurvedic manufacturing licence</dt>
            <dd>{LICENCES.ayushFormD25}</dd>
          </>
        )}
        {!isPending(LICENCES.fssai) && LICENCES.fssai && (
          <>
            <dt>FSSAI licence</dt>
            <dd>{LICENCES.fssai}</dd>
          </>
        )}
      </dl>
      <p>
        A shampoo or a hair oil sold on cosmetic claims is licensed under the Cosmetics Rules, 2020.
        An ingestible is a different route again: as a food or supplement it carries an FSSAI licence,
        and only if it is positioned as an ayurvedic <em>medicine</em> does it need a licence under the
        Drugs and Cosmetics Rules. We say which applies rather than implying all of them.
      </p>
      <p>
        The pack itself carries the same particulars, along with the batch number, the date of
        manufacture and the expiry, because the Legal Metrology (Packaged Commodities) Rules require
        them there. If what is printed on your bottle and what is written here do not agree, the
        bottle is the one to trust — and please{" "}
        <IntentLink href="/contact">tell us</IntentLink>, because one of the two is wrong.
      </p>

      <h2>Nothing here is medical advice</h2>
      <p>
        The product pages, the ingredient notes, the ritual steps and anything our support team
        writes to you are general information about how a preparation is used. They are not personal
        medical advice, and they cannot take account of your history, your medication or your
        allergies. If you have a health concern, ask a doctor or a registered Ayurvedic practitioner.
      </p>
      <p>
        <strong>Never stop, reduce or delay prescribed treatment</strong> because of anything you read
        here, and never start using a preparation alongside medication without asking the person who
        prescribed it. In an emergency, seek medical help immediately rather than reaching for
        anything on this site.
      </p>

      <h2>Results vary, and we will not pretend otherwise</h2>
      <p>
        Plant material is not uniform, and neither are people. Colour, scent, viscosity and sediment
        differ between batches and between seasons — that is what an unstandardised natural
        preparation looks like, and it is not a defect. How a preparation suits you depends on your
        hair, skin, diet, water, climate and health. We publish no before-and-after imagery and quote
        no percentages, because we have no way to promise you a particular result.
      </p>

      <h2>Before you use anything applied to the body</h2>
      <ul>
        <li>
          <strong>Patch test first.</strong> Apply a small amount to the inside of the forearm and
          leave it 24 hours. If there is redness, itching, swelling or burning, do not use the
          product.
        </li>
        <li>
          <strong>Read the full ingredient list</strong> on the pack and on the product page. Natural
          does not mean non-allergenic — plant extracts and essential oils are among the more common
          contact allergens. If you are allergic or sensitive to any ingredient, or to plants in the
          same family, do not use it.
        </li>
        <li>For external use only. Keep away from the eyes; if it enters the eye, rinse with clean water.</li>
        <li>Do not apply to broken, inflamed, sunburnt or infected skin.</li>
        <li>Stop at once if irritation develops, and see a doctor if it does not settle.</li>
        <li>Keep out of the reach of children. Store away from direct sunlight and heat.</li>
        <li>Do not use after the best-before date on the pack.</li>
      </ul>

      <h2>Before you take anything by mouth</h2>
      <p>
        Some products in the range are taken internally. They are food and wellness preparations —{" "}
        <strong>not for medicinal use</strong> — and the following applies to all of them.
      </p>
      <ul>
        <li>
          <strong>Talk to your doctor first</strong> if you are pregnant, trying to conceive, or
          breastfeeding; if you are under 18; if you are managing any medical condition; if you take
          prescription medication; or if you are due to have surgery. Herbs interact with medicines,
          and some of them meaningfully.
        </li>
        <li>Do not exceed the suggested daily quantity. More is not better and can be worse.</li>
        <li>These preparations do not replace a varied diet or a healthy lifestyle.</li>
        <li>Stop and seek advice if you feel unwell after taking one.</li>
        <li>Keep out of the reach of children, in a cool dry place, away from sunlight.</li>
      </ul>

      <h2>Claims we do not make</h2>
      <p>
        We do not claim that any product treats or prevents diabetes, hair loss, greying, infertility,
        obesity or any other condition listed under the Drugs and Magic Remedies (Objectionable
        Advertisements) Act, 1954 or Schedule J to the Drugs Rules, 1945. We do not claim any product
        rejuvenates, restores youth, or improves sexual capacity. If you read anything on this site as
        such a claim, it is written badly and we would like to know — write to{" "}
        <Fact value={SUPPORT.email} /> and we will correct the wording.
      </p>

      <h2>The site itself</h2>
      <p>
        We keep this site accurate and current, but we do not warrant that every description,
        photograph, availability figure or price is free of error at every moment. Errors are
        corrected as soon as we find them, and clause 4 of the{" "}
        <IntentLink href="/terms">terms and conditions</IntentLink> says what happens if one affects your order.
        Links to other sites are for reference; we are not responsible for their content.
      </p>
      <p>
        Nothing on this page limits your rights under the Consumer Protection Act, 2019, or our
        obligations under the <IntentLink href="/refunds">refunds policy</IntentLink> — including your right to
        return anything defective, spurious or not as described.
      </p>
    </PolicyPage>
  );
}
