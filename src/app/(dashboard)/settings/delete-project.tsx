"use client";

import { useState } from "react";
import { deleteProject } from "./actions";
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

const CONFIRM_PHRASE = "delete this project";

export function DeleteProjectCard({ projectName }: { projectName: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const confirmed = confirmation === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteProject();
      // Hard reload: the active org changed and the settings route no longer
      // resolves for this user, so client-side routing is unreliable here.
      window.location.href = "/";
    } catch (err) {
      showError(err, "Failed to delete project");
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-5 w-5 text-destructive" />
          <CardTitle>Delete Project</CardTitle>
        </div>
        <CardDescription>
          Permanently delete{" "}
          <span className="font-semibold">{projectName}</span> and all its
          webhooks, channels, messages, members, and invitations. This action
          cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="delete-project-confirm">
            Type <span className="font-semibold">{CONFIRM_PHRASE}</span> to
            confirm
          </Label>
          <Input
            id="delete-project-confirm"
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
          {deleting ? "Deleting..." : "Delete project permanently"}
        </Button>
      </CardContent>
    </Card>
  );
}
