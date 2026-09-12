/* ------------------------------------------------------------------------------------------------
 * What a subscriber hands a template.
 *
 * These are deliberately flat and already-resolved: a subscriber does the querying, a template does
 * the wording. Nothing here is a Medusa DTO, because a template that took an OrderDTO would quietly
 * depend on which `fields` the subscriber happened to ask for, and the failure would be a blank
 * line in a customer's receipt rather than a type error.
 *
 * Every field that the store may not know is `null` rather than absent. `null` is a case a template
 * has to answer for; an absent key is one it forgets about.
 * ---------------------------------------------------------------------------------------------- */

/** One line of an order, as the customer reads it. Amounts are decimal major units. */
export type OrderLine = {
  title: string;
  /** Variant title, when it says something the product title does not. */
  variant: string | null;
  quantity: number;
  /** Line total after line-level discount, in major units. */
  total: number;
};

/** A delivery address. Any field the customer left blank is `null`. */
export type Address = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
};

/** The two identifiers every order e-mail carries. */
type OrderHead = {
  /**
   * What the customer quotes. The storefront's own reference (`SV260901-K3M7Q`, stored in
   * `order.metadata.draft_ref`) when there is one, because that is the string /track accepts;
   * `#12` from `display_id` otherwise.
   */
  reference: string;
  placedAt: string | null;
  customerName: string | null;
};

export type OrderPlacedData = OrderHead & {
  currency: string;
  lines: OrderLine[];
  subtotal: number;
  /** Positive number, subtracted in the totals block. Zero when nothing was applied. */
  discount: number;
  discountCode: string | null;
  shipping: number;
  tax: number;
  total: number;
  address: Address | null;
};

export type OrderShippedData = OrderHead & {
  /** Courier name when the fulfilment provider reported one. */
  courier: string | null;
  trackingNumbers: string[];
  trackingUrl: string | null;
  lines: OrderLine[];
};

export type OrderDeliveredData = OrderHead & {
  deliveredAt: string | null;
};

export type OrderCanceledData = OrderHead & {
  currency: string;
  /** What was paid, when anything was. `null` for an order cancelled before capture. */
  paid: number | null;
};

export type OrderRefundedData = OrderHead & {
  currency: string;
  amount: number;
  /** True when the refund covers the whole order, which changes the wording. */
  full: boolean;
};

export type PasswordResetData = {
  email: string;
  /** Absolute storefront URL carrying the token. Built by the subscriber, never by the template. */
  url: string;
};

export type OrderTransferRequestedData = OrderHead & {
  /** The uuid from the order-change action. Typed into /account/claim, not clicked. */
  code: string;
  /** The order id the claim form asks for alongside the code. */
  orderId: string;
};

/** Every template renders to the same three strings. */
export type Rendered = {
  subject: string;
  html: string;
  text: string;
};

/** A template is a subject line and two bodies over one data shape. */
export type Template<T> = {
  subject: (data: T) => string;
  html: (data: T) => string;
  text: (data: T) => string;
};
