"use client";

import type { ConfigField } from "@/channels/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface KeyValuePairEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  helpText?: string;
}

function KeyValuePairEditor({
  value,
  onChange,
  helpText,
}: KeyValuePairEditorProps) {
  const entries = Object.entries(value);

  function addRow() {
    const newEntries = [...entries, ["", ""]];
    onChange(Object.fromEntries(newEntries));
  }

  function updateEntry(
    index: number,
    field: "key" | "value",
    newVal: string
  ) {
    const newEntries = entries.map(([k, v], i) => {
      if (i !== index) return [k, v];
      return field === "key" ? [newVal, v] : [k, newVal];
    });
    onChange(Object.fromEntries(newEntries));
  }

  function removeRow(index: number) {
    onChange(Object.fromEntries(entries.filter((_, i) => i !== index)));
  }

  return (
    <div className="space-y-2">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            placeholder="Header name"
            value={k}
            onChange={(e) => updateEntry(i, "key", e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Value"
            value={v}
            onChange={(e) => updateEntry(i, "value", e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(i)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 data-icon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        className="gap-1"
      >
        <Plus data-icon="inline-start" />
        Add header
      </Button>
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}

function FormattedGuide({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        components={{
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground break-all">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 text-foreground hover:text-primary"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1">{children}</ol>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function SetupGuidePanel({ guide }: { guide: string }) {
  return (
    <div className="rounded-md border bg-muted/50 p-4">
      <p className="text-sm font-medium mb-2">Setup Guide</p>
      <FormattedGuide text={guide} />
    </div>
  );
}

interface ChannelConfigFormProps {
  fields: ConfigField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function ChannelConfigForm({
  fields,
  values,
  onChange,
}: ChannelConfigFormProps) {
  function setValue(key: string, val: unknown) {
    onChange({ ...values, [key]: val });
  }

  return (
    <div className="space-y-4">

      {fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`field-${field.key}`}>
            {field.label}
            {field.required && (
              <span className="text-destructive ml-1">*</span>
            )}
          </Label>

          {field.type === "text" && (
            <Input
              id={`field-${field.key}`}
              value={(values[field.key] as string) || ""}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          )}

          {field.type === "password" && (
            <Input
              id={`field-${field.key}`}
              type="password"
              value={(values[field.key] as string) || ""}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          )}

          {field.type === "number" && (
            <Input
              id={`field-${field.key}`}
              type="number"
              value={(values[field.key] as string) || ""}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          )}

          {field.type === "textarea" && (
            <Textarea
              id={`field-${field.key}`}
              value={(values[field.key] as string) || ""}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          )}

          {field.type === "select" && (
            <Select
              value={(values[field.key] as string) || ""}
              onValueChange={(val) => setValue(field.key, val || "")}
            >
              <SelectTrigger id={`field-${field.key}`}>
                <SelectValue placeholder="Select...">
                  {field.options?.find(
                    (opt) => opt.value === (values[field.key] as string)
                  )?.label ?? "Select..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {field.type === "keyvalue" && (
            <KeyValuePairEditor
              value={(values[field.key] as Record<string, string>) || {}}
              onChange={(val) => setValue(field.key, val)}
              helpText={field.helpText}
            />
          )}

          {field.type === "switch" && (
            <div className="flex items-center gap-3">
              <Switch
                id={`field-${field.key}`}
                checked={(values[field.key] as boolean) ?? true}
                onCheckedChange={(val) => setValue(field.key, val)}
              />
              <span className="text-sm text-muted-foreground">
                {(values[field.key] as boolean) ?? true ? "Included" : "Excluded"}
              </span>
            </div>
          )}

          {field.helpText && field.type !== "keyvalue" && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
        </div>
      ))}
    </div>
  );
}
