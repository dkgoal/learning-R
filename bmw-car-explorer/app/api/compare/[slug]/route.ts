import { NextResponse } from "next/server";
import {
  attributesInCategory,
  CATEGORY_ORDER,
} from "@/domain/attribute-registry";
import { serializePublic, formatValue } from "@/domain/units";
import { getFamily } from "@/data/families";
import { parseCompareSlug } from "@/lib/compare-slug";

// FR-309: CSV export with source attribution and generation date. Reads only
// public attributes (AR-03) — the same serialization boundary as the UI.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const vehicles = parseCompareSlug(slug)?.map(serializePublic);
  if (!vehicles) {
    return new NextResponse("Comparison not found", { status: 404 });
  }

  const headers = [
    "Attribute",
    ...vehicles.map(
      (v) => `${v.modelYear} ${getFamily(v.familySlug)?.name ?? ""} ${v.trimName}`,
    ),
  ];

  const rows: string[][] = [];
  for (const category of CATEGORY_ORDER) {
    for (const def of attributesInCategory(category)) {
      if (!def.public) continue;
      if (!vehicles.some((v) => v.attributes[def.key] !== undefined)) continue;
      rows.push([
        def.unit ? `${def.label} (${def.unit})` : def.label,
        ...vehicles.map((v) => formatValue(v.attributes[def.key])),
      ]);
    }
  }

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const generated = new Date().toISOString().slice(0, 10);
  const lines = [
    `# BMW Car Explorer comparison export`,
    `# Generated ${generated}. Data last updated 2026-07-01.`,
    `# Sources: BMW PressClub, EPA, NHTSA, IIHS. Specs subject to change.`,
    headers.map(esc).join(","),
    ...rows.map((r) => r.map(esc).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compare-${generated}.csv"`,
    },
  });
}
