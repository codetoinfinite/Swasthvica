import { MedusaError } from "@medusajs/framework/utils";
import type {
  ItemTaxCalculationLine,
  ItemTaxLineDTO,
  ShippingTaxCalculationLine,
  ShippingTaxLineDTO,
  TaxCalculationContext,
  TaxRateDTO,
} from "@medusajs/framework/types";
import { STATES, canonicalState, matchState } from "./states";

/**
 * Indian GST, split into the heads a tax invoice has to show.
 *
 * WHERE THE NUMBERS COME FROM, AND WHERE THEY DO NOT
 *
 * This provider invents nothing. Every rate is a `tax_rate` row in the database, linked to a
 * product by a `tax_rate_rule`, seeded from medusa/src/data/gst.json -- which ships empty, because
 * HSN classification and the rate that follows from it are the client's CA's call and a guessed
 * one would be a wrong tax invoice (docs/BACKEND-PLAN.md 17.2). The tax module resolves those rows
 * before this file is reached: `getTaxLines` on a `TaxModuleService` batches the rules by
 * `reference: "product"`, prioritises the matches and hands each line its applicable rates
 * (tax/dist/services/tax-module-service.js, `getTaxRatesForItem`). So `rates[0].rate` here is the
 * total GST percentage somebody typed into the admin, and `rates[0].code` is the HSN it was
 * classified under.
 *
 * The only thing this provider decides is which heads that total is charged under:
 *
 *   destination state === seller's state  ->  CGST at rate/2 + SGST at rate/2
 *   destination state !== seller's state  ->  IGST at rate
 *
 * That split is arithmetic, not policy: the customer pays the same total either way. It exists
 * because the invoice has to name the heads, and because the built-in `system` provider cannot
 * emit two sibling lines for one rate -- it returns one line per matched rate, and the module hands
 * it at most two rates of which the second must be the first's parent region.
 *
 * A NOTE ON TAX-INCLUSIVE PRICES. Every price in this store is a tax-inclusive MRP (seed.ts sets
 * `is_tax_inclusive` on both the region and the currency preference). The totals engine sums the
 * rates of all tax lines on an item before it backs the tax out of the price --
 * `getLineItemTotals` in utils/dist/totals/line-item/index.js divides by `1 + sum(rates)/100` --
 * so CGST 9 + SGST 9 and IGST 18 produce the identical subtotal, and each head still carries its
 * own `total` for the invoice. Splitting is safe precisely because that sum is taken first.
 */

export type IndiaGstOptions = {
  /**
   * The seller's state, spelled as one of the 36 names in ./states.ts.
   *
   * Optional at boot and required at checkout, which is not a contradiction: it is the client's
   * registered place of supply and nobody here can invent it (docs/BACKEND-PLAN.md 17.3). Making
   * it a boot requirement would take the whole backend down over a fact that only matters once a
   * customer has an address, so the absence is carried to the first cart that needs it and
   * refused there.
   */
  originState?: string;
};

/**
 * A rate as this provider needs it: the percentage, the HSN it came from, and the row it came from
 * if there was one. Shipping charged as part of a composite supply has no row of its own.
 */
type ResolvedRate = { percent: number; hsn: string | null; rateId?: string };

export default class IndiaGstProvider {
  static identifier = "india-gst";

