import type {
  ItemTaxCalculationLine,
  ItemTaxLineDTO,
  ShippingTaxCalculationLine,
  ShippingTaxLineDTO,
  TaxCalculationContext,
  TaxRateDTO,
} from "@medusajs/framework/types";
import IndiaGstProvider from "../service";
import { STATES, matchState } from "../states";

/**
 * The provider decides one thing -- which heads a rate is charged under -- and everything below
 * checks either that decision or a way of refusing to make it. There is no database here on
 * purpose: the tax module resolves the rates and passes them in, so the whole class is testable
 * with `new`.
 *
 * ORIGIN is fixed rather than read from the environment. The real GST_ORIGIN_STATE is blocked on
 * the client (docs/BACKEND-PLAN.md 17.3), and a test that skipped itself when it was unset would
 * be a test that never ran.
 */
const ORIGIN = "Uttar Pradesh";

/** A tax_rate row as the tax module hands it over. Only four of its fields are ever read. */
const rate = (percent: number | null, hsn: string | null = "3305"): TaxRateDTO =>
  ({
    id: `txr_${hsn}_${percent}`,
    rate: percent,
    code: hsn,
    name: `GST ${percent}% (HSN ${hsn})`,
  }) as TaxRateDTO;

const item = (rates: TaxRateDTO[], id = "li_1"): ItemTaxCalculationLine => ({
  line_item: { id, product_id: `prod_${id}`, quantity: 1, unit_price: 649 },
  rates,
});

const shipping = (rates: TaxRateDTO[] = []): ShippingTaxCalculationLine => ({
  shipping_line: { id: "sm_1", shipping_option_id: "so_1", unit_price: 79 },
  rates,
});

const to = (province: string | null): TaxCalculationContext =>
  ({ address: { country_code: "in", province_code: province } }) as TaxCalculationContext;

/** Defaults to a configured seller; pass `null` for the not-yet-configured one. */
const provider = (originState: string | null = ORIGIN) =>
  new IndiaGstProvider({}, { originState: originState ?? undefined });

type AnyLine = ItemTaxLineDTO | ShippingTaxLineDTO;
const forItem = (lines: AnyLine[]) => lines.filter((l) => "line_item_id" in l);
const forShipping = (lines: AnyLine[]) => lines.filter((l) => "shipping_line_id" in l);

describe("india-gst: the split", () => {
  it("charges CGST and SGST at half each inside the seller's state", async () => {
    const lines = await provider().getTaxLines([item([rate(18)])], [], to(ORIGIN));

    expect(forItem(lines)).toEqual([
      expect.objectContaining({ code: "CGST", name: "CGST 9%", rate: 9, line_item_id: "li_1" }),
      expect.objectContaining({ code: "SGST", name: "SGST 9%", rate: 9, line_item_id: "li_1" }),
    ]);
  });

  it("charges IGST at the full rate outside it", async () => {
    const lines = await provider().getTaxLines([item([rate(18)])], [], to("Maharashtra"));

    expect(forItem(lines)).toEqual([
      expect.objectContaining({ code: "IGST", name: "IGST 18%", rate: 18, line_item_id: "li_1" }),
    ]);
  });

  it("collects the same total either way", async () => {
    // The totals engine sums every line's rate before it backs tax out of a tax-inclusive price
    // (utils/dist/totals/line-item/index.js), so this sum is the number that actually decides what
    // the customer pays. CGST 9 + SGST 9 and IGST 18 have to agree or the price changes by state.
    const sum = async (province: string) =>
      (await provider().getTaxLines([item([rate(18)])], [], to(province)))
        .filter((l) => "line_item_id" in l)
        .reduce((n, l) => n + l.rate, 0);

    expect(await sum(ORIGIN)).toBe(await sum("Karnataka"));
  });

  it("halves an odd rate rather than rounding it", async () => {
    // GST at 5% is CGST 2.5 + SGST 2.5. Rounding either way would change the price.
    const lines = await provider().getTaxLines([item([rate(5)])], [], to(ORIGIN));

    expect(forItem(lines).map((l) => l.rate)).toEqual([2.5, 2.5]);
  });

  it("carries the HSN through so an invoice can name it", async () => {
    const [line] = await provider().getTaxLines([item([rate(12, "3304")])], [], to("Kerala"));

    expect(line.data).toEqual({ hsn: "3304", gst_rate: 12 });
    expect(line.rate_id).toBe("txr_3304_12");
    expect(line.provider_id).toBe("india-gst");
  });

  it("treats a nil-rated good as taxed at zero, not as unclassified", async () => {
    const lines = await provider().getTaxLines([item([rate(0, "0401")])], [], to(ORIGIN));

    expect(forItem(lines).map((l) => l.rate)).toEqual([0, 0]);
  });

  it("returns nothing when there is nothing to tax", async () => {
    await expect(provider().getTaxLines([], [], to(ORIGIN))).resolves.toEqual([]);
  });
});

