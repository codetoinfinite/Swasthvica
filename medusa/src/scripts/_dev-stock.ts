import { readFileSync } from "node:fs";
import path from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Opening stock for a development database.
 *
 * The quantity is per SKU rather than one blanket number, because `src/data/catalogue.json` marks
 * three of the five bottles "soon" and `check:catalogue` fails the build when a "soon" SKU holds
 * stock -- a bottle the page describes as not yet available but the cart will happily sell is a
 * customer charged for something that cannot ship. An earlier version of this script set 25 on
 * every level and put that failure into the database itself, so the rule now lives here: what the
 * storefront calls unavailable is stocked at zero.
 */

/** Units given to a SKU the storefront is selling. Enough to test a cart, small enough to notice. */
const DEV_QUANTITY = 25;

type CatalogueProduct = { handle: string; sku: string; status: "live" | "soon" };

export default async function devStock({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const catalogue: { products: CatalogueProduct[] } = JSON.parse(
    readFileSync(path.join(__dirname, "..", "data", "catalogue.json"), "utf8"),
  );
  const soon = new Set(catalogue.products.filter((p) => p.status === "soon").map((p) => p.sku));

  const { data } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id", "location_id", "inventory_item.sku"],
  });

  type Level = { inventory_item_id: string; location_id: string; inventory_item?: { sku: string } };
  const updates = (data as unknown as Level[]).map((level) => ({
    inventory_item_id: level.inventory_item_id,
    location_id: level.location_id,
    // An inventory item with no SKU is not one of the catalogue's, so it gets the live quantity
    // rather than being silently zeroed.
    stocked_quantity: soon.has(level.inventory_item?.sku ?? "") ? 0 : DEV_QUANTITY,
  }));

  await updateInventoryLevelsWorkflow(container).run({ input: { updates } });

  const zeroed = updates.filter((u) => u.stocked_quantity === 0).length;
  logger.info(
    `dev stock: ${updates.length - zeroed} level(s) at ${DEV_QUANTITY}, ${zeroed} at 0 ("soon").`,
  );
}
