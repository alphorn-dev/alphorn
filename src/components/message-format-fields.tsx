"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EXTRACT_MODES, type ExtractMode } from "@/lib/webhook-extract/mode";

export interface MessageTemplates {
  titleTemplate: string;
  messageTemplate: string;
  tagsTemplate: string;
  priorityTemplate: string;
}

export const EMPTY_TEMPLATES: MessageTemplates = {
  titleTemplate: "",
  messageTemplate: "",
  tagsTemplate: "",
  priorityTemplate: "",
};

const MODE_LABELS: Record<ExtractMode, string> = {
  auto: "Auto-detect",
  none: "None (generic)",
  template: "Custom template",
};

const MODE_HINTS: Record<ExtractMode, string> = {
  auto: "Recognizes common sources (e.g. GitHub, Sentry, Stripe) and formats each event type. Other payloads use the generic detection.",
  none: "Picks title and message from common fields (title, message, body, ...). Falls back to the raw JSON.",
  template: "Fields resolve {path.to.field} against the payload. Empty fields use the generic detection.",
};

export function MessageFormatFields({
  mode,
  templates,
  onChange,
  disabled,
}: {
  mode: ExtractMode;
  templates: MessageTemplates;
  onChange: (mode: ExtractMode, templates: MessageTemplates) => void;
  disabled?: boolean;
}) {
  function setField(field: keyof MessageTemplates, fieldValue: string) {
    onChange(mode, { ...templates, [field]: fieldValue });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Message format</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            if (v) onChange(v as ExtractMode, templates);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue>{MODE_LABELS[mode]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EXTRACT_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {MODE_HINTS[mode]}
        </p>
      </div>

      {mode === "template" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="title-tpl">Title template</Label>
            <Input
              id="title-tpl"
              value={templates.titleTemplate}
              onChange={(e) => setField("titleTemplate", e.target.value)}
              placeholder="{action}: {issue.title}"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message-tpl">Message template</Label>
            <Textarea
              id="message-tpl"
              value={templates.messageTemplate}
              onChange={(e) => setField("messageTemplate", e.target.value)}
              placeholder="{issue.body}"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags-tpl">Tags template (comma-separated)</Label>
            <Input
              id="tags-tpl"
              value={templates.tagsTemplate}
              onChange={(e) => setField("tagsTemplate", e.target.value)}
              placeholder="github,{repository.name}"
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority-tpl">Priority template (number)</Label>
            <Input
              id="priority-tpl"
              value={templates.priorityTemplate}
              onChange={(e) => setField("priorityTemplate", e.target.value)}
              placeholder="{severity}"
              disabled={disabled}
            />
          </div>
        </>
      )}
    </div>
  );
}
