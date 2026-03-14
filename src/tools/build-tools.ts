import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { importPoBCode, formatBuildSummary, decodePoBCode } from "../api/build-import.js";
import {
  fetchMobalyticsBuild,
  formatMobalyticsBuild,
  type MobalyticsBuild,
} from "../api/mobalytics.js";
import {
  setBuildContext,
  getBuildContext,
  normalizeSlotName,
  formatBuildContext,
  type BuildContext,
  type BuildEquipSlot,
  type BuildSkillInfo,
} from "../api/build-context.js";

// Store the last imported build so we can query different variants without re-fetching
let lastMobalyticsBuild: MobalyticsBuild | null = null;

/**
 * Convert a Mobalytics build into the normalized BuildContext
 */
function mobalyticsToContext(build: MobalyticsBuild, variantIndex: number): BuildContext {
  const variant = build.variants[variantIndex];
  const equipment: BuildEquipSlot[] = [];
  const skills: BuildSkillInfo[] = [];

  if (variant) {
    // Convert equipment
    for (const [slot, item] of Object.entries(variant.equipment)) {
      if (!item) continue;
      equipment.push({
        slot: normalizeSlotName(slot),
        name: item.name,
        isUnique: item.isUnique,
        mods: [...item.implicitMods, ...item.explicitMods],
        runes: item.runes?.map(r => r.slug),
      });
    }

    // Convert skills
    for (const skill of variant.skills) {
      skills.push({
        name: skill.name,
        supports: skill.supports.map(s => s.slug),
        weaponSet: skill.weaponSet,
      });
    }
  }

  return {
    source: "mobalytics",
    name: build.name,
    class: build.class,
    ascendancy: build.ascendancy,
    variant: variant?.title,
    equipment,
    skills,
    tags: build.tags,
  };
}

/**
 * Convert a PoB build into the normalized BuildContext
 */
function pobToContext(build: ReturnType<typeof importPoBCode>): BuildContext {
  const equipment: BuildEquipSlot[] = [];
  const skills: BuildSkillInfo[] = [];

  for (const item of build.items.filter(i => i.slot)) {
    equipment.push({
      slot: normalizeSlotName(item.slot),
      name: item.name || item.basetype,
      isUnique: item.rarity === "UNIQUE",
      mods: item.mods,
    });
  }

  for (const skill of build.skills.filter(s => s.enabled)) {
    const activeGem = skill.gems.find(g => g.enabled);
    if (activeGem) {
      skills.push({
        name: skill.label || activeGem.name,
        supports: skill.gems
          .filter(g => g.enabled && g.name !== activeGem.name)
          .map(g => g.name),
      });
    }
  }

  return {
    source: "pob",
    name: `${build.class} ${build.ascendancy}`.trim(),
    class: build.class,
    ascendancy: build.ascendancy,
    equipment,
    skills,
    tags: [],
  };
}

export function registerBuildTools(server: McpServer): void {
  server.tool(
    "import_build",
    "Import a build from a Mobalytics URL or a Path of Building (PoB) code. Returns a concise summary with equipment, skills, and passive tree. For Mobalytics builds with multiple variants, use the variant parameter to view a specific one.",
    {
      build_source: z
        .string()
        .describe(
          "Either a Mobalytics URL (e.g. https://mobalytics.gg/poe-2/builds/my-build) or a PoB export code (base64 string)"
        ),
      variant: z
        .number()
        .optional()
        .describe(
          "Which build variant to show in detail (0-indexed). If omitted, shows variant 0. Use list_variants first to see available variants."
        ),
    },
    async ({ build_source, variant }) => {
      try {
        // Detect if it's a Mobalytics URL
        if (
          build_source.includes("mobalytics.gg") ||
          build_source.match(/^[a-z0-9]+-[a-z0-9-]+$/)
        ) {
          const build = await fetchMobalyticsBuild(build_source);
          lastMobalyticsBuild = build;
          const variantIdx = variant ?? 0;
          const summary = formatMobalyticsBuild(build, variantIdx);

          // Store in shared build context
          setBuildContext(mobalyticsToContext(build, variantIdx));

          return {
            content: [{ type: "text" as const, text: summary }],
          };
        }

        // Otherwise treat as PoB code
        const build = importPoBCode(build_source);
        const summary = formatBuildSummary(build);

        // Store in shared build context
        setBuildContext(pobToContext(build));

        return {
          content: [{ type: "text" as const, text: `PoB build imported!\n\n${summary}` }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to import build: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "decode_pob_xml",
    "Decode a PoB code and return the raw XML for inspection",
    {
      pob_code: z.string().describe("The PoB export code"),
    },
    async ({ pob_code }) => {
      try {
        const xml = decodePoBCode(pob_code);
        return {
          content: [{ type: "text" as const, text: xml }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to decode: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_build_equipment",
    "Get the currently imported build's recommended equipment. Optionally filter by slot (e.g. 'ring', 'helmet', 'weapon'). Requires a build to be imported first via import_build.",
    {
      slot: z
        .string()
        .optional()
        .describe(
          "Filter by slot name (e.g. 'ring', 'helmet', 'weapon', 'body', 'gloves', 'boots', 'belt', 'amulet'). If omitted, shows all slots."
        ),
    },
    async ({ slot }) => {
      const build = getBuildContext();
      if (!build) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No build imported yet. Use import_build first to import a Mobalytics or PoB build.",
            },
          ],
          isError: true,
        };
      }

      const output = formatBuildContext(build, slot);
      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
