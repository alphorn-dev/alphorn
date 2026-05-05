import type { Prisma } from "@/generated/prisma/client";

/**
 * Normalized classification of a subscription state transition.
 *
 * - `created` — first event we've ever seen for an org's subscription
 * - `cancelled` — subscription became cancelled (Paddle "canceled" or a
 *   scheduled cancel-at-period-end)
 * - `paused` — subscription became paused
 * - `past_due` — subscription became past_due
 * - `reactivated` — came back to `active` from a non-active, non-trialing
 *   state (after cancel, pause, past_due)
 * - `plan_changed` — plan switched while staying in the same status
 * - `updated` — fallback; some other change we didn't classify more specifically
 *
 * Stored as `String` in Postgres intentionally — Prisma/Postgres enums are
 * painful to evolve, and the retention job only cares about a few values.
 */
type SubscriptionEventType =
  | "created"
  | "cancelled"
  | "paused"
  | "past_due"
  | "reactivated"
  | "plan_changed"
  | "updated";

interface SubscriptionTransitionInput {
  organizationId: string;
  fromPlan: string | null;
  toPlan: string;
  fromStatus: string | null;
  toStatus: string;
  occurredAt: Date;
  paddleEventId: string | null;
}

/**
 * Append-only log of subscription state transitions. Emits a row only when
 * plan or status actually changed, so we don't pollute the table with
 * no-op updates (Paddle sends a lot of those).
 *
 * The classifier field is normalized for query convenience — the retention
 * job cares about "when did this org become cancelled" and "when did it
 * come back", so those are first-class.
 *
 * Subtle limitation: this only records events that were actually applied to
 * the Subscription row. The Paddle webhook handler drops out-of-order events
 * via the `paddleUpdatedAt` guard, and those are silently skipped here too —
 * so the event log may miss intermediate transitions if Paddle delivers
 * events out of order. The canonical `Subscription` state is still correct.
 */
export async function recordSubscriptionTransition(
  tx: Prisma.TransactionClient,
  input: SubscriptionTransitionInput,
): Promise<void> {
  const planChanged = input.fromPlan !== input.toPlan;
  const statusChanged = input.fromStatus !== input.toStatus;
  if (!planChanged && !statusChanged) return;

  const type = classifyTransition({
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    planChanged,
  });

  await tx.subscriptionEvent.create({
    data: {
      organizationId: input.organizationId,
      type,
      fromPlan: input.fromPlan,
      toPlan: input.toPlan,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      occurredAt: input.occurredAt,
      paddleEventId: input.paddleEventId,
    },
  });
}

/**
 * Pure classifier for a subscription transition. Separate from the DB write
 * so it can be unit-tested without a database. Input is normalized: callers
 * pass `planChanged` directly so we don't have to reason about what "same
 * plan" means at this layer.
 */
export function classifyTransition(input: {
  fromStatus: string | null;
  toStatus: string;
  planChanged: boolean;
}): SubscriptionEventType {
  const { fromStatus, toStatus, planChanged } = input;

  if (fromStatus === null) return "created";
  if (toStatus === "cancelled") return "cancelled";
  if (toStatus === "paused") return "paused";
  if (toStatus === "past_due") return "past_due";
  if (
    toStatus === "active" &&
    fromStatus !== "active" &&
    fromStatus !== "trialing"
  ) {
    return "reactivated";
  }
  if (planChanged) return "plan_changed";
  return "updated";
}
