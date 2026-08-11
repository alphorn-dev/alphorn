import { redirect, notFound } from "next/navigation";
import { getMemberRole } from "@/lib/auth/server";
import { getChannelById } from "../../actions";
import EditChannelForm from "./edit-channel-form";

export default async function EditChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Check role before fetching: getChannelById returns the config (credentials)
  // and is admin-gated, so a member must be redirected before it is called.
  const role = await getMemberRole();
  if (!role || !["owner", "admin"].includes(role)) {
    redirect("/channels");
  }
  const channel = await getChannelById(id);
  if (!channel) {
    notFound();
  }

  return (
    <EditChannelForm
      appUrl={process.env.BETTER_AUTH_URL!}
      initialChannel={{
        id: channel.id,
        name: channel.name,
        type: channel.type,
        config: channel.config as Record<string, unknown>,
        enabled: channel.enabled,
        publicId: channel.publicId,
      }}
    />
  );
}
