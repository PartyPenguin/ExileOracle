import { getConfig } from "../config.js";
import { poeApiFetch, poeSessionFetch, isOAuth } from "./client.js";

export interface StashTab {
  id: string;
  name: string;
  type: string;
  index: number;
  /** Original tab index from the API (the "i" field) */
  i?: number;
  /** Original tab name from the API (the "n" field) */
  n?: string;
  children?: StashTab[];
}

export interface StashItem {
  id: string;
  name: string;
  typeLine: string;
  baseType: string;
  rarity?: string;
  frameType: number;
  itemLevel?: number;
  identified: boolean;
  corrupted?: boolean;
  icon: string;
  w: number;
  h: number;
  x: number;
  y: number;
  inventoryId: string;
  league: string;
  implicitMods?: string[];
  explicitMods?: string[];
  craftedMods?: string[];
  enchantMods?: string[];
  fracturedMods?: string[];
  properties?: Array<{ name: string; values: [string, number][] }>;
  requirements?: Array<{ name: string; values: [string, number][] }>;
  sockets?: Array<{ group: number; attr: string }>;
  socketedItems?: StashItem[];
  [key: string]: unknown;
}

export interface StashResponse {
  stash: {
    id: string;
    name: string;
    type: string;
    items: StashItem[];
    children?: StashTab[];
  };
}

export async function listStashTabs(): Promise<StashTab[]> {
  const config = getConfig();

  if (isOAuth()) {
    const { status, data } = await poeApiFetch(
      `/stash/${config.realm}/${encodeURIComponent(config.league)}`
    );
    if (status !== 200) {
      throw new Error(`Failed to list stash tabs (${status}): ${JSON.stringify(data)}`);
    }
    const response = data as { stashes: StashTab[] };
    return response.stashes ?? [];
  }

  // Session-based: use character-window endpoint to discover tabs
  if (!config.accountName) {
    throw new Error("Account name required for session auth. Use set_account_name tool first.");
  }

  const { status, data } = await poeSessionFetch("/character-window/get-stash-items", {
    accountName: config.accountName,
    league: config.league,
    realm: config.realm,
    tabs: "1",
    tabIndex: "0",
  });

  if (status !== 200) {
    throw new Error(`Failed to list stash tabs (${status}): ${JSON.stringify(data)}`);
  }

  const response = data as { tabs: Array<StashTab & { i?: number; n?: string }>; numTabs: number };
  return (response.tabs ?? []).map((tab, idx) => ({
    ...tab,
    name: tab.n ?? tab.name ?? `Tab ${idx}`,
    id: tab.id ?? String(tab.i ?? idx),
    index: tab.i ?? tab.index ?? idx,
  }));
}

export async function getStashContents(stashId: string, substashId?: string): Promise<StashResponse> {
  const config = getConfig();

  if (isOAuth()) {
    let path = `/stash/${config.realm}/${encodeURIComponent(config.league)}/${stashId}`;
    if (substashId) {
      path += `/${substashId}`;
    }
    const { status, data } = await poeApiFetch(path);
    if (status !== 200) {
      throw new Error(`Failed to get stash contents (${status}): ${JSON.stringify(data)}`);
    }
    return data as StashResponse;
  }

  // Session-based: use character-window endpoint with tabIndex
  if (!config.accountName) {
    throw new Error("Account name required for session auth. Use set_account_name tool first.");
  }

  // Resolve stashId: if it's not a number, look up the tab index by hash ID
  let tabIndex = stashId;
  let tabName = `Tab ${stashId}`;
  if (!/^\d+$/.test(stashId)) {
    const tabs = await listStashTabs();
    const tab = tabs.find((t) => t.id === stashId);
    if (tab) {
      tabIndex = String(tab.index);
      tabName = tab.name;
    } else {
      throw new Error(`Stash tab with ID "${stashId}" not found. Use list_stash_tabs to see available tabs.`);
    }
  }

  const { status, data } = await poeSessionFetch("/character-window/get-stash-items", {
    accountName: config.accountName,
    league: config.league,
    realm: config.realm,
    tabs: "0",
    tabIndex,
  });

  if (status !== 200) {
    throw new Error(`Failed to get stash contents (${status}): ${JSON.stringify(data)}`);
  }

  const response = data as { items: StashItem[]; tabs?: StashTab[] };
  return {
    stash: {
      id: stashId,
      name: tabName,
      type: "NormalStash",
      items: response.items ?? [],
    },
  };
}

export async function searchStashItems(
  query: string,
  field: "name" | "baseType" | "mods" = "mods"
): Promise<Array<StashItem & { stashTabName: string }>> {
  const tabs = await listStashTabs();
  const results: Array<StashItem & { stashTabName: string }> = [];
  const queryLower = query.toLowerCase();

  for (const tab of tabs) {
    try {
      // Use numeric index for session mode, hash ID for OAuth
      const tabId = isOAuth() ? (tab.id ?? String(tab.index)) : String(tab.index);
      const { stash } = await getStashContents(tabId);
      for (const item of stash.items ?? []) {
        let matches = false;

        if (field === "name") {
          matches =
            item.name?.toLowerCase().includes(queryLower) ||
            item.typeLine?.toLowerCase().includes(queryLower);
        } else if (field === "baseType") {
          matches = (item.baseType ?? item.typeLine)?.toLowerCase().includes(queryLower);
        } else {
          const allMods = [
            ...(item.implicitMods ?? []),
            ...(item.explicitMods ?? []),
            ...(item.craftedMods ?? []),
            ...(item.enchantMods ?? []),
          ];
          matches = allMods.some((mod) => mod.toLowerCase().includes(queryLower));
        }

        if (matches) {
          results.push({ ...item, stashTabName: tab.name ?? stash.name });
        }
      }
    } catch {
      // Skip tabs that error
    }
  }

  return results;
}
