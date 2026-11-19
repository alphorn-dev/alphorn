"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { ChevronDown, ChevronUp } from "lucide-react";

export function ExpandableError({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = error.length > 80;

  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-xs text-destructive whitespace-pre-wrap break-words">
          {isLong && !expanded ? error.slice(0, 80) + "..." : error}
        </div>
        {isLong && (
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
        )}
      </div>
      <CopyButton
        value={error}
        label="Copy error"
        toastMessage="Error copied"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground"
      />
    </div>
  );
}
