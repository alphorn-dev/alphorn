"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Copies `value` to the clipboard and briefly swaps the icon for a check.
 * Icon-only by default; pass children for a labelled button.
 */
export function CopyButton({
  value,
  label = "Copy",
  toastMessage = "Copied to clipboard",
  variant = "outline",
  size,
  className,
  children,
}: {
  value: string;
  label?: string;
  toastMessage?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "icon" | "icon-sm" | "icon-xs" | "sm" | "default";
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    // Copy buttons sit inside clickable table rows and links.
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Couldn't copy to clipboard");
      return;
    }
    toast.success(toastMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const Icon = copied ? Check : Copy;
  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (children ? "sm" : "icon")}
      onClick={copy}
      aria-label={children ? undefined : label}
      title={label}
      className={className}
    >
      <Icon data-icon={children ? "inline-start" : undefined} className={copied ? "text-success" : undefined} />
      {children}
    </Button>
  );
}
