import { redirect } from "next/navigation";
import { getMemberRole } from "@/lib/auth/server";
import NewChannelForm from "./new-channel-form";

export default async function NewChannelPage() {
  const role = await getMemberRole();
  if (!role || !["owner", "admin"].includes(role)) {
    redirect("/channels");
  }

  return <NewChannelForm appUrl={process.env.BETTER_AUTH_URL!} />;
}
