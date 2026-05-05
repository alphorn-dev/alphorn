"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  Package,
  ArrowUpRight,
  Receipt,
  ExternalLink,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  getCheckoutData,
  cancelSubscription,
  getMessagePackCheckoutData,
  getSubscriptionStatus,
  getCustomerPortalUrl,
} from "./actions";
import type { PlanId } from "@/lib/billing/plans";

declare global {
  interface Window {
    Paddle?: {
      Initialize: (options: {
        token: string;
        eventCallback?: (event: { name: string }) => void;
      }) => void;
      Environment?: {
        set: (env: "sandbox" | "production") => void;
      };
      Checkout: {
        open: (options: Record<string, unknown>) => void;
        close: () => void;
      };
    };
  }
}

interface BillingData {
  billingEnabled: boolean;
  paddleClientToken: string | null;
  paddleEnvironment: "sandbox" | "production";
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  purchasedPacks: number;
  limits: {
    messages: number | null;
    webhooks: number | null;
    channels: number | null;
    retentionDays: number;
  };
  usage: {
    messages: number;
    webhooks: number;
    channels: number;
  };
  hasSubscription: boolean;
}

export function BillingClient({ data }: { data: BillingData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [paddleReady, setPaddleReady] = useState(false);

  useEffect(() => {
    if (!data.billingEnabled) return;

    // Paddle's webhook usually lands within a second or two, but can take
    // longer. Poll the server every 1s for up to 20s, refreshing as soon as
    // the subscription reflects any change from the pre-checkout state
    // (plan, hasSubscription, or pack count — covers upgrades + packs).
    async function pollUntilChanged() {
      const initial = await getSubscriptionStatus().catch(() => null);
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const cur = await getSubscriptionStatus();
          if (
            !initial ||
            cur.plan !== initial.plan ||
            cur.hasSubscription !== initial.hasSubscription ||
            cur.totalPacks !== initial.totalPacks
          ) {
            router.refresh();
            return;
          }
        } catch {
          // ignore transient errors and keep polling
        }
      }
      router.refresh();
    }

    if (!data.paddleClientToken) return;
    const token = data.paddleClientToken;
    const environment = data.paddleEnvironment;

    let cancelled = false;

    function ready() {
      if (cancelled || !window.Paddle) return false;
      if (environment === "sandbox") {
        window.Paddle.Environment?.set("sandbox");
      }
      window.Paddle.Initialize({
        token,
        eventCallback: (event) => {
          if (event.name === "checkout.completed") {
            toast.success("Payment received, activating subscription…");
            // Give Paddle a beat to show its success animation, then dismiss
            // the overlay automatically so the user doesn't have to hunt for X.
            setTimeout(() => window.Paddle?.Checkout.close(), 1500);
            void pollUntilChanged();
          }
        },
      });
      setPaddleReady(true);
      return true;
    }

    // Already loaded on this page (e.g. from a prior navigation).
    if (ready()) return;

    const SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${SRC}"]`,
    );
    if (!script) {
      script = document.createElement("script");
      script.src = SRC;
      script.async = true;
      document.head.appendChild(script);
    }

    const onLoad = () => ready();
    script.addEventListener("load", onLoad);

    // Script may have already finished loading between querySelector and
    // addEventListener — `window.Paddle` is the source of truth, so re-check.
    ready();

    return () => {
      cancelled = true;
      script?.removeEventListener("load", onLoad);
    };
  }, [data.billingEnabled, data.paddleClientToken, data.paddleEnvironment, router]);

  async function handleUpgrade(plan: PlanId) {
    setLoading(plan);
    try {
      const checkout = await getCheckoutData(plan);
      if (!window.Paddle) {
        toast.error("Payment system not loaded. Please try again.");
        return;
      }
      window.Paddle.Checkout.open({
        items: [{ priceId: checkout.priceId, quantity: 1 }],
        customer: checkout.customerId
          ? { id: checkout.customerId }
          : { email: checkout.email },
        customData: { organizationId: checkout.organizationId },
      });
    } catch (error) {
      showError(error, "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        "Are you sure you want to cancel your subscription? It will remain active until the end of the current billing period.",
      )
    ) {
      return;
    }
    setLoading("cancel");
    try {
      await cancelSubscription();
      toast.success("Subscription cancelled. Active until end of period.");
      router.refresh();
    } catch (error) {
      showError(error, "Failed to cancel");
    } finally {
      setLoading(null);
    }
  }

  async function handleManageBilling() {
    setLoading("portal");
    try {
      const url = await getCustomerPortalUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      showError(error, "Failed to open portal");
    } finally {
      setLoading(null);
    }
  }

  async function handleBuyPack() {
    setLoading("pack");
    try {
      const checkout = await getMessagePackCheckoutData();
      if (!window.Paddle) {
        toast.error("Payment system not loaded. Please try again.");
        return;
      }
      window.Paddle.Checkout.open({
        items: [{ priceId: checkout.priceId, quantity: 1 }],
        customer: checkout.customerId
          ? { id: checkout.customerId }
          : { email: checkout.email },
        customData: { organizationId: checkout.organizationId },
      });
    } catch (error) {
      showError(error, "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  if (!data.billingEnabled) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Manage your plan and usage.
        </p>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Self-Hosted
            </CardTitle>
            <CardDescription>
              Self-hosted — all features are unlimited.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const planLabel =
    data.plan.charAt(0).toUpperCase() + data.plan.slice(1);

  const statusVariant: "default" | "destructive" =
    data.status === "active" || data.status === "trialing"
      ? "default"
      : "destructive";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Manage your plan and usage.
      </p>

      <div className="space-y-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {planLabel} Plan
              </CardTitle>
              <Badge variant={statusVariant}>
                {data.status.replace("_", " ")}
              </Badge>
            </div>
            <CardDescription>
              {data.plan === "free" && "Free plan with basic limits."}
              {data.plan === "pro" && "Pro plan — €25/mo"}
              {data.plan === "business" && "Business plan — €79/mo"}
              {data.plan === "enterprise" &&
                "Enterprise plan — custom contract."}
              {data.currentPeriodEnd && (
                <>
                  {" "}
                  · Current period ends{" "}
                  {new Date(data.currentPeriodEnd).toLocaleDateString()}
                </>
              )}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Usage
            </CardTitle>
            <CardDescription>
              Current period usage against your plan limits.
              {data.purchasedPacks > 0 && (
                <>
                  {" "}
                  Includes {data.purchasedPacks} purchased message{" "}
                  {data.purchasedPacks === 1 ? "pack" : "packs"} (+
                  {(data.purchasedPacks * 10000).toLocaleString()}{" "}
                  messages).
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <UsageRow
              label="Messages"
              used={data.usage.messages}
              limit={data.limits.messages}
            />
            <UsageRow
              label="Webhooks"
              used={data.usage.webhooks}
              limit={data.limits.webhooks}
            />
            <UsageRow
              label="Channels"
              used={data.usage.channels}
              limit={data.limits.channels}
            />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Retention</span>
              <span className="font-medium">
                {data.limits.retentionDays} days
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {data.plan === "enterprise" ? (
          <Card>
            <CardHeader>
              <CardTitle>Manage Billing</CardTitle>
              <CardDescription>
                Enterprise plans are billed outside Paddle. Contact support to
                change your contract, limits, or renewal.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (() => {
          // Derive what to show based on current plan/status.
          const effectivePlan =
            data.status === "cancelled" || data.status === "past_due"
              ? "free"
              : data.plan;
          const showPro = effectivePlan === "free";
          const showBusiness =
            effectivePlan === "free" || effectivePlan === "pro";
          const isResubscribe = data.status === "cancelled";
          const ctaVerb = isResubscribe ? "Resubscribe" : "Upgrade";
          const hasPlanChangeOption = showPro || showBusiness;
          const canBuyPack =
            data.hasSubscription && data.status !== "cancelled";
          const canManageBilling = data.hasSubscription;
          const canCancel =
            data.hasSubscription && data.status !== "cancelled";

          return (
            <Card>
              <CardHeader>
                <CardTitle>Manage Billing</CardTitle>
                <CardDescription>
                  Change your plan, buy extra capacity, or view invoices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {hasPlanChangeOption && (
                  <ActionRow
                    title={isResubscribe ? "Resubscribe" : "Change plan"}
                    description={
                      isResubscribe
                        ? "Your subscription is cancelled. Pick a plan to resume service."
                        : "Move to a higher tier for more messages, channels, and retention."
                    }
                  >
                    {showPro && (
                      <Button
                        onClick={() => handleUpgrade("pro")}
                        disabled={loading !== null || !paddleReady}
                      >
                        <ArrowUpRight className="mr-2 h-4 w-4" />
                        {loading === "pro"
                          ? "Loading..."
                          : `${ctaVerb} to Pro — €25/mo`}
                      </Button>
                    )}
                    {showBusiness && (
                      <Button
                        onClick={() => handleUpgrade("business")}
                        disabled={loading !== null || !paddleReady}
                        variant={showPro ? "outline" : "default"}
                      >
                        <ArrowUpRight className="mr-2 h-4 w-4" />
                        {loading === "business"
                          ? "Loading..."
                          : `${ctaVerb} to Business — €79/mo`}
                      </Button>
                    )}
                  </ActionRow>
                )}

                {canBuyPack && (
                  <>
                    {hasPlanChangeOption && <Separator />}
                    <ActionRow
                      title="Extra messages"
                      description="Running low this month? Add a message pack — 10,000 extra messages, valid until the end of your current billing period."
                    >
                      <Button
                        variant="outline"
                        onClick={handleBuyPack}
                        disabled={loading !== null || !paddleReady}
                      >
                        <Package className="mr-2 h-4 w-4" />
                        {loading === "pack"
                          ? "Loading..."
                          : "Buy Message Pack — €5"}
                      </Button>
                    </ActionRow>
                  </>
                )}

                {canManageBilling && (
                  <>
                    {(hasPlanChangeOption || canBuyPack) && <Separator />}
                    <ActionRow
                      title="Invoices & payment method"
                      description="Open the Paddle customer portal to download invoices and update your payment method."
                    >
                      <Button
                        variant="outline"
                        onClick={handleManageBilling}
                        disabled={loading !== null}
                      >
                        <Receipt className="mr-2 h-4 w-4" />
                        {loading === "portal"
                          ? "Opening..."
                          : "Open Customer Portal"}
                        <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-60" />
                      </Button>
                    </ActionRow>
                  </>
                )}

                {canCancel && (
                  <>
                    <Separator />
                    <ActionRow
                      title="Cancel subscription"
                      description="Your plan stays active until the end of the current billing period."
                    >
                      <Button
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={loading !== null}
                        className="text-destructive hover:text-destructive"
                      >
                        {loading === "cancel"
                          ? "Cancelling..."
                          : "Cancel Subscription"}
                      </Button>
                    </ActionRow>
                  </>
                )}

                <p className="text-muted-foreground pt-2 text-xs">
                  By upgrading or purchasing, you agree to our{" "}
                  <a
                    href="https://alphorn.dev/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://alphorn.dev/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    Privacy Policy
                  </a>
                  . Subscriptions renew automatically and can be cancelled
                  anytime.
                </p>
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}

function ActionRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-0.5 pr-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-wrap gap-2 sm:justify-end">
        {children}
      </div>
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const percent =
    limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used.toLocaleString()} /{" "}
          {limit === null ? "unlimited" : limit.toLocaleString()}
        </span>
      </div>
      {limit !== null && <Progress value={percent} className="h-2" />}
    </div>
  );
}
