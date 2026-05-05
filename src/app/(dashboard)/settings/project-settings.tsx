"use client";

import { useState } from "react";
import { updateProjectName } from "./actions";
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
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

export function ProjectSettings({ name }: { name: string }) {
  const [projectName, setProjectName] = useState(name);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateProjectName(projectName);
      toast.success("Project name updated");
    } catch (err) {
      showError(err, "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Name</CardTitle>
        <CardDescription>
          The display name for this project. This is visible to all team members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="My Project"
            maxLength={100}
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || projectName.trim() === name}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
