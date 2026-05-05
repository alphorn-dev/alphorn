"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm">
      {children}
    </pre>
  );
}

function authLine(requireAuth: boolean, apiKey: string, format: string) {
  if (!requireAuth) return null;
  const bearer = `Bearer ${apiKey}`;
  switch (format) {
    case "curl-header":
      return `-H "Authorization: ${bearer}"`;
    case "python-dict":
      return `"Authorization": "${bearer}"`;
    case "js-header":
      return `"Authorization": "${bearer}"`;
    case "go-header":
      return `req.Header.Set("Authorization", "${bearer}")`;
    case "php-header":
      return `"Authorization: ${bearer}"`;
    case "ruby-header":
      return `req["Authorization"] = "${bearer}"`;
    default:
      return null;
  }
}

interface ExampleSet {
  label: string;
  value: string;
  minimal: string;
  full: string;
}

function buildExamples(
  endpointUrl: string,
  apiKey: string,
  requireAuth: boolean,
): ExampleSet[] {
  const auth = (fmt: string) => authLine(requireAuth, apiKey, fmt);

  return [
    {
      label: "cURL",
      value: "curl",
      minimal: [
        `curl -X POST ${endpointUrl}`,
        auth("curl-header") ? `  ${auth("curl-header")} \\` : null,
        `  -d "Hello from bash"`,
      ]
        .filter(Boolean)
        .join(" \\\n"),
      full: [
        `curl -X POST ${endpointUrl} \\`,
        auth("curl-header") ? `  ${auth("curl-header")} \\` : null,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{`,
        `    "title": "Deploy finished",`,
        `    "message": "App v2.1.0 deployed to production",`,
        `    "priority": 3,`,
        `    "tags": ["deploy", "production"],`,
        `    "payload": {`,
        `      "version": "2.1.0",`,
        `      "environment": "production",`,
        `      "commit": "a1b2c3d"`,
        `    }`,
        `  }'`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      label: "Python",
      value: "python",
      minimal: [
        `import requests`,
        ``,
        `requests.post(`,
        `    "${endpointUrl}",`,
        requireAuth ? `    headers={${auth("python-dict")}},` : null,
        `    data="Hello from Python"`,
        `)`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      full: [
        `import requests`,
        ``,
        `requests.post(`,
        `    "${endpointUrl}",`,
        requireAuth ? `    headers={${auth("python-dict")}},` : null,
        `    json={`,
        `        "title": "Deploy finished",`,
        `        "message": "App v2.1.0 deployed to production",`,
        `        "priority": 3,`,
        `        "tags": ["deploy", "production"],`,
        `        "payload": {`,
        `            "version": "2.1.0",`,
        `            "environment": "production",`,
        `            "commit": "a1b2c3d",`,
        `        },`,
        `    },`,
        `)`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
    {
      label: "JavaScript",
      value: "javascript",
      minimal: [
        `await fetch("${endpointUrl}", {`,
        `  method: "POST",`,
        requireAuth
          ? `  headers: { ${auth("js-header")} },`
          : null,
        `  body: "Hello from JavaScript"`,
        `});`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      full: [
        `await fetch("${endpointUrl}", {`,
        `  method: "POST",`,
        `  headers: {`,
        requireAuth ? `    ${auth("js-header")},` : null,
        `    "Content-Type": "application/json"`,
        `  },`,
        `  body: JSON.stringify({`,
        `    title: "Deploy finished",`,
        `    message: "App v2.1.0 deployed to production",`,
        `    priority: 3,`,
        `    tags: ["deploy", "production"],`,
        `    payload: {`,
        `      version: "2.1.0",`,
        `      environment: "production",`,
        `      commit: "a1b2c3d"`,
        `    }`,
        `  })`,
        `});`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
    {
      label: "Go",
      value: "go",
      minimal: [
        `package main`,
        ``,
        `import (`,
        `\t"net/http"`,
        `\t"strings"`,
        `)`,
        ``,
        `func main() {`,
        `\treq, _ := http.NewRequest("POST", "${endpointUrl}",`,
        `\t\tstrings.NewReader("Hello from Go"))`,
        requireAuth ? `\t${auth("go-header")}` : null,
        `\thttp.DefaultClient.Do(req)`,
        `}`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      full: [
        `package main`,
        ``,
        `import (`,
        `\t"bytes"`,
        `\t"encoding/json"`,
        `\t"net/http"`,
        `)`,
        ``,
        `func main() {`,
        `\tbody, _ := json.Marshal(map[string]any{`,
        `\t\t"title":   "Deploy finished",`,
        `\t\t"message": "App v2.1.0 deployed to production",`,
        `\t\t"priority": 3,`,
        `\t\t"tags":     []string{"deploy", "production"},`,
        `\t\t"payload": map[string]string{`,
        `\t\t\t"version":     "2.1.0",`,
        `\t\t\t"environment": "production",`,
        `\t\t\t"commit":      "a1b2c3d",`,
        `\t\t},`,
        `\t})`,
        `\treq, _ := http.NewRequest("POST", "${endpointUrl}",`,
        `\t\tbytes.NewReader(body))`,
        requireAuth ? `\t${auth("go-header")}` : null,
        `\treq.Header.Set("Content-Type", "application/json")`,
        `\thttp.DefaultClient.Do(req)`,
        `}`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
    {
      label: "PHP",
      value: "php",
      minimal: [
        `$ch = curl_init("${endpointUrl}");`,
        `curl_setopt($ch, CURLOPT_POST, true);`,
        `curl_setopt($ch, CURLOPT_POSTFIELDS, "Hello from PHP");`,
        requireAuth
          ? `curl_setopt($ch, CURLOPT_HTTPHEADER, [\n    "${auth("php-header")}"\n]);`
          : null,
        `curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`,
        `$response = curl_exec($ch);`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      full: [
        `$ch = curl_init("${endpointUrl}");`,
        `curl_setopt($ch, CURLOPT_POST, true);`,
        `curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([`,
        `    "title" => "Deploy finished",`,
        `    "message" => "App v2.1.0 deployed to production",`,
        `    "priority" => 3,`,
        `    "tags" => ["deploy", "production"],`,
        `    "payload" => [`,
        `        "version" => "2.1.0",`,
        `        "environment" => "production",`,
        `        "commit" => "a1b2c3d",`,
        `    ],`,
        `]));`,
        `curl_setopt($ch, CURLOPT_HTTPHEADER, [`,
        requireAuth ? `    "${auth("php-header")}",` : null,
        `    "Content-Type: application/json"`,
        `]);`,
        `curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`,
        `$response = curl_exec($ch);`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
    {
      label: "Ruby",
      value: "ruby",
      minimal: [
        `require "net/http"`,
        ``,
        `uri = URI("${endpointUrl}")`,
        `req = Net::HTTP::Post.new(uri)`,
        requireAuth ? auth("ruby-header") : null,
        `req.body = "Hello from Ruby"`,
        `Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |http| http.request(req) }`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      full: [
        `require "net/http"`,
        `require "json"`,
        ``,
        `uri = URI("${endpointUrl}")`,
        `req = Net::HTTP::Post.new(uri)`,
        requireAuth ? auth("ruby-header") : null,
        `req["Content-Type"] = "application/json"`,
        `req.body = {`,
        `  title: "Deploy finished",`,
        `  message: "App v2.1.0 deployed to production",`,
        `  priority: 3,`,
        `  tags: ["deploy", "production"],`,
        `  payload: {`,
        `    version: "2.1.0",`,
        `    environment: "production",`,
        `    commit: "a1b2c3d"`,
        `  }`,
        `}.to_json`,
        `Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |http| http.request(req) }`,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    },
  ];
}

export function WebhookExamples({
  endpointUrl,
  apiKey,
  requireAuth,
}: {
  endpointUrl: string;
  apiKey: string;
  requireAuth: boolean;
}) {
  const examples = buildExamples(endpointUrl, apiKey, requireAuth);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Examples</CardTitle>
        <CardDescription>
          Send a notification with a simple HTTP request. Only{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">message</code> is
          required &mdash; all other fields are optional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="curl">
          <TabsList className="mb-4 flex-wrap h-auto">
            {examples.map((ex) => (
              <TabsTrigger key={ex.value} value={ex.value}>
                {ex.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {examples.map((ex) => (
            <TabsContent key={ex.value} value={ex.value} className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Minimal</p>
                <CodeBlock>{ex.minimal}</CodeBlock>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">All fields</p>
                <CodeBlock>{ex.full}</CodeBlock>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">Available fields</p>
          <ul className="space-y-0.5">
            <li><code>message</code> &mdash; message text (required)</li>
            <li><code>title</code> &mdash; optional heading</li>
            <li><code>priority</code> &mdash; integer</li>
            <li><code>tags</code> &mdash; string or string array</li>
            <li><code>payload</code> &mdash; any JSON object</li>
          </ul>
          <p>
            Plain-text requests can set <code>title</code>, <code>priority</code>, and <code>tags</code> via{" "}
            <code>x-title</code>, <code>x-priority</code>, and <code>x-tags</code> headers.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
