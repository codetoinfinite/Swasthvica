import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteTaxRatesWorkflow } from "@medusajs/medusa/core-flows";

/** DEV FIXTURE -- removes what _dev-tax.ts created. */
export default async function devTaxClear({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "tax_rate",
    fields: ["id", "code"],
    filters: { code: "DEVHSN" },
  });
  const ids = (data as { id: string }[]).map((r) => r.id);
  if (!ids.length) {
    console.log("no dev tax rate to remove.");
    return;
  }
  await deleteTaxRatesWorkflow(container).run({ input: { ids } });
  console.log(`removed ${ids.length} dev tax rate(s).`);
}
