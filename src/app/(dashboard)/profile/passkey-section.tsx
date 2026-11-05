"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { PASSKEY_NAME_MAX, REAUTH_HINT } from "@/lib/auth/second-factor";
import { confirmPasswordForPasskey } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { Fingerprint, Plus } from "lucide-react";

export type PasskeyRow = { id: string; label: string; added: string | null };
/** A passkey change; `rowId` shows its password step in that passkey's row. */
type Action = {
  label: string;
  submit: string;
  rowId?: string;
  run: () => Promise<unknown>;
};

const removeWarning = (pk: PasskeyRow) =>
  `You can't sign in with "${pk.label}" anymore, and you're signed out on all other devices.`;

/** Passkeys: add (browser/OS dialog), rename, remove. Labels are resolved on the server. */
export function PasskeySection({
  passkeys,
  userHasPassword,
}: {
  passkeys: PasskeyRow[];
  userHasPassword: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  // Adding or removing a passkey needs the password first (users who have one).
  const [confirm, setConfirm] = useState<(Action & { password: string }) | null>(null);

  const addAction: Action = {
    label: "Add a passkey",
    submit: "Continue",
    run: () => call(() => authClient.passkey.addPasskey(), "Passkey added", "Failed to add passkey"),
  };
  const removeAction = (pk: PasskeyRow): Action => ({
    label: `${removeWarning(pk)} Enter your password to remove it.`,
    submit: "Remove",
    rowId: pk.id,
    run: () =>
      call(
        () => authClient.passkey.deletePasskey({ id: pk.id }),
        "Passkey removed",
        "Failed to remove passkey",
      ),
  });

  function start(action: Action) {
    if (userHasPassword) setConfirm({ ...action, password: "" });
    else action.run();
  }

  async function confirmAndRun(c: Action & { password: string }) {
    setBusy(true);
    const res = await confirmPasswordForPasskey(c.password);
    setBusy(false);
    if (!res.ok) {
      toast.error(
        res.reason === "rate_limited"
          ? `Too many attempts. Try again in ${res.retryAfterSec} seconds.`
          : "Wrong password",
      );
      return;
    }
    setConfirm(null);
    await c.run();
  }

  const passwordForm = (c: Action & { password: string }) => (
    <form
      className="min-w-0 flex-1 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        confirmAndRun(c);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="passkey-password" className="leading-snug font-normal">
          {c.label}
        </Label>
        <Input
          id="passkey-password"
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          autoFocus
          required
          disabled={busy}
          value={c.password}
          onChange={(e) => setConfirm({ ...c, password: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirm(null);
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant={c.rowId ? "destructive" : "default"}
          disabled={busy || !c.password}
        >
          {c.submit}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );

  async function call(
    fn: () => Promise<{ error: unknown } | null | undefined>,
    success: string,
    fallback: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.error) {
        showError(res.error, fallback);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Sign in with your fingerprint, face, or a security key and its PIN, no
          password needed. Once you have one, signing in with a password or
          Google/GitHub also asks for it (or for the authenticator app).
          {passkeys.length === 1 &&
            " Add a second passkey or the authenticator app too, so losing this device doesn't lock you out."}
          {!userHasPassword && ` ${REAUTH_HINT}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {passkeys.length > 0 && (
          <ul className="divide-y rounded-md border">
            {passkeys.map((pk) => (
              <li key={pk.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                {confirm?.rowId === pk.id ? (
                  passwordForm(confirm)
                ) : editing?.id === pk.id ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await call(
                        () => authClient.passkey.updatePasskey({ id: pk.id, name: editing.name.trim() }),
                        "Passkey renamed",
                        "Failed to rename passkey",
                      );
                      if (ok) setEditing(null);
                    }}
                  >
                    <Input
                      aria-label="Passkey name"
                      autoFocus
                      required
                      maxLength={PASSKEY_NAME_MAX}
                      value={editing.name}
                      onChange={(e) => setEditing({ id: pk.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="min-w-0 flex-1"
                    />
                    <Button type="submit" size="sm" disabled={busy || !editing.name.trim()}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pk.label}</p>
                      {pk.added && (
                        <p className="text-xs text-muted-foreground">Added {pk.added}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditing({ id: pk.id, name: pk.label })}
                    >
                      Rename
                    </Button>
                    {userHasPassword ? (
                      // The password step doubles as the confirmation: one step, in this row.
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => start(removeAction(pk))}
                      >
                        Remove
                      </Button>
                    ) : (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm" disabled={busy}>
                            Remove
                          </Button>
                        }
                        title="Remove passkey?"
                        description={removeWarning(pk)}
                        confirmLabel="Remove"
                        onConfirm={() => removeAction(pk).run()}
                      />
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {confirm && !confirm.rowId ? (
          passwordForm(confirm)
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => start(addAction)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add a passkey
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
