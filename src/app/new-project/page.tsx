"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { generateOrgSlug } from "@/lib/org-slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { showError } from "@/lib/toast-error";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const { error } = await authClient.organization.create({
      name,
      slug: generateOrgSlug(name),
    });

    if (error) {
      showError(error, "Failed to create project");
      setCreating(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md px-4">
        <Card>
          <CardHeader className="text-center">
            <Image
              src="/logo.svg"
              alt="Alphorn"
              width={48}
              height={48}
              className="mx-auto mb-2"
            />
            <CardTitle className="text-2xl font-bold">
              Create your first project
            </CardTitle>
            <CardDescription>
              Projects organize your webhooks, channels, and message routing.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  type="text"
                  placeholder="My Project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={creating}
                  autoFocus
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "Creating..." : "Create project"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
