/**
 * Every real-world fact the site is legally obliged to publish, in one file.
 *
 * It exists because these facts are not design decisions and not copy: they are the registered
 * particulars of a company, they have to agree with each other across a dozen pages, and they have
 * to agree with what was typed into Razorpay's KYC form. Scattering them through JSX guarantees
 * the phone number in the footer drifts from the phone number in the shipping policy, and a
 * reviewer who finds two different addresses on one site stops reading.
 *
 * WHAT THE CLIENT HAS TO DO: replace every TBC(...) below with the real value. Nothing else in the
 * repo needs to change. Anything still unfilled renders on the page inside a loud amber marker, so
 * walking the site is the checklist -- there is no separate document to keep in sync, and nothing
 * is silently invented. A fabricated CIN or a placeholder address is worse than an obvious gap:
 * one is a Companies Act default and a rejected KYC, the other is a five-minute edit.
 *
 * Sources for why each field is here are cited on the field.
 */

/** Marker for a fact only the client can supply. `Fact` renders these visibly, never silently. */
const TBC = (what: string) => `[TO BE CONFIRMED — ${what}]`;

export const PENDING_RE = /\[TO BE CONFIRMED — [^\]]*\]/g;
export const isPending = (v: string) => v.includes("[TO BE CONFIRMED");

export type Address = {
  lines: string[];
  city: string;
  state: string;
  pin: string;
  country: string;
};

/**
 * wa.me is the only WhatsApp deep link that works from a desktop browser as well as a phone, and it
 * takes the number with no plus and no separators. The label puts them back, because a support
 * number is also read aloud and copied by hand.
 */
export const whatsappHref = (n: string) => `https://wa.me/${n}`;
export const formatWhatsApp = (n: string) =>
  /^91\d{10}$/.test(n) ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : `+${n}`;

export const formatAddress = (a: Address) =>
  [...a.lines, `${a.city}, ${a.state} ${a.pin}`, a.country].filter(Boolean).join(", ");

/**
 * The brand as it is set on the bottle, and the entity that actually contracts with the customer.
 * These are different strings and the law cares about the second one: Consumer Protection
 * (E-Commerce) Rules 2020 r.4(2)(a) requires the *legal* name, and Razorpay's KYC fails on any
 * mismatch between the PAN name, the bank account name and the GST legal name.
 *
 * NOTE FOR THE CLIENT: the brand is spelled three ways across this project -- "Swasthvica" on the
 * bottle and in the nav, "Swasthhvica" on the poster, `swasthavic` as the repo directory. Pick one,
 * register it, and set it here and in NEXT_PUBLIC_SITE_URL. Everything on the site reads from here.
 */
export const BRAND = "Swasthvica";
export const LEGAL_NAME = TBC("registered legal entity name, exactly as on the PAN card");

/** "Private Limited" | "LLP" | "Partnership" | "Sole Proprietorship" -- decides which ID applies. */
export const LEGAL_FORM = TBC("legal form of the business");

/**
 * Companies Act 2013 s.12(3)(c): a company must print its name, registered office address and CIN,
 * with telephone, e-mail and website, on all official publications. Default is Rs.1,000 per day,
 * capped at Rs.1,00,000, on the company and on every officer in default. An LLP carries an LLPIN
 * instead; a proprietorship has neither -- leave it empty and the footer omits the line.
 */
export const CIN = TBC("CIN (or LLPIN). Leave empty if a proprietorship");

/**
 * No statute requires the GSTIN on a website -- CGST r.18 covers the name board at the premises.
 * It is here because it lets a payment-gateway reviewer cross-check the entity against the PAN and
 * the bank account in one glance, which is exactly the check that stalls activations.
 */
export const GSTIN = TBC("GSTIN. Leave empty if not registered");

/** CP(E-Commerce) Rules 2020 r.4(2)(b) -- headquarters *and all branches*. A PO box will not do. */
export const REGISTERED_ADDRESS: Address = {
  lines: [TBC("registered office, building and street")],
  city: TBC("city"),
  state: TBC("state"),
  pin: TBC("PIN"),
  country: "India",
};

/** Where orders are actually picked and packed, if that is not the registered office. */
export const OPERATIONS_ADDRESS: Address | null = null;

