import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfig, updateConfig, saveConfig } from "../config.js";
import { setSessionId } from "../auth/session.js";
import { startOAuthFlow } from "../auth/oauth.js";

export function registerConfigTools(server: McpServer): void {
  server.tool(
    "get_config",
    "Show current POE2 tool configuration (league, auth status, account)",
    {},
    async () => {
      const config = getConfig();
      const status = {
        league: config.league,
        realm: config.realm,
        accountName: config.accountName,
        authMethod: config.oauthAccessToken
          ? "OAuth"
          : config.sessionId
            ? "POESESSID"
            : "Not authenticated",
        oauthExpiry: config.oauthExpiresAt
          ? new Date(config.oauthExpiresAt).toISOString()
          : null,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }],
      };
    }
  );

  server.tool(
    "set_league",
    "Set the active POE2 league (e.g. 'Fate of the Vaal')",
    {
      league: z.string().describe("The league name"),
    },
    async ({ league }) => {
      updateConfig({ league });
      await saveConfig();
      return {
        content: [{ type: "text" as const, text: `League set to: ${league}` }],
      };
    }
  );

  server.tool(
    "set_session_id",
    "Set POESESSID cookie for authentication. Get it from your browser: pathofexile.com → DevTools (F12) → Application → Cookies → POESESSID",
    {
      session_id: z.string().describe("The POESESSID cookie value"),
    },
    async ({ session_id }) => {
      await setSessionId(session_id);
      return {
        content: [{ type: "text" as const, text: "Session ID set successfully. You can now access your stash and character data." }],
      };
    }
  );

  server.tool(
    "set_account_name",
    "Set your POE account name (needed for some API endpoints)",
    {
      account_name: z.string().describe("Your POE account name"),
    },
    async ({ account_name }) => {
      updateConfig({ accountName: account_name });
      await saveConfig();
      return {
        content: [{ type: "text" as const, text: `Account name set to: ${account_name}` }],
      };
    }
  );

  server.tool(
    "start_oauth",
    "Start OAuth authentication flow. Requires a registered OAuth client ID. Opens a browser for authorization.",
    {
      client_id: z.string().describe("Your OAuth client ID from pathofexile.com/developer"),
      port: z.number().default(8655).describe("Local port for OAuth callback (default: 8655)"),
    },
    async ({ client_id, port }) => {
      try {
        const authUrl = await startOAuthFlow(client_id, port);
        return {
          content: [
            {
              type: "text" as const,
              text: `Open this URL in your browser to authenticate:\n\n${authUrl}\n\nWaiting for callback on port ${port}...`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `OAuth error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
