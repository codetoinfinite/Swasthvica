"use client";
import { useActionState, useEffect, useState } from "react";
import { Field, SelectField } from "@/components/dom/checkout/Field";
import { Button } from "@/components/dom/shell/Buttons";
import { Notice, Submit } from "@/components/dom/account/Form";
import { removeAddress, saveAddress } from "@/app/account/actions";
import type { Address } from "@/lib/account";
import { STATES } from "@/lib/order";

/**
 * The address book.
 *
 * One card per saved address, each opening into the same form the checkout uses, and one more form
 * at the bottom for a new one. The list itself is rendered on the server and arrives as a prop --
 * this component owns nothing but which card is open, so a saved address survives a reload without
 * any client state to reconcile.
 *
 * Every form is its own <form> with its own action state. Sharing one would mean an error on the
 * new-address form appearing above the card somebody was editing.
 */
export default function AddressBook({ addresses }: { addresses: Address[] }) {
  const [open, setOpen] = useState<string | null>(addresses.length === 0 ? "new" : null);

  return (
    <div className="not-prose space-y-5">
      {addresses.map((address) => (
        <Card
          key={address.id}
          address={address}
          open={open === address.id}
          onToggle={() => setOpen(open === address.id ? null : address.id)}
        />
      ))}

      {open === "new" ? (
        <section className="rounded-xl border border-brass-600/25 bg-olive-900/40 p-6 sm:p-8">
          <h3 className="mb-6 font-display text-xl text-cream-50">A new address</h3>
          <AddressForm onDone={() => setOpen(null)} />
        </section>
      ) : (
        <Button weight="outline" onClick={() => setOpen("new")}>
          Add an address
        </Button>
      )}
    </div>
  );
}

function Card({
  address,
  open,
  onToggle,
}: {
  address: Address;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-xl border border-brass-600/25 bg-olive-900/40 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="caps-gold text-[11px]">
            {address.address_name || "Delivery address"}
            {address.is_default_shipping && <span className="ml-3 text-cream-300/60">Default</span>}
          </p>
          <address className="mt-3 text-sm leading-relaxed text-cream-200/80 not-italic">
            {[address.first_name, address.last_name].filter(Boolean).join(" ")}
            <br />
            {lines(address).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-[11px] tracking-[0.18em] text-brass-300 uppercase hover:text-brass-200"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-8 border-t border-olive-700/60 pt-8">
          <AddressForm address={address} onDone={onToggle} />
          <DeleteForm id={address.id} />
        </div>
      )}
    </section>
  );
}

function AddressForm({ address, onDone }: { address?: Address; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveAddress, undefined);

  // Closing on success is the whole reason this reads the state rather than firing and forgetting:
  // a card that stays open after "Saved." looks like it did not save. In an effect, not in render:
  // `onDone` sets state in the parent, and doing that while this component renders is the classic
  // "cannot update a component while rendering a different component" warning.
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const landmark = typeof address?.metadata?.landmark === "string" ? address.metadata.landmark : "";

  return (
    <form action={action} noValidate>
      <Notice state={state} />
      {address && <input type="hidden" name="id" value={address.id} />}
      <div className="grid gap-x-5 sm:grid-cols-2">
        <Field
          label="Label"
          name="label"
          defaultValue={address?.address_name ?? ""}
          placeholder="Home"
          hint="Optional — how you recognise this one."
        />
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          required
          defaultValue={address?.first_name ?? ""}
        />
        <div className="sm:col-span-2">
          <Field
            label="Flat, building, street"
            name="line1"
            autoComplete="address-line1"
            required
            defaultValue={address?.address_1 ?? ""}
          />
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Area, colony"
            name="line2"
            autoComplete="address-line2"
            defaultValue={address?.address_2 ?? ""}
          />
        </div>
        <Field label="Landmark" name="landmark" defaultValue={landmark} />
        <Field
          label="Town or city"
          name="city"
          autoComplete="address-level2"
          required
          defaultValue={address?.city ?? ""}
        />
        <SelectField
          label="State"
          name="state"
          options={STATES}
          required
          defaultValue={address?.province ?? ""}
        />
        <Field
          label="PIN code"
          name="pin"
          inputMode="numeric"
          maxLength={6}
          autoComplete="postal-code"
          required
          defaultValue={address?.postal_code ?? ""}
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          autoComplete="tel-national"
          defaultValue={(address?.phone ?? "").replace(/^\+91/, "")}
          hint="The courier calls this number before delivering."
        />
      </div>

      <label className="mt-2 flex items-center gap-3 text-sm text-cream-200/80">
        <input
          type="checkbox"
          name="default"
          defaultChecked={address?.is_default_shipping ?? false}
          className="size-4 accent-brass-500"
        />
        Use this address by default
      </label>

      <div className="mt-7 flex flex-wrap gap-3">
        <Submit pending={pending}>{address ? "Save changes" : "Save address"}</Submit>
        <Button type="button" weight="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Removal is a second form rather than a button inside the first.
 *
 * Nesting it would submit the address fields along with the delete, and a validation error on a
 * field nobody touched would block a removal.
 */
function DeleteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(removeAddress, undefined);
  return (
    <form action={action} className="mt-8 border-t border-olive-700/60 pt-6">
      <input type="hidden" name="id" value={id} />
      <Notice state={state} />
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] tracking-[0.18em] text-amber-200/70 uppercase hover:text-amber-200 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove this address"}
      </button>
    </form>
  );
}

/** The postal lines, in the order India Post reads them, with the empty ones dropped. */
function lines(address: Address): string[] {
  const town = [address.city, address.province].filter(Boolean).join(", ");
  return [
    address.address_1,
    address.address_2,
    typeof address.metadata?.landmark === "string" ? `Near ${address.metadata.landmark}` : null,
    town,
    address.postal_code,
    address.phone,
  ].filter((line): line is string => Boolean(line));
}
