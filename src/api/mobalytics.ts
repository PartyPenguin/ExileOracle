import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MOBALYTICS_GRAPHQL = "https://mobalytics.gg/api/poe-2/v1/graphql/query";
const USER_AGENT = "PoeTool/1.0 (poe2-mcp-server)";

export interface MobalyticsBuild {
  name: string;
  slug: string;
  author: string;
  class: string;
  ascendancy: string;
  tags: string[];
  variants: MobalyticsVariant[];
  pobCode?: string;
}

export interface MobalyticsVariant {
  id: string;
  title: string;
  equipment: MobalyticsEquipment;
  skills: MobalyticsSkillGroup[];
  passiveTree: {
    mainNodes: string[];
    ascendancyNodes: string[];
  };
}

export interface MobalyticsEquipment {
  [slot: string]: MobalyticsItem | undefined;
}

export interface MobalyticsItem {
  name: string;
  slug: string;
  isUnique: boolean;
  icon?: string;
  itemClass?: string;
  explicitMods: string[];
  implicitMods: string[];
  runes?: Array<{ slug: string; icon?: string }>;
}

export interface MobalyticsSkillGroup {
  name: string;
  icon?: string;
  gemIcon?: string;
  level?: number;
  weaponSet?: string;
  supports: Array<{
    slug: string;
    icon?: string;
    type?: string;
  }>;
}

let cachedQuery: string | null = null;

async function getGraphQLQuery(): Promise<string> {
  if (cachedQuery) return cachedQuery;

  const currentDir = dirname(fileURLToPath(import.meta.url));
  // In compiled output, we're in dist/api/, data file is in dist/data/ or src/data/
  const paths = [
    join(currentDir, "..", "data", "mobalytics-graphql-query.json"),
    join(currentDir, "..", "..", "src", "data", "mobalytics-graphql-query.json"),
  ];

  for (const path of paths) {
    try {
      const content = await readFile(path, "utf-8");
      const parsed = JSON.parse(content);
      cachedQuery = parsed.query;
      return cachedQuery!;
    } catch {
      // Try next path
    }
  }

  throw new Error("Could not find mobalytics-graphql-query.json");
}

/**
 * Extract the build slug from a Mobalytics URL
 */
