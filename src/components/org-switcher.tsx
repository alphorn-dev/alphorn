"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { generateOrgSlug } from "@/lib/org-slug";
import { getOrgs2FARequirements } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronsUpDown, Check, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface Org {
  id: string;
  name: string;
  slug: string | null;
}

function toOrg(data: { id: string; name: string; slug?: string | null }): Org {
  return { id: data.id, name: data.name, slug: data.slug ?? null };
}

export function OrgSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<Org | null>(null);
  const [lockedOrgIds, setLockedOrgIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [orgsResult, activeResult, locked] = await Promise.all([
        authClient.organization.list(),
        authClient.organization.getFullOrganization(),
        getOrgs2FARequirements(),
      ]);
      if (cancelled) return;
      if (orgsResult.data) setOrgs(orgsResult.data.map(toOrg));
      if (activeResult.data) setActiveOrg(toOrg(activeResult.data));
      setLockedOrgIds(new Set(locked));
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function refreshOrgs() {
    const [orgsResult, activeResult, locked] = await Promise.all([
      authClient.organization.list(),
      authClient.organization.getFullOrganization(),
      getOrgs2FARequirements(),
    ]);
    if (orgsResult.data) setOrgs(orgsResult.data.map(toOrg));
    if (activeResult.data) setActiveOrg(toOrg(activeResult.data));
    setLockedOrgIds(new Set(locked));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    await authClient.organization.create({
      name: newOrgName,
      slug: generateOrgSlug(newOrgName),
    });
    setCreating(false);
    setDialogOpen(false);
    setNewOrgName("");
    await refreshOrgs();
    router.refresh();
  }

  async function handleSelect(orgId: string) {
    await authClient.organization.setActive({ organizationId: orgId });
    const { data } = await authClient.organization.getFullOrganization();
    if (data) setActiveOrg(toOrg(data));
    const detailMatch = pathname?.match(/^\/(webhooks|channels|messages)\/[^/]+/);
    if (detailMatch) {
      router.push(`/${detailMatch[1]}`);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="w-full justify-between" />
          }
        >
          <span className="truncate">
            {activeOrg?.name || "Select project"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          {orgs.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No projects yet
            </div>
          )}
          {orgs.map((org) => {
            const isLocked = lockedOrgIds.has(org.id);
            return (
              <DropdownMenuItem
                key={org.id}
                className={isLocked ? "opacity-50" : ""}
                onClick={() => {
                  if (isLocked) {
                    toast.error(
                      "This project requires two-factor authentication. Enable 2FA in your profile to access it.",
                    );
                    return;
                  }
                  handleSelect(org.id);
                }}
              >
                <span className="flex-1 truncate">{org.name}</span>
                {isLocked ? (
                  <ShieldAlert className="ml-2 h-4 w-4 text-muted-foreground" />
                ) : activeOrg?.id === org.id ? (
                  <Check className="ml-2 h-4 w-4" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Create a new project to organize your webhooks and channels.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Project name</Label>
                <Input
                  id="org-name"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="My Project"
                  required
                  disabled={creating}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
