import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfig } from "../config.js";
import { listStashTabs, getStashContents, type StashItem } from "./stash.js";
import { isOAuth } from "./client.js";

const SNAPSHOT_DIR = join(homedir(), ".poe-tool", "snapshots");

export interface StashSnapshot {
  timestamp: string;
  league: string;
  accountName: string;
  tabs: Array<{
    name: string;
    index: number;
    items: StashItem[];
  }>;
  totalItems: number;
}

export interface StashDiff {
  added: Array<StashItem & { tabName: string }>;
  removed: Array<StashItem & { tabName: string }>;
  fromTimestamp: string;
  toTimestamp: string;
}

export async function takeSnapshot(): Promise<StashSnapshot> {
  const config = getConfig();
  if (!config.accountName) {
    throw new Error("Account name required. Use set_account_name tool first.");
  }

  const tabs = await listStashTabs();
  const snapshotTabs: StashSnapshot["tabs"] = [];
  let totalItems = 0;

  for (const tab of tabs) {
    try {
      const tabId = isOAuth() ? (tab.id ?? String(tab.index)) : String(tab.index);
      const { stash } = await getStashContents(tabId);
      const items = stash.items ?? [];
      totalItems += items.length;
      snapshotTabs.push({
        name: tab.name ?? tab.n ?? `Tab ${tab.index}`,
        index: tab.index,
        items,
      });
    } catch {
      // Skip erroring tabs
    }
  }

  const snapshot: StashSnapshot = {
    timestamp: new Date().toISOString(),
    league: config.league,
    accountName: config.accountName,
    tabs: snapshotTabs,
    totalItems,
  };

  // Save to disk
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const filename = `snapshot_${snapshot.timestamp.replace(/[:.]/g, "-")}.json`;
  await writeFile(join(SNAPSHOT_DIR, filename), JSON.stringify(snapshot));

  return snapshot;
}

export async function listSnapshots(): Promise<Array<{ filename: string; timestamp: string; league: string; totalItems: number }>> {
  try {
    const files = await readdir(SNAPSHOT_DIR);
    const snapshots: Array<{ filename: string; timestamp: string; league: string; totalItems: number }> = [];

    for (const file of files.filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(await readFile(join(SNAPSHOT_DIR, file), "utf-8")) as StashSnapshot;
        snapshots.push({
          filename: file,
          timestamp: data.timestamp,
          league: data.league,
          totalItems: data.totalItems,
        });
      } catch {
        // Skip corrupted files
      }
    }

    return snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

export async function loadSnapshot(filename: string): Promise<StashSnapshot> {
  const data = await readFile(join(SNAPSHOT_DIR, filename), "utf-8");
  return JSON.parse(data) as StashSnapshot;
}

export async function diffSnapshots(older: StashSnapshot, newer: StashSnapshot): Promise<StashDiff> {
  // Build maps of item IDs to items for both snapshots
  const oldItems = new Map<string, StashItem & { tabName: string }>();
  const newItems = new Map<string, StashItem & { tabName: string }>();

  for (const tab of older.tabs) {
    for (const item of tab.items) {
      if (item.id) {
        oldItems.set(item.id, { ...item, tabName: tab.name });
      }
    }
  }

  for (const tab of newer.tabs) {
    for (const item of tab.items) {
      if (item.id) {
        newItems.set(item.id, { ...item, tabName: tab.name });
      }
    }
  }

  const added: Array<StashItem & { tabName: string }> = [];
  const removed: Array<StashItem & { tabName: string }> = [];

  // Items in new but not in old = added
  for (const [id, item] of newItems) {
    if (!oldItems.has(id)) {
      added.push(item);
    }
  }

  // Items in old but not in new = removed
  for (const [id, item] of oldItems) {
    if (!newItems.has(id)) {
      removed.push(item);
    }
  }

  return {
    added,
    removed,
    fromTimestamp: older.timestamp,
    toTimestamp: newer.timestamp,
  };
}

export function formatDiff(diff: StashDiff): string {
  const lines: string[] = [];
  lines.push(`Stash changes from ${diff.fromTimestamp} to ${diff.toTimestamp}:`);

  if (diff.added.length === 0 && diff.removed.length === 0) {
    lines.push("  No changes detected.");
    return lines.join("\n");
  }

  if (diff.added.length > 0) {
    lines.push(`\n  +${diff.added.length} items added:`);
    for (const item of diff.added.slice(0, 20)) {
      const name = item.name ? `${item.name} ${item.typeLine}` : item.typeLine;
      lines.push(`    + ${name} (in ${item.tabName})`);
    }
    if (diff.added.length > 20) {
      lines.push(`    ... and ${diff.added.length - 20} more`);
    }
  }

  if (diff.removed.length > 0) {
    lines.push(`\n  -${diff.removed.length} items removed:`);
    for (const item of diff.removed.slice(0, 20)) {
      const name = item.name ? `${item.name} ${item.typeLine}` : item.typeLine;
      lines.push(`    - ${name} (was in ${item.tabName})`);
    }
    if (diff.removed.length > 20) {
      lines.push(`    ... and ${diff.removed.length - 20} more`);
    }
  }

  return lines.join("\n");
}
