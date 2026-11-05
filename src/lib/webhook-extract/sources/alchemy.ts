import {
  resolvePath,
  str,
  num,
  list,
  lines,
  tags,
  MAX_LIST_ITEMS,
  type AutoSource,
  type Body,
  type AutoResult,
} from "./util";

function shortHex(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function tokenId(hex: string): string {
  try {
    return BigInt(hex).toString();
  } catch {
    // Not a valid hex/decimal string in an untrusted payload.
    return hex;
  }
}

// "10000 USDC", "NFT #7915", or the contract address when no symbol is known.
function alchemyAmount(a: unknown): string {
  const asset = str(a, "asset") || shortHex(str(a, "rawContract.address") || str(a, "contractAddress"));
  const nftId = str(a, "erc721TokenId");
  if (nftId) return `${asset} #${tokenId(nftId)}`;
  const erc1155 = list(a, "erc1155Metadata");
  if (erc1155.length > 0) {
    return `${asset} ${erc1155.map((m) => `#${tokenId(str(m, "tokenId"))}`).join(", ")}`;
  }
  const value = num(a, "value");
  return value !== null ? `${value} ${asset}` : asset;
}

function alchemy(body: Body): AutoResult {
  const type = str(body, "type");
  const network = str(body, "event.network");
  const baseTags = ["alchemy", type.toLowerCase(), network.toLowerCase()];

  if (type === "ADDRESS_ACTIVITY" || type === "NFT_ACTIVITY") {
    const activity = list(body, "event.activity");
    // log.removed: the transfer was dropped in a chain reorg.
    const reorged = activity.some((a) => resolvePath(a, "log.removed") === true);
    const transfer = (a: unknown) =>
      `${alchemyAmount(a)} ${shortHex(str(a, "fromAddress"))} → ${shortHex(str(a, "toAddress"))}`;
    const itemLines = activity.slice(0, MAX_LIST_ITEMS).map(
      (a) => `- ${transfer(a)}\n  tx ${str(a, "hash")}`
    );
    if (activity.length > MAX_LIST_ITEMS) {
      itemLines.push(`… and ${activity.length - MAX_LIST_ITEMS} more`);
    }
    const summary =
      activity.length === 1 ? transfer(activity[0]) : `${activity.length} transfers`;
    return {
      title: `${reorged ? "Reorg: " : ""}[${network || "Alchemy"}] ${summary}`,
      message: lines(...itemLines),
      priority: reorged ? 4 : null,
      tags: tags(...baseTags, ...activity.map((a) => str(a, "asset").toLowerCase())),
    };
  }

  if (type === "GRAPHQL") {
    const hashes = [
      ...new Set(
        list(body, "event.data.block.logs").map((l) => str(l, "transaction.hash")).filter(Boolean)
      ),
    ];
    return {
      title: `Alchemy custom webhook: ${hashes.length} transaction${hashes.length === 1 ? "" : "s"}`,
      message: lines(...hashes.slice(0, MAX_LIST_ITEMS).map((h) => `- tx ${h}`)),
      priority: null,
      tags: tags(...baseTags),
    };
  }

  return {
    title: `Alchemy: ${type.replace(/_/g, " ").toLowerCase()}`,
    message: "",
    priority: null,
    tags: tags(...baseTags),
  };
}

export const alchemySource: AutoSource = {
  id: "alchemy",
  detect: (body, headers) =>
    Boolean(headers["x-alchemy-signature"]) ||
    (str(body, "webhookId").startsWith("wh_") && typeof body.event === "object"),
  extract: (body) => alchemy(body),
};
