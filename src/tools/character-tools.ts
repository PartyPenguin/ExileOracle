import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listCharacters, getCharacterEquipment } from "../api/character.js";

export function registerCharacterTools(server: McpServer): void {
  server.tool(
    "list_characters",
    "List all POE2 characters on the account (name, class, level, league)",
    {},
    async () => {
      try {
        const characters = await listCharacters();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(characters, null, 2),
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
    "get_character_equipment",
    "Get all equipped items for a specific character",
    {
      character_name: z.string().describe("The character name"),
    },
    async ({ character_name }) => {
      try {
        const result = await getCharacterEquipment(character_name);
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
}
