import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { startClipboardPolling, stopClipboardPolling } from "./clipboard/monitor.js";
import { registerStashTools } from "./tools/stash-tools.js";
import { registerCharacterTools } from "./tools/character-tools.js";
import { registerClipboardTools } from "./tools/clipboard-tools.js";
import { registerConfigTools } from "./tools/config-tools.js";
import { registerPricingTools } from "./tools/pricing-tools.js";
import { registerBuildTools } from "./tools/build-tools.js";
import { registerSnapshotTools } from "./tools/snapshot-tools.js";
import { registerLeagueTools } from "./tools/league-tools.js";

async function main() {
  await loadConfig();

  const server = new McpServer({
    name: "poe2-inventory",
    version: "2.0.0",
  });

  registerConfigTools(server);
  registerStashTools(server);
  registerCharacterTools(server);
  registerClipboardTools(server);
  registerPricingTools(server);
  registerBuildTools(server);
  registerSnapshotTools(server);
  registerLeagueTools(server);

  startClipboardPolling();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", () => {
    stopClipboardPolling();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
