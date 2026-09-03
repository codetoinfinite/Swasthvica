import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";

export default async function devStock({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id", "stocked_quantity"],
  });
  const updates = (data as { inventory_item_id: string; location_id: string }[]).map((l) => ({
    inventory_item_id: l.inventory_item_id,
    location_id: l.location_id,
    stocked_quantity: 25,
  }));
  await updateInventoryLevelsWorkflow(container).run({ input: { updates } });
  console.log(`dev stock set on ${updates.length} level(s).`);
}
