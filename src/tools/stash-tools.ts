import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listStashTabs, getStashContents, searchStashItems } from "../api/stash.js";

export function registerStashTools(server: McpServer): void {
  server.tool(
    "list_stash_tabs",
    "List all stash tabs in the current league (names, types, IDs)",
    {},
    async () => {
      try {
        const tabs = await listStashTabs();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(tabs, null, 2),
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
    "get_stash_items",
    "Get all items from a specific stash tab by its ID",
    {
      stash_id: z.string().describe("The stash tab ID (get from list_stash_tabs)"),
      substash_id: z.string().optional().describe("Optional sub-stash ID for folder tabs"),
    },
    async ({ stash_id, substash_id }) => {
      try {
        const result = await getStashContents(stash_id, substash_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
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
    "search_stash_items",
    "Search items across all stash tabs by name, base type, or mod text",
    {
      query: z.string().describe("Search query (e.g. 'life', 'Sapphire Ring', 'fire resistance')"),
      field: z
        .enum(["name", "baseType", "mods"])
        .default("mods")
        .describe("Which field to search: name, baseType, or mods (default: mods)"),
    },
    async ({ query, field }) => {
      try {
        const results = await searchStashItems(query, field);
        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} matching items:\n${JSON.stringify(results, null, 2)}`,
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
}