  /**
   * Runs at boot, before the provider is constructed, from
   * modules-sdk/dist/loaders/module-provider-loader.js. A *misspelled* origin state is the worst
   * failure this provider has: it matches no destination, so every order in the country is taxed
   * as inter-state IGST and nobody notices until an accountant does. Refusing to start is the
   * cheaper outcome. An *absent* one is a different thing -- see `IndiaGstOptions`.
   */
  static validateOptions(options: unknown): void {
    const originState = (options as IndiaGstOptions | undefined)?.originState;
    // Unset is a known, reported gap and is handled at checkout. Set-but-wrong is the case
    // worth dying over.
    if (!originState) return;
    if (!matchState(originState)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        `india-gst does not recognise the state "${originState}". It must be one of the 36 states ` +
          `and union territories the storefront offers, spelled as they are there: ` +
          `${STATES.join(", ")}.`,
      );
    }
  }

  private readonly origin: string | null;

  constructor(_cradle: unknown, options: IndiaGstOptions) {
    IndiaGstProvider.validateOptions(options);
    const state = matchState(options?.originState);
    this.origin = state ? canonicalState(state) : null;
  }

  getIdentifier(): string {
    return IndiaGstProvider.identifier;
  }

  async getTaxLines(
    itemLines: ItemTaxCalculationLine[],
    shippingLines: ShippingTaxCalculationLine[],
    context: TaxCalculationContext,
  ): Promise<(ItemTaxLineDTO | ShippingTaxLineDTO)[]> {
    if (!itemLines.length && !shippingLines.length) return [];

    const intraState = this.isIntraState(context);
    const lines: (ItemTaxLineDTO | ShippingTaxLineDTO)[] = [];

    // The principal supply, for the composite-supply rule below. Carried as the highest-rated item
    // in this call rather than the largest by value: with one rate per HSN they coincide in every
    // cart this store can build, and the higher rate is the safe direction to be wrong in.
    let principal: ResolvedRate | undefined;

    for (const line of itemLines) {
      const rate = this.resolve(
        line.rates,
        `line item ${line.line_item.id} (product ${line.line_item.product_id})`,
      );
      if (!principal || rate.percent > principal.percent) principal = rate;

      for (const head of this.heads(rate, intraState)) {
        lines.push({ ...head, line_item_id: line.line_item.id });
      }
    }

    for (const line of shippingLines) {
      // Delivery charged alongside goods is part of a composite supply and takes the rate of the
      // principal supply (CGST Act s.8(a)), so an unmapped shipping option is not an error the way
      // an unmapped product is -- it is the normal case. A shipping option with a tax rate rule of
      // its own still wins, because somebody set it deliberately.
      const rate = line.rates.length
        ? this.resolve(line.rates, `shipping option ${line.shipping_line.shipping_option_id}`)
        : principal;

      // Nothing to be principal to. A shipping-only tax calculation is not something the four
      // workflows that reach this provider produce, and inventing a rate for one would be worse
      // than leaving the line untaxed for the moment.
      if (!rate) continue;

      for (const head of this.heads(rate, intraState)) {
        lines.push({ ...head, shipping_line_id: line.shipping_line.id });
      }
    }

    return lines;
  }

  /**
   * Whether the place of supply is the state we invoice from.
   *
   * `province_code` arrives exactly as the customer's address holds it -- tax-module-service.js
   * passes the un-normalised `calculationContext` to the provider, not the lower-cased copy it
   * used for its own region lookup -- so it is matched against the closed list rather than
   * compared as a string.
   */
  private isIntraState(context: TaxCalculationContext): boolean {
    if (!this.origin) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "GST cannot be computed until the place of supply is known. Set GST_ORIGIN_STATE to the " +
          "state the business is registered in and restart.",
      );
    }
    const province = context.address?.province_code;
    const state = matchState(province);
    if (!state) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        province
          ? `"${province}" is not a state GST can be computed for. Choose one of the 36 states or ` +
              `union territories.`
          : "A state is required on the delivery address before GST can be computed.",
      );
    }
    return canonicalState(state) === this.origin;
  }

  /**
   * The one rate that applies, or a loud failure.
   *
   * An unclassified product reaching checkout means gst.json is missing an entry or the seed has
   * not been re-run. Charging nothing would put the shortfall on the seller and produce an invoice
   * that cannot be filed, so this stops the cart instead. `rate: 0` is a real answer -- a nil-rated
   * good -- and is not treated as missing; an empty `rates` array is what missing looks like.
   */
  private resolve(rates: TaxRateDTO[], what: string): ResolvedRate {
    const rate = rates[0];
    if (!rate) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `No GST rate is configured for ${what}. Add its HSN and rate to medusa/src/data/gst.json ` +
          `and run \`npm run seed:gst\`, or set the rate in Settings -> Tax Regions in the admin.`,
      );
    }
    if (rate.rate === null || rate.rate < 0 || rate.rate > 100) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The GST rate on "${rate.name}" is ${rate.rate}, which is not a percentage.`,
      );
    }
    return { percent: rate.rate, hsn: rate.code, rateId: rate.id };
  }

  /** One rate as the one or two heads a tax invoice shows it under. */
  private heads(rate: ResolvedRate, intraState: boolean) {
    const shared = {
      rate_id: rate.rateId,
      provider_id: this.getIdentifier(),
      data: { hsn: rate.hsn, gst_rate: rate.percent },
    };
    if (!intraState) {
      return [{ ...shared, code: "IGST", name: `IGST ${rate.percent}%`, rate: rate.percent }];
    }
    const half = rate.percent / 2;
    return [
      { ...shared, code: "CGST", name: `CGST ${half}%`, rate: half },
      { ...shared, code: "SGST", name: `SGST ${half}%`, rate: half },
    ];
  }
}
