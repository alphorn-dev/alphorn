"use client";

import { useEffect, useState } from "react";
import {
  getMembers,
  getInvitations,
  inviteMember,
  removeMember,
  cancelInvitation,
  getInviteLinks,
  createInviteLink,
  revokeInviteLink,
  updateMemberRole,
  transferOwnership,
} from "./members-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, X, Link2, Copy, Trash2, Crown } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

interface Member {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
}

interface Invitation {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
}

interface InviteLinkData {
  id: string;
  token: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt: Date | null;
  usedByUser: { name: string; email: string } | null;
  createdByUser: { name: string } | null;
}

export function MembersSection({
  currentUserId,
  callerRole,
  mailerConfigured,
}: {
  currentUserId: string;
  callerRole: string;
  mailerConfigured: boolean;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteLinks, setInviteLinks] = useState<InviteLinkData[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [linkRole, setLinkRole] = useState("member");
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [m, i, l] = await Promise.all([
      getMembers(),
      getInvitations(),
      getInviteLinks(),
    ]);
    setMembers(m as Member[]);
    setInvitations(i as Invitation[]);
    setInviteLinks(l as InviteLinkData[]);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await inviteMember(email, role);
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      await loadData();
    } catch (err) {
      showError(err, "Failed to invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    try {
      await updateMemberRole(memberId, newRole);
      toast.success("Role updated");
      await loadData();
    } catch (err) {
      showError(err, "Failed to update role");
    }
  }

  async function handleTransferOwnership(memberId: string) {
    try {
      await transferOwnership(memberId);
      toast.success("Ownership transferred");
      await loadData();
    } catch (err) {
      showError(err, "Failed to transfer ownership");
    }
  }

  async function handleRemove(memberId: string) {
    try {
      await removeMember(memberId);
      toast.success("Member removed");
      await loadData();
    } catch (err) {
      showError(err, "Failed to remove");
    }
  }

  async function handleCancelInvite(invitationId: string) {
    try {
      await cancelInvitation(invitationId);
      toast.success("Invitation cancelled");
      await loadData();
    } catch (err) {
      showError(err, "Failed to cancel");
    }
  }

  async function handleCreateLink() {
    setGeneratingLink(true);
    try {
      const link = await createInviteLink(linkRole);
      await navigator.clipboard.writeText(link);
      toast.success("Invite link created and copied to clipboard");
      await loadData();
    } catch (err) {
      showError(err, "Failed to create link");
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleRevokeLink(id: string) {
    try {
      await revokeInviteLink(id);
      toast.success("Invite link revoked");
      await loadData();
    } catch (err) {
      showError(err, "Failed to revoke");
    }
  }

  function copyLink(token: string) {
    const baseUrl = window.location.origin;
    navigator.clipboard.writeText(`${baseUrl}/invite/${token}`);
    toast.success("Link copied to clipboard");
  }

  function getLinkStatus(link: InviteLinkData) {
    if (link.usedAt) return "used";
    if (new Date(link.expiresAt) < new Date()) return "expired";
    return "active";
  }

  const linkForm = (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={linkRole} onValueChange={(v) => setLinkRole(v || "member")}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue>{linkRole === "admin" ? "Admin" : "Member"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={handleCreateLink}
          disabled={generatingLink}
          className="gap-1"
        >
          <Link2 data-icon="inline-start" />
          {generatingLink ? "Generating..." : "Create link"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Single-use. Links expire after 7 days.
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            People who have access to this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isSelf = m.user.id === currentUserId;
                  const isOwner = m.role === "owner";
                  const callerIsOwner = callerRole === "owner";

                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.user.name}
                        {isSelf && (
                          <span className="text-muted-foreground ml-1">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.user.email}
                      </TableCell>
                      <TableCell>
                        {isOwner || isSelf ? (
                          <Badge variant="secondary">{m.role}</Badge>
                        ) : (
                          <Select
                            value={m.role}
                            onValueChange={(v) => v && handleRoleChange(m.id, v)}
                          >
                            <SelectTrigger className="w-24 h-7 text-xs">
                              <SelectValue>{m.role === "admin" ? "Admin" : "Member"}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {callerIsOwner && !isSelf && !isOwner && (
                            <ConfirmDialog
                              trigger={
                                <Button variant="ghost" size="icon-sm" title="Transfer ownership">
                                  <Crown className="h-4 w-4" />
                                </Button>
                              }
                              title="Transfer ownership?"
                              description={`${m.user.name} will become the owner and you will be demoted to admin. This cannot be undone.`}
                              confirmLabel="Transfer"
                              onConfirm={() => handleTransferOwnership(m.id)}
                            />
                          )}
                          {!isOwner && !isSelf && (
                            <ConfirmDialog
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Remove
                                </Button>
                              }
                              title="Remove member?"
                              description={`${m.user.name} will lose access to this project.`}
                              confirmLabel="Remove"
                              onConfirm={() => handleRemove(m.id)}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{inv.role || "member"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCancelInvite(inv.id)}
                        title="Cancel invitation"
                      >
                        <X data-icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite people</CardTitle>
          <CardDescription>
            {mailerConfigured
              ? "Invite by email, or generate a single-use shareable link."
              : "Email sending isn't configured on this server — use shareable links instead."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mailerConfigured ? (
            <Tabs defaultValue="email">
              <TabsList variant="line">
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="link">Shareable link</TabsTrigger>
              </TabsList>
              <TabsContent value="email" className="mt-4">
                <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="colleague@example.com"
                      required
                      disabled={inviting}
                    />
                  </div>
                  <Select value={role} onValueChange={(v) => setRole(v || "member")}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue>{role === "admin" ? "Admin" : "Member"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" disabled={inviting} className="gap-1">
                    <UserPlus data-icon="inline-start" />
                    {inviting ? "Inviting..." : "Invite"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="link" className="mt-4">
                {linkForm}
              </TabsContent>
            </Tabs>
          ) : (
            linkForm
          )}
        </CardContent>
      </Card>

      {inviteLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Links</CardTitle>
            <CardDescription>
              Active and recently used shareable invite links.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inviteLinks.map((link) => {
                  const status = getLinkStatus(link);
                  return (
                    <TableRow key={link.id}>
                      <TableCell>
                        <Badge variant="secondary">{link.role}</Badge>
                      </TableCell>
                      <TableCell>
                        {status === "active" && (
                          <Badge variant="default">Active</Badge>
                        )}
                        {status === "used" && (
                          <Badge variant="outline">
                            Used by {link.usedByUser?.name || link.usedByUser?.email || "unknown"}
                          </Badge>
                        )}
                        {status === "expired" && (
                          <Badge variant="secondary">Expired</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(link.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {status === "active" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyLink(link.token)}
                              title="Copy link"
                            >
                              <Copy data-icon />
                            </Button>
                          )}
                          <ConfirmDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Revoke link"
                              >
                                <Trash2 data-icon />
                              </Button>
                            }
                            title="Revoke invite link?"
                            description="This link will no longer work for anyone who has it."
                            confirmLabel="Revoke"
                            onConfirm={() => handleRevokeLink(link.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
