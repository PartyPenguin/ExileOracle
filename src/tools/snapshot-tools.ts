import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  takeSnapshot,
  listSnapshots,
  loadSnapshot,
  diffSnapshots,
  formatDiff,
} from "../api/stash-snapshot.js";

export function registerSnapshotTools(server: McpServer): void {
  server.tool(
    "snapshot_stash",
    "Take a snapshot of all stash tabs for later comparison. Saves items to disk so you can track changes over time.",
    {},
    async () => {
      try {
        const snapshot = await takeSnapshot();
        return {
          content: [
            {
              type: "text" as const,
              text: `Snapshot saved!\n  Timestamp: ${snapshot.timestamp}\n  League: ${snapshot.league}\n  Tabs: ${snapshot.tabs.length}\n  Total items: ${snapshot.totalItems}`,
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
    "list_snapshots",
    "List all saved stash snapshots with timestamps and item counts",
    {},
    async () => {
      try {
        const snapshots = await listSnapshots();
        if (snapshots.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No snapshots found. Use snapshot_stash to take your first snapshot.",
              },
            ],
          };
        }

        const lines = ["Saved snapshots:\n"];
        for (const s of snapshots) {
          lines.push(`  ${s.timestamp} — ${s.league} — ${s.totalItems} items (${s.filename})`);
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
    "diff_stash",
    "Compare two stash snapshots and show what items were added or removed. If no filenames given, compares the two most recent snapshots.",
    {
      older_snapshot: z
        .string()
        .optional()
        .describe("Filename of the older snapshot (from list_snapshots)"),
      newer_snapshot: z
        .string()
        .optional()
        .describe("Filename of the newer snapshot (from list_snapshots)"),
    },
    async ({ older_snapshot, newer_snapshot }) => {
      try {
        const snapshots = await listSnapshots();

        if (snapshots.length < 2 && !older_snapshot) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Need at least 2 snapshots to compare. Use snapshot_stash to take snapshots.",
              },
            ],
          };
        }

        const older = await loadSnapshot(older_snapshot ?? snapshots[1].filename);
        const newer = await loadSnapshot(newer_snapshot ?? snapshots[0].filename);

        const diff = await diffSnapshots(older, newer);
        return {
          content: [{ type: "text" as const, text: formatDiff(diff) }],
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
