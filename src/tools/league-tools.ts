import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listLeagues, getCurrentChallengeLeague } from "../api/leagues.js";
import { fetchLeagues } from "../api/pricing.js";
import { updateConfig, saveConfig } from "../config.js";

export function registerLeagueTools(server: McpServer): void {
  server.tool(
    "list_leagues",
    "List all active POE2 leagues. Combines data from the official API and poe2scout.com.",
    {},
    async () => {
      try {
        // Try both sources
        const results: string[] = [];

        try {
          const gggLeagues = await listLeagues();
          results.push("GGG API leagues:\n" + JSON.stringify(gggLeagues, null, 2));
        } catch {
          results.push("GGG API: unavailable (requires auth)");
        }

        try {
          const scoutLeagues = await fetchLeagues();
          results.push(
            "\npoe2scout.com leagues:\n" +
              scoutLeagues
                .map(
                  (l) =>
                    `  ${l.value} (Divine: ${l.divinePrice.toFixed(0)}c, Chaos/Divine: ${l.chaosDivinePrice.toFixed(1)})`
                )
                .join("\n")
          );
        } catch {
          results.push("\npoe2scout.com: unavailable");
        }

        return {
          content: [{ type: "text" as const, text: results.join("\n") }],
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
    "auto_detect_league",
    "Auto-detect and set the current POE2 challenge league. Checks both official API and poe2scout.com.",
    {},
    async () => {
      try {
        // Try GGG API first
        let leagueName: string | null = null;

        try {
          const league = await getCurrentChallengeLeague();
          if (league) leagueName = league.id;
        } catch {
          // GGG API unavailable, try poe2scout
        }

        // Fall back to poe2scout — pick the first non-standard/non-HC league
        if (!leagueName) {
          try {
            const scoutLeagues = await fetchLeagues();
            const challenge = scoutLeagues.find(
              (l) =>
                l.value !== "Standard" &&
                l.value !== "Hardcore" &&
                !l.value.startsWith("HC ")
            );
            if (challenge) leagueName = challenge.value;
          } catch {
            // Both sources failed
          }
        }

        if (!leagueName) leagueName = "Standard";

        updateConfig({ league: leagueName });
        await saveConfig();

        return {
          content: [
            {
              type: "text" as const,
              text: `League set to: ${leagueName}`,
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
