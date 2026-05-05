"use client";

import {
  type FilterDefinition,
  type FilterCondition,
  type FilterGroup,
  type FilterField,
  FILTER_FIELDS,
  FIELD_OPERATORS,
  OPERATOR_LABELS,
  FIELD_LABELS,
  PRIORITY_OPTIONS,
  PRIORITY_LABELS,
} from "@/lib/filter/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

interface FilterBuilderProps {
  value: FilterDefinition | null;
  onChange: (filter: FilterDefinition | null) => void;
  availableTags?: string[];
}

function createDefaultCondition(field: FilterField): FilterCondition {
  switch (field) {
    case "priority":
      return { field: "priority", operator: "equals", value: 3 };
    case "tags":
      return { field: "tags", operator: "has_any_of", value: [] };
    case "title":
      return { field: "title", operator: "contains", value: "" };
    case "message":
      return { field: "message", operator: "contains", value: "" };
    case "payload":
      return { field: "payload", path: "", operator: "contains", value: "" };
  }
}

function TagsInput({
  value,
  onChange,
  availableTags = [],
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  availableTags?: string[];
}) {
  const [inputValue, setInputValue] = useState("");

  const suggestions = availableTags.filter(
    (tag) =>
      tag.toLowerCase().includes(inputValue.toLowerCase()) &&
      !value.includes(tag)
  );

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5 min-w-0">
      <div className="relative">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(inputValue);
            }
          }}
          placeholder="Type a tag and press Enter"
          className="h-7 text-xs"
        />
        {inputValue && suggestions.length > 0 && (
          <div className="absolute top-full z-10 mt-1 max-h-32 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-muted"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ConditionValueInput({
  condition,
  onChange,
  availableTags,
}: {
  condition: FilterCondition;
  onChange: (condition: FilterCondition) => void;
  availableTags?: string[];
}) {
  switch (condition.field) {
    case "priority": {
      if (condition.operator === "between") {
        const range = Array.isArray(condition.value)
          ? condition.value
          : [1, 5];
        return (
          <div className="flex items-center gap-1.5">
            <Select
              value={String(range[0])}
              onValueChange={(v) =>
                onChange({ ...condition, value: [Number(v), range[1]] })
              }
            >
              <SelectTrigger size="sm">{PRIORITY_LABELS[range[0]] ?? range[0]}</SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    {p.label} ({p.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">and</span>
            <Select
              value={String(range[1])}
              onValueChange={(v) =>
                onChange({ ...condition, value: [range[0], Number(v)] })
              }
            >
              <SelectTrigger size="sm">{PRIORITY_LABELS[range[1]] ?? range[1]}</SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    {p.label} ({p.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }
      const currentValue = typeof condition.value === "number" ? condition.value : 3;
      return (
        <Select
          value={String(currentValue)}
          onValueChange={(v) =>
            onChange({ ...condition, value: Number(v) })
          }
        >
          <SelectTrigger size="sm">{PRIORITY_LABELS[currentValue] ?? currentValue}</SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={String(p.value)}>
                {p.label} ({p.value})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "tags":
      return (
        <TagsInput
          value={condition.value}
          onChange={(tags) =>
            onChange({ ...condition, value: tags as unknown as [string, ...string[]] })
          }
          availableTags={availableTags}
        />
      );
    case "title":
    case "message":
      return (
        <Input
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="Enter value..."
          className="h-7 flex-1 text-xs"
        />
      );
    case "payload":
      return (
        <Input
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="Enter value..."
          className="h-7 flex-1 text-xs"
        />
      );
  }
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  availableTags,
}: {
  condition: FilterCondition;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
  availableTags?: string[];
}) {
  function handleFieldChange(newField: FilterField) {
    onChange(createDefaultCondition(newField));
  }

  const operators = FIELD_OPERATORS[condition.field];

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Select
        value={condition.field}
        onValueChange={(v) => handleFieldChange(v as FilterField)}
      >
        <SelectTrigger size="sm">
          <SelectValue>{FIELD_LABELS[condition.field]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {FILTER_FIELDS.map((field) => (
            <SelectItem key={field} value={field}>
              {FIELD_LABELS[field]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {condition.field === "payload" && (
        <Input
          value={condition.path}
          onChange={(e) => onChange({ ...condition, path: e.target.value })}
          placeholder="JSON path (e.g. data.type)"
          className="h-7 w-40 text-xs"
        />
      )}

      <Select
        value={condition.operator}
        onValueChange={(newOp) => {
          if (condition.field === "priority") {
            const newValue =
              newOp === "between"
                ? [1, 5]
                : typeof condition.value === "number"
                  ? condition.value
                  : 3;
            onChange({ ...condition, operator: newOp as typeof condition.operator, value: newValue });
          } else {
            onChange({ ...condition, operator: newOp } as FilterCondition);
          }
        }}
      >
        <SelectTrigger size="sm">
          <SelectValue>{OPERATOR_LABELS[condition.operator]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ConditionValueInput
        condition={condition}
        onChange={onChange}
        availableTags={availableTags}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function GroupEditor({
  group,
  onChange,
  onRemove,
  availableTags,
}: {
  group: FilterGroup;
  onChange: (group: FilterGroup) => void;
  onRemove: () => void;
  availableTags?: string[];
}) {
  function updateCondition(index: number, condition: FilterCondition) {
    const newConditions = group.conditions.map((c, i) =>
      i === index ? condition : c
    );
    onChange({ conditions: newConditions });
  }

  function removeCondition(index: number) {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    if (newConditions.length === 0) {
      onRemove();
    } else {
      onChange({ conditions: newConditions });
    }
  }

  function addCondition() {
    onChange({
      conditions: [
        ...group.conditions,
        createDefaultCondition("priority"),
      ],
    });
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="space-y-2">
        {group.conditions.map((condition, index) => (
          <div key={index}>
            {index > 0 && (
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  AND
                </Badge>
              </div>
            )}
            <ConditionRow
              condition={condition}
              onChange={(c) => updateCondition(index, c)}
              onRemove={() => removeCondition(index)}
              availableTags={availableTags}
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={addCondition}
        className="mt-2"
      >
        <Plus className="size-3" />
        Add condition
      </Button>
    </div>
  );
}

export function FilterBuilder({
  value,
  onChange,
  availableTags,
}: FilterBuilderProps) {
  if (!value) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({
            groups: [
              { conditions: [createDefaultCondition("priority")] },
            ],
          })
        }
      >
        <Plus className="size-3.5" />
        Add filter
      </Button>
    );
  }

  function updateGroup(index: number, group: FilterGroup) {
    const newGroups = value!.groups.map((g, i) => (i === index ? group : g));
    onChange({ groups: newGroups });
  }

  function removeGroup(index: number) {
    const newGroups = value!.groups.filter((_, i) => i !== index);
    if (newGroups.length === 0) {
      onChange(null);
    } else {
      onChange({ groups: newGroups });
    }
  }

  function addGroup() {
    onChange({
      groups: [
        ...value!.groups,
        { conditions: [createDefaultCondition("priority")] },
      ],
    });
  }

  return (
    <div className="space-y-3">
      {value.groups.map((group, index) => (
        <div key={index}>
          {index > 0 && (
            <div className="relative my-3 flex items-center justify-center">
              <div className="absolute inset-x-0 top-1/2 border-t border-border" />
              <Badge variant="secondary" className="relative z-10">
                OR
              </Badge>
            </div>
          )}
          <GroupEditor
            group={group}
            onChange={(g) => updateGroup(index, g)}
            onRemove={() => removeGroup(index)}
            availableTags={availableTags}
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={addGroup}>
          <Plus className="size-3" />
          Add OR group
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange(null)}
          className="text-muted-foreground"
        >
          <X className="size-3" />
          Clear filter
        </Button>
      </div>
    </div>
  );
}
