import Link from "next/link";
import { ChannelIcon } from "@/components/channel-icons";
import { StatusBadge } from "@/components/status-badge";

interface DeliverySummary {
  id: string;
  status: string;
  channel: { id: string; name: string; type: string };
}

/** One badge per delivery: channel icon + status, linking to the channel. */
export function DeliveryBadges({ deliveries }: { deliveries: DeliverySummary[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {deliveries.map((d) => (
        <Link
          key={d.id}
          href={`/channels/${d.channel.id}`}
          title={d.channel.name}
          aria-label={`${d.channel.name}: ${d.status.toLowerCase()}`}
        >
          <StatusBadge
            status={d.status}
            icon={<ChannelIcon icon={d.channel.type} data-icon="inline-start" className="size-3" />}
          />
        </Link>
      ))}
    </div>
  );
}
