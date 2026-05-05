import { redirect } from "next/navigation";
import { getMemberRole } from "@/lib/auth/server";
import { getChannelsForOrg } from "../../channels/actions";
import { getAllTagsForOrg } from "../../messages/actions";
import NewWebhookForm from "./new-webhook-form";

export default async function NewWebhookPage() {
  const role = await getMemberRole();
  if (!role || !["owner", "admin"].includes(role)) {
    redirect("/webhooks");
  }

  const [channels, tags] = await Promise.all([
    getChannelsForOrg(),
    getAllTagsForOrg(),
  ]);

  return (
    <NewWebhookForm
      channels={channels.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      availableTags={tags}
    />
  );
}
