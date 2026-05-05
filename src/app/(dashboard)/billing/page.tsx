import { notFound } from "next/navigation";
import { getBillingData } from "./actions";
import { BillingClient } from "./billing-client";

export default async function BillingPage() {
  let data;
  try {
    data = await getBillingData();
  } catch (err) {
    if (err instanceof Error && err.message === "Permission denied") {
      notFound();
    }
    throw err;
  }
  return <BillingClient data={data} />;
}
