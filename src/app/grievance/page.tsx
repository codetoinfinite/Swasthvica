import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import { DATA_PROTECTION_OFFICER, GRIEVANCE_OFFICER, SUPPORT, formatAddress } from "@/lib/business";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "How to raise a complaint with Swasthvica, who handles it, and the timelines we are bound to — 48 hours to acknowledge, one month to resolve.";

export const metadata: Metadata = pageMetadata("Grievance Redressal", DESCRIPTION, "/grievance");

/**
 * The timelines here are 48 hours and one month, from rule 4(5) of the Consumer Protection
 * (E-Commerce) Rules, 2020. They are not the 24-hour/15-day pair that half the internet copies:
 * that pair comes from the IT (Intermediary Guidelines) Rules 2021, which bind a platform hosting
 * other people's content. This site sells its own goods and hosts nobody, so those Rules do not
 * apply -- and publishing their shorter clock would be volunteering for a breach we are not under.
 * If customer reviews are ever added, that changes for the reviews, and this page changes with it.
 */
export default function GrievancePage() {
  return (
    <PolicyPage
      eyebrow="Legal"
      title="Grievance redressal"
      standfirst="Every complaint reaches a named person, not a queue. Here is who, how, and by when."
    >
      <h2>Start with support</h2>
      <p>
        Most problems — a late parcel, a wrong item, a refund that has not landed — are resolved
        fastest by writing to customer care with your order number.
      </p>
      <dl>
        <dt>E-mail</dt>
        <dd>
          <Fact value={SUPPORT.email} />
        </dd>
        <dt>Phone</dt>
        <dd>
          <Fact value={SUPPORT.phone} />
        </dd>
        <dt>Hours</dt>
        <dd>{SUPPORT.hours}</dd>
      </dl>
      <p>
        You will receive a ticket number with the acknowledgement. Quote it in every later message
        and on any escalation; it is how the history stays attached to the complaint.
      </p>

      <h2>Escalate to the Grievance Officer</h2>
      <p>
        If support has not resolved it, or you would rather go straight there, the officer appointed
        under rule 4(4) of the Consumer Protection (E-Commerce) Rules, 2020 is:
      </p>
      <dl>
        <dt>Name</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.name} />
        </dd>
        <dt>Designation</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.designation} />
        </dd>
        <dt>E-mail</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.email} />
        </dd>
        <dt>Phone</dt>
        <dd>
          <Fact value={GRIEVANCE_OFFICER.phone} />
        </dd>
        <dt>Post</dt>
        <dd>
          <Fact value={formatAddress(GRIEVANCE_OFFICER.address)} />
        </dd>
      </dl>

      <h2>The timelines we are bound to</h2>
      <dl>
        <dt>Acknowledgement</dt>
        <dd>Within forty-eight (48) hours of receipt of the complaint, with a ticket number.</dd>
        <dt>Redressal</dt>
        <dd>Within one (1) month from the date of receipt of the complaint.</dd>
        <dt>Status</dt>
        <dd>Ask at any time by replying to the ticket; we will tell you where it actually is.</dd>
      </dl>
      <p>
        These are the statutory maximums, not our targets. In practice most complaints close inside
        a week, and we would rather tell you a real date than a comfortable one.
      </p>

      <h2>What to include</h2>
      <ul>
        <li>Your order number, and the e-mail or phone the order was placed with.</li>
        <li>What was expected and what arrived.</li>
        <li>Photographs, where the complaint is about damage, leakage or the wrong item.</li>
        <li>What outcome you want — replacement, refund, or an explanation.</li>
      </ul>

      <h2>Complaints about your personal data</h2>
      <p>
        Data complaints — a correction that has not been made, a deletion request, a withdrawal of
        consent, or a question about who your details were shared with — go to the officer named
        under rule 5(9) of the Information Technology (Reasonable Security Practices and Procedures
        and Sensitive Personal Data or Information) Rules, 2011:
      </p>
      <dl>
        <dt>Name</dt>
        <dd>
          <Fact value={DATA_PROTECTION_OFFICER.name} />
        </dd>
        <dt>E-mail</dt>
        <dd>
          <Fact value={DATA_PROTECTION_OFFICER.email} />
        </dd>
        <dt>Timeline</dt>
        <dd>Redressed within one (1) month of receipt.</dd>
      </dl>
      <p>
        What we collect and why is set out in full in the <IntentLink href="/privacy">privacy policy</IntentLink>
        .
      </p>

      <h2>If we still have not made it right</h2>
      <p>
        You are not limited to us. The National Consumer Helpline is on <strong>1915</strong>, and
        complaints can be filed at{" "}
        <a href="https://consumerhelpline.gov.in" rel="noopener noreferrer" target="_blank">
          consumerhelpline.gov.in
        </a>{" "}
        or through the e-daakhil portal of the consumer commissions. Nothing on this page limits any
        right you have under the Consumer Protection Act, 2019.
      </p>
    </PolicyPage>
  );
}
