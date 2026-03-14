import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchPrices, lookupPrice, formatPrice } from "../api/pricing.js";

export function registerPricingTools(server: McpServer): void {
  server.tool(
    "price_check",
    "Look up the current price of a currency or item on poe.ninja. Returns chaos equivalent value and trade volume.",
    {
      item_name: z.string().describe("The item name to price check (e.g. 'Exalted Orb', 'Divine Orb')"),
    },
    async ({ item_name }) => {
      try {
        const prices = await fetchPrices();
        const entry = lookupPrice(prices, item_name);

        if (!entry) {
          // Try partial match
          const partial = [...prices.currency.values()].filter((e) =>
            e.name.toLowerCase().includes(item_name.toLowerCase())
          );
          if (partial.length > 0) {
            const results = partial.map(formatPrice).join("\n");
            return {
              content: [{ type: "text" as const, text: `No exact match for "${item_name}". Similar items:\n${results}` }],
            };
          }
          return {
            content: [{ type: "text" as const, text: `"${item_name}" not found on poe.ninja. Try a different name.` }],
          };
        }

        return {
          content: [{ type: "text" as const, text: formatPrice(entry) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "price_check_stash",
    "Calculate the total value of a stash tab using poe.ninja prices. Shows per-item breakdown.",
    {
      stash_id: z.string().describe("The stash tab ID or index to price check"),
    },
    async ({ stash_id }) => {
      try {
        // Import dynamically to avoid circular deps
        const { getStashContents } = await import("../api/stash.js");
        const { stash } = await getStashContents(stash_id);
        const prices = await fetchPrices();

        let totalChaos = 0;
        const valuedItems: Array<{ name: string; value: number; quantity: number }> = [];

        for (const item of stash.items) {
          const name = item.typeLine || item.baseType;
          const entry = lookupPrice(prices, name);
          if (entry) {
            const qty = (item as unknown as { stackSize?: number }).stackSize ?? 1;
            const value = entry.chaosValue * qty;
            totalChaos += value;
            valuedItems.push({ name: entry.name, value, quantity: qty });
          }
        }

        valuedItems.sort((a, b) => b.value - a.value);

        const lines = [`Stash tab "${stash.name}" value: ${totalChaos.toFixed(1)} chaos\n`];
        for (const item of valuedItems) {
          lines.push(`  ${item.name} x${item.quantity}: ${item.value.toFixed(1)}c`);
        }

        if (valuedItems.length === 0) {
          lines.push("  No priceable items found (poe.ninja only has currency data for POE2 currently).");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_prices",
    "List all available currency prices from poe.ninja for the current league",
    {},
    async () => {
      try {
        const prices = await fetchPrices();
        const entries = [...prices.currency.values()].sort((a, b) => b.chaosValue - a.chaosValue);
        const lines = [`Currency prices (${prices.league}, updated ${prices.fetchedAt.toISOString()}):\n`];
        for (const entry of entries) {
          lines.push(`  ${entry.name}: ${entry.chaosValue.toFixed(1)}c (vol: ${entry.volume})`);
        }
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