describe("india-gst: shipping", () => {
  it("takes the principal supply's rate when the shipping option has none", async () => {
    // Composite supply, CGST Act s.8(a): delivery charged alongside goods is taxed as the goods
    // are. "Principal" here is the highest-rated item in the cart.
    const lines = await provider().getTaxLines(
      [item([rate(12, "3304")], "li_1"), item([rate(18, "3305")], "li_2")],
      [shipping()],
      to("Goa"),
    );

    expect(forShipping(lines)).toEqual([
      expect.objectContaining({ code: "IGST", rate: 18, shipping_line_id: "sm_1" }),
    ]);
  });

  it("prefers a rate set on the shipping option itself", async () => {
    const lines = await provider().getTaxLines(
      [item([rate(18)])],
      [shipping([rate(5, "9965")])],
      to("Goa"),
    );

    expect(forShipping(lines)).toEqual([
      expect.objectContaining({ code: "IGST", rate: 5, shipping_line_id: "sm_1" }),
    ]);
  });

  it("leaves a shipping line alone when there is no principal supply to follow", async () => {
    const lines = await provider().getTaxLines([], [shipping()], to("Goa"));

    expect(lines).toEqual([]);
  });
});

describe("india-gst: refusals", () => {
  it("refuses a product with no rate rather than charging nothing", async () => {
    await expect(provider().getTaxLines([item([])], [], to(ORIGIN))).rejects.toThrow(
      /No GST rate is configured for line item li_1/,
    );
  });

  it("refuses a rate that is not a percentage", async () => {
    await expect(provider().getTaxLines([item([rate(null)])], [], to(ORIGIN))).rejects.toThrow(
      /which is not a percentage/,
    );
    await expect(provider().getTaxLines([item([rate(180)])], [], to(ORIGIN))).rejects.toThrow(
      /which is not a percentage/,
    );
  });

  it("refuses a destination that is not an Indian state", async () => {
    await expect(provider().getTaxLines([item([rate(18)])], [], to("Narnia"))).rejects.toThrow(
      /"Narnia" is not a state GST can be computed for/,
    );
  });

  it("refuses an address with no state at all", async () => {
    await expect(provider().getTaxLines([item([rate(18)])], [], to(null))).rejects.toThrow(
      /A state is required on the delivery address/,
    );
  });

  it("boots without an origin state but refuses to price a cart", async () => {
    // The deliberate asymmetry: GST_ORIGIN_STATE is a client fact, and taking the whole backend
    // down over it would block every other feature. The cost is deferred to the first cart.
    const p = provider(null);

    expect(p.getIdentifier()).toBe("india-gst");
    await expect(p.getTaxLines([item([rate(18)])], [], to(ORIGIN))).rejects.toThrow(
      /GST cannot be computed until the place of supply is known/,
    );
  });

  it("refuses to boot on an origin state it does not recognise", () => {
    // The dangerous case. A misspelling matches no destination, so every order in the country is
    // silently taxed as inter-state and the invoices are wrong until an accountant finds them.
    expect(() => provider("Utter Pradesh")).toThrow(/does not recognise the state/);
    expect(() => IndiaGstProvider.validateOptions({ originState: "UP" })).toThrow(
      /does not recognise the state/,
    );
    expect(() => IndiaGstProvider.validateOptions({})).not.toThrow();
  });
});

describe("india-gst: state matching", () => {
  it("covers all 36 states and union territories", () => {
    expect(STATES).toHaveLength(36);
    expect(new Set(STATES).size).toBe(36);
  });

  it("matches the spellings an admin or an address form actually produces", () => {
    // province_code reaches the provider exactly as the address holds it -- tax-module-service.js
    // passes the un-normalised context through -- so case, "&" and stray punctuation all arrive.
    expect(matchState("jammu & kashmir")).toBe("Jammu and Kashmir");
    expect(matchState("TAMIL NADU")).toBe("Tamil Nadu");
    expect(matchState("  uttar  pradesh ")).toBe("Uttar Pradesh");
    expect(matchState("Uttarakhand")).toBe("Uttarakhand");
    expect(matchState("Uttar Pradesh West")).toBeUndefined();
    expect(matchState("")).toBeUndefined();
    expect(matchState(null)).toBeUndefined();
  });

  it("does not confuse two states that share a prefix", async () => {
    const p = provider("Uttarakhand");
    const lines = await p.getTaxLines([item([rate(18)])], [], to("Uttar Pradesh"));

    expect(forItem(lines).map((l) => l.code)).toEqual(["IGST"]);
  });
});
