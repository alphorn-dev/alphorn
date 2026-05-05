"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBuilder } from "@/components/filter-builder";
import { FilterTestPanel } from "@/components/filter-test-panel";
import { ChannelIcon } from "@/components/channel-icons";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";
import type { ChannelSelection, FilterDefinition } from "@/lib/filter/schema";
import type { ChannelOption } from "@/channels/types";

interface ChannelSelectorProps {
  channels: ChannelOption[];
  selected: ChannelSelection[];
  onChange: (selected: ChannelSelection[]) => void;
  availableTags?: string[];
}

export function ChannelSelector({
  channels,
  selected,
  onChange,
  availableTags = [],
}: ChannelSelectorProps) {
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const selectedIds = selected.map((s) => s.channelId);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selected.filter((s) => s.channelId !== id));
      if (expandedChannel === id) setExpandedChannel(null);
    } else {
      onChange([...selected, { channelId: id, filter: null }]);
    }
  }

  function updateFilter(channelId: string, filter: FilterDefinition | null) {
    onChange(
      selected.map((s) =>
        s.channelId === channelId ? { ...s, filter } : s
      )
    );
  }

  function getFilter(channelId: string): FilterDefinition | null {
    return selected.find((s) => s.channelId === channelId)?.filter ?? null;
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No channels configured yet.{" "}
        <a href="/channels/new" className="text-primary underline">
          Create one first
        </a>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {channels.map((ch) => {
        const isSelected = selectedIds.includes(ch.id);
        const isExpanded = expandedChannel === ch.id;
        const hasFilter = getFilter(ch.id) !== null;

        return (
          <div
            key={ch.id}
            className="rounded-md border transition-colors"
          >
            <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggle(ch.id)}
              />
              <ChannelIcon icon={ch.type} className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <Label className="cursor-pointer font-medium">{ch.name}</Label>
                <p className="text-xs text-muted-foreground">{ch.type}</p>
              </div>
              {isSelected && (
                <div className="flex items-center gap-1">
                  {hasFilter && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Filter className="h-3 w-3" /> Filtered
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={(e) => {
                      e.preventDefault();
                      setExpandedChannel(isExpanded ? null : ch.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </label>

            {isSelected && isExpanded && (
              <div className="border-t px-3 pb-3 pt-2 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Filter — only deliver messages that match:
                  </p>
                  <FilterBuilder
                    value={getFilter(ch.id)}
                    onChange={(filter) => updateFilter(ch.id, filter)}
                    availableTags={availableTags}
                  />
                </div>
                {getFilter(ch.id) && (
                  <FilterTestPanel filter={getFilter(ch.id)} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
