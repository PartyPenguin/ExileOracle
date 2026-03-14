import { getConfig } from "../config.js";

const POE2SCOUT_BASE = "https://poe2scout.com/api";
const USER_AGENT = "PoeTool/1.0 (poe2-mcp-server)";

export interface PriceEntry {
  name: string;
  chaosValue: number;
  volume: number;
  icon?: string;
  category: string;
  apiId?: string;
}

export interface PriceData {
  league: string;
  fetchedAt: Date;
  currency: Map<string, PriceEntry>;
  items: Map<string, PriceEntry>;
}

let priceCache: PriceData | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch all POE2 prices from poe2scout.com API
 */
export async function fetchPrices(forceRefresh = false): Promise<PriceData> {
  if (priceCache && !forceRefresh && Date.now() - priceCache.fetchedAt.getTime() < CACHE_TTL) {
    return priceCache;
  }

  const config = getConfig();
  const league = config.league;
  const currency = new Map<string, PriceEntry>();
  const items = new Map<string, PriceEntry>();

  // Fetch currency categories
  const currencyCategories = [
    "currency",
    "fragments",
    "runes",
    "essences",
    "ritual",
    "ultimatum",
    "expedition",
    "breach",
    "delirium",
    "uncutgems",
    "lineagesupportgems",
    "talismans",
    "vaultkeys",
    "abyss",
    "incursion",
    "idol",
  ];

  for (const cat of currencyCategories) {
    try {
      const data = await fetchScoutEndpoint(
        `/items/currency/${cat}?league=${encodeURIComponent(league)}&perPage=100`
      );
      if (data?.items) {
        for (const item of data.items as ScoutCurrencyItem[]) {
          const entry: PriceEntry = {
            name: item.text,
            chaosValue: item.currentPrice ?? 0,
            volume: item.priceLogs?.[0]?.quantity ?? 0,
            icon: item.iconUrl,
            category: cat,
            apiId: item.apiId,
          };
          currency.set(item.text.toLowerCase(), entry);
        }
        // Fetch additional pages if needed
        const pages = (data as { pages?: number }).pages ?? 1;
        for (let page = 2; page <= pages; page++) {
          const pageData = await fetchScoutEndpoint(
            `/items/currency/${cat}?league=${encodeURIComponent(league)}&perPage=100&page=${page}`
          );
          if (pageData?.items) {
            for (const item of pageData.items as ScoutCurrencyItem[]) {
              const entry: PriceEntry = {
                name: item.text,
                chaosValue: item.currentPrice ?? 0,
                volume: item.priceLogs?.[0]?.quantity ?? 0,
                icon: item.iconUrl,
                category: cat,
                apiId: item.apiId,
              };
              currency.set(item.text.toLowerCase(), entry);
            }
          }
        }
      }
    } catch {
      // Skip failed categories
    }
  }

  // Fetch unique item categories
  const uniqueCategories = ["weapon", "armour", "accessory", "flask", "jewel", "map", "sanctum"];

  for (const cat of uniqueCategories) {
    try {
      const data = await fetchScoutEndpoint(
        `/items/unique/${cat}?league=${encodeURIComponent(league)}&perPage=100`
      );
      if (data?.items) {
        for (const item of data.items as ScoutUniqueItem[]) {
          const name = item.name || item.text || "";
          const entry: PriceEntry = {
            name,
            chaosValue: item.currentPrice ?? 0,
            volume: item.priceLogs?.[0]?.quantity ?? 0,
            icon: item.iconUrl,
            category: `unique_${cat}`,
            apiId: item.apiId,
          };
          items.set(name.toLowerCase(), entry);
        }
        const pages = (data as { pages?: number }).pages ?? 1;
        for (let page = 2; page <= pages; page++) {
          const pageData = await fetchScoutEndpoint(
            `/items/unique/${cat}?league=${encodeURIComponent(league)}&perPage=100&page=${page}`
          );
          if (pageData?.items) {
            for (const item of pageData.items as ScoutUniqueItem[]) {
              const name = item.name || item.text || "";
              const entry: PriceEntry = {
                name,
                chaosValue: item.currentPrice ?? 0,
                volume: item.priceLogs?.[0]?.quantity ?? 0,
                icon: item.iconUrl,
                category: `unique_${cat}`,
                apiId: item.apiId,
              };
              items.set(name.toLowerCase(), entry);
            }
          }
        }
      }
    } catch {
      // Skip failed categories
    }
  }

  priceCache = {
    league,
    fetchedAt: new Date(),
    currency,
    items,
  };

  return priceCache;
}

interface ScoutCurrencyItem {
  text: string;
  currentPrice: number | null;
  iconUrl?: string;
  apiId?: string;
  priceLogs?: Array<{ price: number; quantity: number; time: string } | null>;
}

interface ScoutUniqueItem {
  name?: string;
  text?: string;
  currentPrice: number | null;
  iconUrl?: string;
  apiId?: string;
  priceLogs?: Array<{ price: number; quantity: number; time: string } | null>;
}

async function fetchScoutEndpoint(path: string): Promise<Record<string, unknown> | null> {
  const url = `${POE2SCOUT_BASE}${path}`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) return null;

  const text = await response.text();
  if (!text.startsWith("{") && !text.startsWith("[")) return null;

  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Fetch available leagues from poe2scout
 */
export async function fetchLeagues(): Promise<
  Array<{ value: string; divinePrice: number; chaosDivinePrice: number }>
> {
  const response = await fetch(`${POE2SCOUT_BASE}/leagues`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) return [];
  return (await response.json()) as Array<{
    value: string;
    divinePrice: number;
    chaosDivinePrice: number;
  }>;
}

/**
 * Look up the price of a specific item by name
 */
export function lookupPrice(prices: PriceData, itemName: string): PriceEntry | null {
  const key = itemName.toLowerCase();

  // Try exact match in currency first, then items
  const entry = prices.currency.get(key) ?? prices.items.get(key);
  if (entry) return entry;

  // Try partial match
  for (const [k, v] of prices.currency) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  for (const [k, v] of prices.items) {
    if (k.includes(key) || key.includes(k)) return v;
  }

  return null;
}

/**
 * Format a price entry for display
 */
export function formatPrice(entry: PriceEntry): string {
  return `${entry.name}: ${entry.chaosValue.toFixed(1)} chaos (volume: ${entry.volume}, category: ${entry.category})`;
}
