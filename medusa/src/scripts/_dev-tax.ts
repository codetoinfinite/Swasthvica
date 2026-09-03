import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createTaxRatesWorkflow } from "@medusajs/medusa/core-flows";

/** DEV FIXTURE -- delete me. A placeholder GST rate so a cart can be priced locally. */
export default async function devTax({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: regions } = await query.graph({
    entity: "tax_region",
    fields: ["id"],
    filters: { country_code: "in" },
  });
  const regionId = (regions as { id: string }[])[0].id;

  const { data: products } = await query.graph({ entity: "product", fields: ["id", "handle"] });
  const ids = (products as { id: string }[]).map((p) => p.id);

  await createTaxRatesWorkflow(container).run({
    input: [
      {
        tax_region_id: regionId,
        code: "DEVHSN",
        rate: 18,
        name: "DEV placeholder GST 18%",
        rules: ids.map((reference_id) => ({ reference: "product", reference_id })),
      },
    ],
  });
  console.log(`dev tax rate created over ${ids.length} product(s).`);
}
