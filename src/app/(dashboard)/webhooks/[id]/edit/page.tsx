import { redirect } from "next/navigation";
import { getMemberRole } from "@/lib/auth/server";
import { getWebhookById } from "../../actions";
import { getChannelsForOrg } from "../../../channels/actions";
import { getAllTagsForOrg } from "../../../messages/actions";
import EditWebhookForm from "./edit-webhook-form";

export default async function EditWebhookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [role, webhook, channels, tags] = await Promise.all([
    getMemberRole(),
    getWebhookById(id),
    getChannelsForOrg(),
    getAllTagsForOrg(),
  ]);
  if (!role || !["owner", "admin"].includes(role)) {
    redirect("/webhooks");
  }
  if (!webhook) {
    redirect("/webhooks");
  }

  return (
    <EditWebhookForm
      webhook={webhook}
      channels={channels.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      availableTags={tags}
    />
  );
}
