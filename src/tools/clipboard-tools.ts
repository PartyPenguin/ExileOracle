import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkClipboard, getLastClipboardItem } from "../clipboard/monitor.js";
import { getBuildContext, formatBuildContext } from "../api/build-context.js";
import type { ParsedItem } from "../parser/item-text.js";

// Collected items for comparison
const collectedItems: ParsedItem[] = [];

export function registerClipboardTools(server: McpServer): void {
  server.tool(
    "get_clipboard_item",
    "Read a POE2 item from clipboard (Ctrl+C an item in-game first). Returns parsed item data with mods, properties, requirements etc.",
    {},
    async () => {
      try {
        // Check clipboard for fresh data first
        await checkClipboard();
        const item = getLastClipboardItem();

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No POE2 item found in clipboard. In-game, hover over an item and press Ctrl+C to copy it, then try again.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(item, null, 2),
            },
          ],
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
    "collect_item",
    "Collect the current clipboard item for comparison. Ctrl+C an item in-game, then call this to add it to the collection. Call multiple times to collect several items, then use compare_collected_items to compare them all.",
    {
      label: z
        .string()
        .optional()
        .describe("Optional label for this item (e.g. 'Staff A', 'the one from stash tab 2')"),
    },
    async ({ label }) => {
      try {
        await checkClipboard();
        const item = getLastClipboardItem();

        if (!item) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No POE2 item found in clipboard. Hover over an item in-game and press Ctrl+C first.",
              },
            ],
          };
        }

        // Check for duplicate (same raw text as last collected)
        if (
          collectedItems.length > 0 &&
          collectedItems[collectedItems.length - 1].rawText === item.rawText
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: `This item is the same as the last collected one. Ctrl+C a different item and try again.\n\nCurrently collected: ${collectedItems.length} item(s)`,
              },
            ],
          };
        }

        collectedItems.push(item);
        const idx = collectedItems.length;
        const displayName = label || item.name || item.typeLine;

        return {
          content: [
            {
              type: "text" as const,
              text: `Collected item #${idx}: ${displayName} (${item.rarity} ${item.typeLine})\n\nTotal collected: ${idx} item(s)\n\nCtrl+C another item and call collect_item again, or call compare_collected_items when ready.`,
            },
          ],
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
    "compare_collected_items",
    "Compare all collected items side by side. If a build has been imported, also shows the build's recommended gear for the relevant slot. Use collect_item first to gather items.",
    {
      clear_after: z
        .boolean()
        .default(true)
        .describe("Clear the collection after comparison (default: true)"),
    },
    async ({ clear_after }) => {
      if (collectedItems.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No items collected yet. Use collect_item to add items first (Ctrl+C an item in-game, then call collect_item).",
            },
          ],
          isError: true,
        };
      }

      const lines: string[] = [];
      lines.push(`=== Comparing ${collectedItems.length} items ===\n`);

      // Show each collected item
      for (let i = 0; i < collectedItems.length; i++) {
        const item = collectedItems[i];
        lines.push(`--- Item #${i + 1}: ${item.name || item.typeLine} ---`);
        lines.push(`Rarity: ${item.rarity}`);
        lines.push(`Type: ${item.typeLine}`);
        if (item.itemLevel) lines.push(`Item Level: ${item.itemLevel}`);
        if (item.quality) lines.push(`Quality: +${item.quality}%`);

        // Properties (weapon damage, armour, etc.)
        if (item.properties.length > 0) {
          for (const prop of item.properties) {
            lines.push(`${prop.name}: ${prop.value}`);
          }
        }

        if (item.implicitMods.length > 0) {
          lines.push("Implicit:");
          for (const mod of item.implicitMods) lines.push(`  ${mod}`);
        }

        if (item.explicitMods.length > 0) {
          lines.push("Explicit:");
          for (const mod of item.explicitMods) lines.push(`  ${mod}`);
        }

        if (item.craftedMods.length > 0) {
          lines.push("Crafted:");
          for (const mod of item.craftedMods) lines.push(`  ${mod}`);
        }

        lines.push("");
      }

      // Show build context if available
      const build = getBuildContext();
      if (build) {
        // Try to detect the slot category from the collected items
        const firstType = (collectedItems[0].typeLine || "").toLowerCase();
        let slotFilter: string | undefined;

        const slotKeywords: Array<[string, string[]]> = [
          ["ring", ["ring"]],
          ["amulet", ["amulet", "pendant", "talisman", "choker", "locket"]],
          ["belt", ["belt", "sash", "stygian"]],
          ["helmet", ["helmet", "helm", "cap", "crown", "mask", "hood", "circlet", "burgonet", "cage"]],
          ["body", ["plate", "vest", "robe", "garb", "coat", "jacket", "vestment", "regalia", "brigandine", "chestplate", "tunic", "body armour"]],
          ["gloves", ["gloves", "gauntlets", "mitts", "wraps", "bracers"]],
          ["boots", ["boots", "greaves", "slippers", "shoes", "sabatons"]],
          ["weapon", ["sword", "axe", "mace", "sceptre", "staff", "bow", "wand", "dagger", "claw", "flail", "quarterstaff", "crossbow", "spear"]],
          ["shield", ["shield", "buckler"]],
          ["flask", ["flask"]],
        ];

        for (const [slot, keywords] of slotKeywords) {
          if (keywords.some((kw) => firstType.includes(kw))) {
            slotFilter = slot;
            break;
          }
        }

        lines.push("=== Build Reference ===");
        lines.push(formatBuildContext(build, slotFilter));
      } else {
        lines.push("(No build imported — use import_build to add build context for smarter comparisons)");
      }

      if (clear_after) {
        collectedItems.length = 0;
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  server.tool(
    "clear_collected_items",
    "Clear all collected items without comparing them.",
    {},
    async () => {
      const count = collectedItems.length;
      collectedItems.length = 0;
      return {
        content: [
          {
            type: "text" as const,
            text: `Cleared ${count} collected item(s).`,
          },
        ],
      };
    }
  );
}
