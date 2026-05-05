"use client";

import { useState } from "react";
import { evaluateFilter, evaluateCondition } from "@/lib/filter";
import type { FilterMessage } from "@/lib/filter";
import type { FilterDefinition } from "@/lib/filter/schema";
import { FIELD_LABELS, OPERATOR_LABELS, PRIORITY_LABELS, PRIORITY_OPTIONS } from "@/lib/filter/schema";
import type { FilterCondition } from "@/lib/filter/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, FlaskConical } from "lucide-react";

interface FilterTestPanelProps {
  filter: FilterDefinition | null;
}

interface ConditionResult {
  condition: FilterCondition;
  passed: boolean;
}

interface GroupResult {
  conditionResults: ConditionResult[];
  passed: boolean;
}

interface TestResult {
  overall: boolean;
  groups: GroupResult[];
}

function describeCondition(condition: FilterCondition): string {
  const field = FIELD_LABELS[condition.field] ?? condition.field;
  const operator = OPERATOR_LABELS[condition.operator] ?? condition.operator;

  if (condition.field === "payload") {
    return `${field} (${condition.path}) ${operator} "${condition.value}"`;
  }

  if (condition.field === "tags") {
    return `${field} ${operator} [${condition.value.join(", ")}]`;
  }

  if (condition.field === "priority") {
    if (condition.operator === "between" && Array.isArray(condition.value)) {
      return `${field} ${operator} ${PRIORITY_LABELS[condition.value[0]] ?? condition.value[0]} and ${PRIORITY_LABELS[condition.value[1]] ?? condition.value[1]}`;
    }
    const label = typeof condition.value === "number" ? (PRIORITY_LABELS[condition.value] ?? condition.value) : condition.value;
    return `${field} ${operator} ${label}`;
  }

  return `${field} ${operator} "${condition.value}"`;
}

export function FilterTestPanel({ filter }: FilterTestPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("Test notification");
  const [priority, setPriority] = useState("3");
  const [message, setMessage] = useState("This is a test message");
  const [tags, setTags] = useState("production");
  const [payload, setPayload] = useState('{"environment": "production"}');
  const [result, setResult] = useState<TestResult | null>(null);

  if (!filter) return null;

  function runTest() {
    if (!filter) return;
    let parsedPayload: unknown = {};
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      // keep as empty object
    }

    const msg: FilterMessage = {
      title,
      message,
      priority: priority === "" ? null : Number(priority),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      payload: parsedPayload,
    };

    const groups: GroupResult[] = filter.groups.map((group) => {
      const conditionResults = group.conditions.map((condition) => ({
        condition,
        passed: evaluateCondition(msg, condition),
      }));
      return {
        conditionResults,
        passed: conditionResults.every((r) => r.passed),
      };
    });

    const overall = evaluateFilter(msg, filter);

    setResult({ overall, groups });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => {
          setExpanded(!expanded);
          if (expanded) setResult(null);
        }}
      >
        <FlaskConical className="size-3.5" />
        {expanded ? "Hide test" : "Test filter"}
      </button>

      {expanded && (
        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="test-title">Title</Label>
              <Input
                id="test-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? "")}>
                <SelectTrigger>
                  <SelectValue>
                    {priority ? `${PRIORITY_LABELS[Number(priority)] ?? priority} (${priority})` : "None"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label} ({p.value})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="test-message">Message</Label>
            <Input
              id="test-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="test-tags">Tags (comma-separated)</Label>
            <Input
              id="test-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="test-payload">Payload (JSON)</Label>
            <Textarea
              id="test-payload"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={runTest} size="sm">
            Run test
          </Button>

          {result && (
            <div className="space-y-3">
              <div
                className={`rounded-lg px-4 py-3 text-sm font-medium ${
                  result.overall
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                }`}
              >
                {result.overall ? (
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Match — would be delivered
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <X className="h-4 w-4" />
                    No match — would be filtered out
                  </span>
                )}
              </div>

              {result.groups.map((group, gi) => (
                <div
                  key={gi}
                  className={`rounded-lg border p-3 ${
                    group.passed
                      ? "border-green-500/50"
                      : "border-border"
                  }`}
                >
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    Group {gi + 1}
                    {gi < result.groups.length - 1 && (
                      <span className="ml-1 text-muted-foreground/60">
                        (OR)
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {group.conditionResults.map((cr, ci) => (
                      <div
                        key={ci}
                        className="flex items-center gap-2 text-sm"
                      >
                        {cr.passed ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                        ) : (
                          <X className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                        )}
                        <span className="text-muted-foreground">
                          {describeCondition(cr.condition)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
