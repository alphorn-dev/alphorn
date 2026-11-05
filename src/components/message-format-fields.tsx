"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SOURCE_PRESETS,
  getSourcePreset,
  type ExtractMode,
} from "@/lib/webhook-extract/presets";

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

const CUSTOM = "custom";

const MODE_LABELS: Record<string, string> = {
  auto: "Auto-detect",
  none: "None (generic)",
  [CUSTOM]: "Custom template",
};

const MODE_HINTS: Record<string, string> = {
  auto: "Recognizes GitHub, Sentry, Stripe, Grafana and Alertmanager and formats each event type. Other payloads use the generic detection.",
  none: "Picks title and message from common fields (title, message, body, ...). Falls back to the raw JSON.",
};

// The preset id isn't stored, so show a preset as selected while the fields
// still match it exactly; any edit turns it into "Custom template".
function selectedValue(mode: ExtractMode, templates: MessageTemplates): string {
  if (mode !== "template") return mode;
  const preset = SOURCE_PRESETS.find(
    (p) =>
      p.titleTemplate === templates.titleTemplate &&
      p.messageTemplate === templates.messageTemplate &&
      p.tagsTemplate === templates.tagsTemplate &&
      p.priorityTemplate === templates.priorityTemplate
  );
  return preset?.id ?? CUSTOM;
}

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
  const value = selectedValue(mode, templates);
  const label = MODE_LABELS[value] ?? getSourcePreset(value)?.label ?? value;

  function handleSelect(v: string | null) {
    if (v === "auto" || v === "none") return onChange(v, templates);
    if (v === CUSTOM) return onChange("template", templates);
    const preset = v ? getSourcePreset(v) : undefined;
    if (preset) onChange("template", preset);
  }

  function setField(field: keyof MessageTemplates, fieldValue: string) {
    onChange(mode, { ...templates, [field]: fieldValue });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Message format</Label>
        <Select value={value} onValueChange={handleSelect} disabled={disabled}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue>{label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{MODE_LABELS.auto}</SelectItem>
            <SelectItem value="none">{MODE_LABELS.none}</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Templates</SelectLabel>
              {SOURCE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>{MODE_LABELS[CUSTOM]}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {MODE_HINTS[mode] ??
            "Fields resolve {path.to.field} against the payload. Empty fields use the generic detection."}
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