/** CP(E-Commerce) Rules 2020 r.4(2)(d) -- customer care contact details. */
export const SUPPORT = {
  email: TBC("customer care e-mail on the brand's own domain"),
  phone: TBC("customer care phone, with country code"),
  /** State the window. An unanswered number reads worse than a stated one. */
  hours: "Monday to Saturday, 10:00 – 18:00 IST",
  /**
   * Optional, and empty on purpose rather than TBC: nothing obliges the business to run a WhatsApp
   * line, so an unfilled one is not a gap in the legal particulars and does not earn an amber
   * marker. Every place that uses it checks first and omits the row when it is blank.
   *
   * Worth filling all the same. In India this is where a customer who will not send an e-mail asks
   * "has it shipped", and the answer arriving in the thread they already live in is the difference
   * between a refund request and a reorder. Digits only, with the country code and no plus, no
   * spaces and no dashes -- that is the format wa.me takes, e.g. "919812345678". A WhatsApp
   * Business account is free; the number must be one that can receive an SMS to register, and it
   * cannot be the same handset already running a personal WhatsApp on that number.
   */
  whatsapp: "",
};

/**
 * CP(E-Commerce) Rules 2020 r.4(4): a grievance officer must be appointed and their name and
 * contact details published. r.4(5) sets the clock -- acknowledge in 48 hours, resolve in one
 * month. Those are the numbers on /grievance; do not substitute the 24-hour/15-day pair, which
 * belongs to the IT Intermediary Rules 2021 and does not bind a first-party seller.
 *
 * SPDI Rules 2011 r.5(9) separately requires a grievance officer for *data* complaints. One person
 * may hold both roles; the site names them in both places either way.
 */
export const GRIEVANCE_OFFICER = {
  name: TBC("grievance officer's full name"),
  designation: TBC("designation"),
  email: TBC("grievance officer's e-mail"),
  phone: TBC("grievance officer's phone"),
  address: REGISTERED_ADDRESS,
};

/** DPDP Rules 2025 r.9 also wants a named human who can answer data-processing questions. */
export const DATA_PROTECTION_OFFICER = GRIEVANCE_OFFICER;

/**
 * CP(E-Commerce) Rules 2020 r.7(1)(c) requires the payment service provider to be named on the
 * site, with its contact information. This is the PSP's own registered identity, not the brand's.
 */
export const PSP = {
  name: "Razorpay Software Private Limited",
  address: "1st Floor, SJR Cyber, 22 Laskar Hosur Road, Adugodi, Bengaluru, Karnataka 560030",
  email: "support@razorpay.com",
  url: "https://razorpay.com",
};

/**
 * The commercial terms. Every one of these is read back by a reviewer against the policy pages and
 * against the "average delivery time" field in the Razorpay dashboard, so they live in one place
 * and the pages quote them rather than restating them. Vague wording here -- "at our discretion",
 * "as soon as possible" -- is a named rejection trigger, which is why these are numbers.
 */
export const TERMS = {
  dispatchDays: "2 business days",
  deliveryMetro: "3 – 5 business days",
  deliveryRest: "5 – 8 business days",
  deliveryRemote: "8 – 12 business days",
  /** Must equal the figure entered in Razorpay's "average delivery time after receiving an order". */
  averageDeliveryDays: 6,
  shippingFlat: 79,
  freeShippingAbove: 999,
  codAvailable: false,
  returnWindowDays: 7,
  refundDays: "5 – 7 business days",
  courier: TBC("courier partner name(s)"),
  /** Named city whose courts have exclusive jurisdiction. Usually where the office is registered. */
  jurisdiction: TBC("city of exclusive jurisdiction"),
};

/**
 * Manufacturing licences. A shampoo or a hair oil sold on cosmetic claims is licensed under the
 * Cosmetics Rules 2020 in Form COS-8 -- not Form 25D, and not Form 32, whose Part XIV of the Drugs
 * Rules 1945 was repealed by those Rules. Form 25D is the ayurvedic-drug route and only applies if
 * an ingestible is positioned as an ayurvedic medicine, which is a decision with consequences all
 * the way through the copy. See /disclaimer.
 */
