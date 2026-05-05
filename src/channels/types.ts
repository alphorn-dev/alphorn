import { z } from "zod";

export interface Notification {
  title: string | null;
  message: string;
  priority?: number;
  tags?: string[];
  payload?: Record<string, unknown>;
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "password" | "select" | "keyvalue" | "switch";
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  options?: { label: string; value: string }[];
  default?: unknown;
}

export interface OAuthConfig {
  getAuthUrl(organizationId: string, redirectUri: string): string;
  handleCallback(
    code: string,
    redirectUri: string
  ): Promise<Record<string, unknown>>;
}

export interface ChannelOption {
  id: string;
  name: string;
  type: string;
}

export interface DeliveryContext {
  channelId: string;
  deliveryId: string;
  trace?: string[];
}

export interface ChannelHandler {
  type: string;
  displayName: string;
  description: string;
  icon: string;
  setupGuide?: string;
  configSchema: z.ZodObject<z.ZodRawShape>;
  configFields: ConfigField[];
  oauth?: OAuthConfig;
  send(config: unknown, notification: Notification, context: DeliveryContext): Promise<void>;
  test?(config: unknown): Promise<void>;
}
