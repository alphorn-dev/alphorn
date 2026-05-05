"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getWebhooksForSend, sendTestMessage } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Send, X } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

interface Webhook {
  id: string;
  name: string;
}

export function SendMessageDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [webhookId, setWebhookId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      getWebhooksForSend().then(setWebhooks);
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!webhookId) {
      toast.error("Select a webhook");
      return;
    }
    setSending(true);
    try {
      const prio = priority ? parseInt(priority, 10) : null;
      const messageId = await sendTestMessage(webhookId, title, message, prio, tags);
      toast.success("Message sent");
      setOpen(false);
      setTitle("");
      setMessage("");
      setPriority("");
      setTagInput("");
      setTags([]);
      setWebhookId("");
      router.push(`/messages/${messageId}`);
    } catch (err) {
      showError(err, "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button onClick={() => handleOpenChange(true)} className="gap-2">
        <Send data-icon="inline-start" />
        Send message
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a message</DialogTitle>
            <DialogDescription>
              Send a test notification through a webhook.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSend}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Webhook</Label>
                <Select
                  value={webhookId}
                  onValueChange={(v) => setWebhookId(v || "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a webhook...">
                      {webhooks.find((w) => w.id === webhookId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {webhooks.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {webhooks.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No webhooks available. Create one first.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-title">Title</Label>
                <Input
                  id="msg-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Test notification"
                  required
                  disabled={sending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-message">Message</Label>
                <Textarea
                  id="msg-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="This is a test message from Alphorn"
                  disabled={sending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v ?? "")}>
                  <SelectTrigger id="msg-priority">
                    <SelectValue placeholder="None">
                      {{"1": "1 - Min", "2": "2 - Low", "3": "3 - Default", "4": "4 - High", "5": "5 - Urgent"}[priority] ?? "None"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Min</SelectItem>
                    <SelectItem value="2">2 - Low</SelectItem>
                    <SelectItem value="3">3 - Default</SelectItem>
                    <SelectItem value="4">4 - High</SelectItem>
                    <SelectItem value="5">5 - Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="msg-tags">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    id="msg-tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={addTag}
                    placeholder="Type a tag and press Enter"
                    disabled={sending}
                  />
                </div>
                {tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap pt-1">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 cursor-pointer"
                        onClick={() => removeTag(tag)}
                      >
                        {tag}
                        <X data-icon="inline-end" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={sending || !webhookId}>
                {sending ? "Sending..." : "Send"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
