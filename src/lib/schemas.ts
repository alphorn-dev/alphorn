import { z } from "zod";

// Shared limits for user-named resources (webhooks, channels), checked in the server actions.
export const resourceNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be 100 characters or fewer");

export const descriptionSchema = z
  .string()
  .max(500, "Description must be 500 characters or fewer")
  .optional();
