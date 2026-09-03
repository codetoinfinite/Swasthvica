import { Button } from "@/components/dom/shell/Buttons";
import { signOut } from "@/app/account/actions";

/**
 * A form, not a link.
 *
 * Signing out changes state, and a GET that changes state is one an image tag on another site can
 * fire. A POST from a form is the shape that cannot be triggered by a stray URL. No "use client"
 * either -- a server component posting to a Server Action needs no JavaScript to work at all.
 */
export default function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" weight="quiet">
        Sign out
      </Button>
    </form>
  );
}
