"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { showError } from "@/lib/toast-error";
import { TriangleAlert } from "lucide-react";

const CONFIRM_PHRASE = "delete my account";

export function DeleteAccountCard() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const confirmed = confirmation === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteAccount();
      router.push("/sign-in");
    } catch (err) {
      showError(err, "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-5 w-5 text-destructive" />
          <CardTitle>Delete Account</CardTitle>
        </div>
        <CardDescription>
          Permanently delete your account and all associated data. Projects
          where you are the only member will be deleted along with all their
          webhooks, channels, and messages. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Type <span className="font-semibold">{CONFIRM_PHRASE}</span> to
            confirm
          </Label>
          <Input
            id="delete-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            disabled={deleting}
          />
        </div>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={!confirmed || deleting}
        >
          {deleting ? "Deleting..." : "Delete account permanently"}
        </Button>
      </CardContent>
    </Card>
  );
}