export function extractSlug(urlOrSlug: string): string {
  // Handle full URLs
  const match = urlOrSlug.match(/mobalytics\.gg\/poe-2\/builds\/([^?#/]+)/);
  if (match) return match[1];

  // Already a slug
  return urlOrSlug.trim();
}

/**
 * Fetch a build from Mobalytics by URL or slug
 */
export async function fetchMobalyticsBuild(urlOrSlug: string): Promise<MobalyticsBuild> {
  const slug = extractSlug(urlOrSlug);
  const query = await getGraphQLQuery();

  const response = await fetch(MOBALYTICS_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      operationName: "Poe2UgFeaturedDocumentQuery",
      variables: {
        input: {
          slug,
          type: "builds",
          widgetsOverride: [],
        },
      },
      query,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mobalytics API error (${response.status}): ${await response.text()}`);
  }

  const result = await response.json() as {
    data?: {
      game?: {
        documents?: {
          userGeneratedDocumentBySlug?: {
            data?: Record<string, unknown>;
            error?: string;
          };
        };
      };
    };
  };

  const doc = result.data?.game?.documents?.userGeneratedDocumentBySlug?.data;
  if (!doc) {
    const error = result.data?.game?.documents?.userGeneratedDocumentBySlug?.error;
    throw new Error(`Build not found: ${error ?? "unknown error"}`);
  }

  return parseMobalyticsDocument(doc, slug);
}

function parseMobalyticsDocument(doc: Record<string, unknown>, slug: string): MobalyticsBuild {
  const data = doc.data as Record<string, unknown> | undefined;
  const tags = doc.tags as { data?: Array<{ name: string; groupSlug: string; slug: string }> } | undefined;
  const author = doc.author as { name?: string } | undefined;

  // Extract class and ascendancy from tags
  let className = "";
  let ascendancy = "";
  const tagNames: string[] = [];

  if (tags?.data) {
    for (const tag of tags.data) {
      tagNames.push(tag.name);
      if (tag.groupSlug === "class") className = tag.name;
      if (tag.groupSlug === "ascendancy") ascendancy = tag.name;
    }
  }

  // Extract variant titles from content widget
  const variantTitles = new Map<string, string>();
  const content = doc.content as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(content)) {
    for (const widget of content) {
      if (
        widget.__typename === "NgfDocumentCmWidgetContentVariantsV1" &&
        (widget.data as Record<string, unknown>)?.childrenVariants
      ) {
        const children = (widget.data as Record<string, unknown>).childrenVariants as Array<{
          id: string;
          title: string;
        }>;
        for (const child of children) {
          variantTitles.set(child.id, child.title);
        }
      }
    }
  }

  // Parse build variants
  const variants: MobalyticsVariant[] = [];
  const buildVariants = (data as Record<string, unknown>)?.buildVariants as {
    values?: Array<Record<string, unknown>>;
  } | undefined;

  if (buildVariants?.values) {
    for (const variant of buildVariants.values) {
      const parsed = parseVariant(variant);
      // Override title with the content widget title if available
      const widgetTitle = variantTitles.get(parsed.id);
      if (widgetTitle) parsed.title = widgetTitle;
      variants.push(parsed);
    }
  }

  return {
    name: (data as Record<string, unknown>)?.name as string ?? slug,
    slug,
    author: author?.name ?? "Unknown",
    class: className,
    ascendancy,
    tags: tagNames,
    variants,
    pobCode: (data as Record<string, unknown>)?.pobCode as string | undefined,
  };
}

function parseVariant(variant: Record<string, unknown>): MobalyticsVariant {
  const id = variant.id as string ?? "";

  // Parse equipment
  const equipment: MobalyticsEquipment = {};
  const equipData = variant.equipment as Record<string, unknown> | undefined;

  if (equipData) {
    const slots = [
      "amulet", "belt", "body", "boots", "flask1", "flask2",
      "charm1", "charm2", "charm3", "gloves", "helmet",
      "leftRing", "rightRing", "extraRing", "mainHand", "offHand",
    ];

    for (const slot of slots) {
      const slotData = equipData[slot] as Record<string, unknown> | undefined;
      if (!slotData) continue;

      // mainHand and offHand have set1/set2
      if (slot === "mainHand" || slot === "offHand") {
        const set1 = slotData.set1 as Record<string, unknown> | undefined;
        if (set1?.commonItem) {
          equipment[`${slot} (Set 1)`] = parseItem(set1.commonItem as Record<string, unknown>, set1.runes);
        }
        const set2 = slotData.set2 as Record<string, unknown> | undefined;
        if (set2?.commonItem) {
          equipment[`${slot} (Set 2)`] = parseItem(set2.commonItem as Record<string, unknown>, set2.runes);
        }
      } else {
        const commonItem = slotData.commonItem as Record<string, unknown> | undefined;
        if (commonItem) {
          equipment[slot] = parseItem(commonItem, slotData.runes);
        }
      }
    }
  }

  // Parse skill gems
  const skills: MobalyticsSkillGroup[] = [];
  const skillData = variant.skillGems as { gems?: Array<Record<string, unknown>> } | undefined;

  if (skillData?.gems) {
    for (const gem of skillData.gems) {
      const activeSkill = gem.activeSkill as Record<string, unknown> | undefined;
      if (!activeSkill) continue;

      const supports: MobalyticsSkillGroup["supports"] = [];
      const subSkills = gem.subSkills as Array<Record<string, unknown>> | undefined;
      if (subSkills) {
        for (const sub of subSkills) {
          supports.push({
            slug: sub.gemSlug as string ?? "",
            icon: sub.iconURL as string | undefined,
            type: sub.gemType as string | undefined,
          });
        }
      }

      skills.push({
        name: activeSkill.name as string ?? "",
        icon: activeSkill.iconURL as string | undefined,
        gemIcon: activeSkill.gemIconURL as string | undefined,
        level: activeSkill.level as number | undefined,
        weaponSet: gem.weaponSet as string | undefined,
        supports,
      });
    }
  }

  // Parse passive tree
  const passiveData = variant.passiveTree as Record<string, unknown> | undefined;
  const mainTree = passiveData?.mainTree as { selectedSlugs?: string[] } | undefined;
  const ascTree = passiveData?.ascendancyTree as { selectedSlugs?: string[] } | undefined;

  return {
    id,
    title: `Variant ${id}`,
    equipment,
    skills,
    passiveTree: {
      mainNodes: mainTree?.selectedSlugs ?? [],
      ascendancyNodes: ascTree?.selectedSlugs ?? [],
    },
  };
}

function parseItem(
  commonItem: Record<string, unknown>,
  runesData?: unknown
): MobalyticsItem {
  const explicitDescs = commonItem.explicitDescriptions as Array<{ description: string }> | undefined;
  const implicitDescs = commonItem.implicitDescriptions as Array<{ description: string }> | undefined;
  const runesArray = runesData as Array<{ slug: string; iconUrl?: string }> | undefined;

  return {
    name: commonItem.name as string ?? "",
    slug: commonItem.slug as string ?? "",
    isUnique: commonItem.isUnique as boolean ?? false,
    icon: commonItem.iconURL as string | undefined,
    itemClass: commonItem.itemClassSlug as string | undefined,
    explicitMods: explicitDescs?.map((d) => d.description) ?? [],
    implicitMods: implicitDescs?.map((d) => d.description) ?? [],
    runes: runesArray?.map((r) => ({ slug: r.slug, icon: r.iconUrl })),
  };
}

/**
 * Format a Mobalytics build for display
 */
export function formatMobalyticsBuild(build: MobalyticsBuild, variantIndex = 0): string {
  const lines: string[] = [];

  lines.push(`Build: ${build.name}`);
  lines.push(`Author: ${build.author}`);
  lines.push(`Class: ${build.class}${build.ascendancy ? ` (${build.ascendancy})` : ""}`);
  lines.push(`Tags: ${build.tags.join(", ")}`);

  // List all variants
  if (build.variants.length > 1) {
    lines.push(`\nVariants (${build.variants.length}):`);
    for (let i = 0; i < build.variants.length; i++) {
      const marker = i === variantIndex ? " <-- showing" : "";
      lines.push(`  [${i}] ${build.variants[i].title}${marker}`);
    }
  }

  const variant = build.variants[variantIndex];
  if (!variant) return lines.join("\n");

  lines.push(`\n--- ${variant.title} (variant ${variantIndex}) ---`);

  // Equipment
  const equippedSlots = Object.entries(variant.equipment).filter(([, v]) => v);
  if (equippedSlots.length > 0) {
    lines.push("\nEquipment:");
    for (const [slot, item] of equippedSlots) {
      if (!item) continue;
      const unique = item.isUnique ? " [Unique]" : "";
      lines.push(`  ${slot}: ${item.name}${unique}`);
      for (const mod of item.explicitMods.slice(0, 3)) {
        lines.push(`    - ${mod}`);
      }
    }
  }

  // Skills
  if (variant.skills.length > 0) {
    lines.push("\nSkills:");
    for (const skill of variant.skills) {
      const supList = skill.supports.map((s) => s.slug).join(", ");
      lines.push(`  ${skill.name}${skill.level ? ` (Lv${skill.level})` : ""}`);
      if (supList) lines.push(`    Supports: ${supList}`);
    }
  }

  // Passive tree summary
  const mainCount = variant.passiveTree.mainNodes.length;
  const ascCount = variant.passiveTree.ascendancyNodes.length;
  if (mainCount > 0) {
    lines.push(`\nPassive Tree: ${mainCount} nodes, ${ascCount} ascendancy nodes`);
  }

  if (build.pobCode) {
    lines.push(`\nPoB Code available (use decode_pob_xml to inspect)`);
  }

  return lines.join("\n");
}