export const LICENCES = {
  cosmeticFormCos8: TBC("cosmetic manufacturing licence no. (Form COS-8 or COS-9 loan licence)"),
  manufacturerName: TBC("licensed manufacturer's name"),
  manufacturerAddress: TBC("licensed manufacturer's full address"),
  /** Only if an ingestible ships as a food or supplement. */
  fssai: TBC("FSSAI licence no., if any ingestible is licensed as a food or supplement"),
  /** Only if an ingestible is positioned as an ayurvedic medicine. */
  ayushFormD25: "",
};

export const SOCIAL: string[] = [];

/** Shown on every policy page. Bump it when a policy actually changes, not on every deploy. */
export const POLICY_UPDATED = "23 August 2026";
export const FOUNDING_YEAR = 2026;

/**
 * Every third party that touches customer data, and what it touches it for.
 *
 * Rule 4(ii) of the SPDI Rules requires the recipients to be disclosed, and rule 15 of the DPDP
 * Rules requires the same for anything that leaves India. A category ("our logistics partners") is
 * not a disclosure -- name the company. Anything added to the stack goes in this array first and
 * appears on /privacy and /cookies automatically.
 *
 * `local` false means data crosses a border and the row has to say where to.
 */
export type Processor = { name: string; purpose: string; where: string; local: boolean };

export const PROCESSORS: Processor[] = [
  {
    name: PSP.name,
    purpose:
      "Taking payment, verifying it, and processing refunds. They receive your name, e-mail, phone and the amount; they, not we, handle the card or UPI details.",
    where: "India",
    local: true,
  },
  {
    name: TBC("courier partner name(s)"),
    purpose:
      "Delivering the parcel. They receive the delivery name, full address, pin code and phone number, because a parcel cannot be handed over without them.",
    where: "India",
    local: true,
  },
  {
    name: TBC("transactional e-mail / SMS provider, e.g. Amazon SES, Resend, MSG91"),
    purpose:
      "Sending order confirmations, dispatch notices and replies to support tickets. They receive your name, e-mail address and phone number.",
    where: TBC("country where that provider stores the data"),
    local: false,
  },
  {
    name: TBC("hosting provider, e.g. Vercel, AWS Mumbai"),
    purpose:
      "Serving this website. Their servers process the ordinary request data every website receives — IP address, browser type, the page requested and when.",
    where: TBC("hosting region"),
    local: false,
  },
];

/**
 * What this site actually stores on the device, verified against the code rather than copied from a
 * template. Not one of the first-party rows is a cookie: two are localStorage and one is
 * sessionStorage, which is why the "kind" column exists and says so. There is no analytics script,
 * no tag manager and no advertising pixel in the bundle -- src/lib/analytics.ts shapes the events
 * and holds them in memory, and nothing is written or sent anywhere. Grep the repo before adding a
 * row that says otherwise, and add a row here before adding anything that writes to the device.
 */
export const STORAGE = [
  {
    name: "swasthvica-cart",
    kind: "Local storage",
    category: "Strictly necessary",
    purpose:
      "Remembers what you put in the basket so it is still there if you close the tab. It holds product codes and quantities. Nothing in it identifies you.",
    life: "Until you clear it, or clear your browser's site data.",
    party: "Set by this site",
  },
  {
    name: "swasthvica-consent",
    kind: "Local storage",
    category: "Strictly necessary",
    purpose:
      "Remembers the answer you gave to the cookie notice, so you are not asked again on every page. It holds two yes/no values and the date you answered.",
    life: "Until you change or withdraw the choice on this page, or clear your browser's site data.",
    party: "Set by this site",
  },
  {
    name: "swasthvica-order",
    kind: "Session storage",
    category: "Strictly necessary",
    purpose:
      "Carries the order you just placed from the checkout screen to the confirmation screen. It holds the delivery details you typed and what you ordered.",
    life: "Until the browser tab is closed.",
    party: "Set by this site",
  },
  {
    name: "Razorpay checkout",
    kind: "Cookies",
    category: "Strictly necessary",
    purpose:
      "Set by the payment provider when the checkout window opens, to keep the payment session together and to detect fraud. They are not set while you browse.",
    life: "Session, and as set out in the provider's own policy.",
    party: `Set by ${PSP.name}`,
  },
];
