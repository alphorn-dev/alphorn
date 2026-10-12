import { getMessagesForOrg, getAllTagsForOrg, getWebhooksForSend } from "./actions";
import type { MessageFilters } from "./actions";
import { SendMessageDialog } from "./send-message-dialog";
import { MessagesTable } from "./messages-table";
import { getMemberRole } from "@/lib/auth/server";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<MessageFilters>;
}) {
  const params = await searchParams;
  const [result, allTags, webhooks, role] = await Promise.all([
    getMessagesForOrg(params),
    getAllTagsForOrg(),
    getWebhooksForSend(),
    getMemberRole(),
  ]);
  const isAdminOrOwner = role === "owner" || role === "admin";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View your notification message history.
          </p>
        </div>
        {isAdminOrOwner && <SendMessageDialog />}
      </div>

      <MessagesTable
        messages={result.messages}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        allTags={allTags}
        webhooks={webhooks}
        filters={params}
      />
    </div>
  );
}
