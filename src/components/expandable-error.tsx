"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

export function ExpandableError({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = error.length > 80;

  if (!isLong) {
    return (
      <div className="text-xs text-destructive whitespace-pre-wrap break-words">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-destructive whitespace-pre-wrap break-words">
        {expanded ? error : error.slice(0, 80) + "..."}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <>
            Show less <ChevronUp className="ml-1 h-3 w-3" />
          </>
        ) : (
          <>
            Show more <ChevronDown className="ml-1 h-3 w-3" />
          </>
        )}
      </Button>
    </div>
  );
}
