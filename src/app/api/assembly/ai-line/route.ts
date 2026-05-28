// POST /api/assembly/ai-line — AI-assisted ExtraMaterial suggestion.
//
// The safety net for the 5% of cases where the curated catalog +
// V1.5 multipliers + V1.6 manual line editing aren't enough. Builder
// describes in plain English what they want to add ("vapor barrier
// at $0.50/SF scaled to the slab area, 10% waste"); Claude returns
// suggested values for the ExtraMaterial fields, which the V1.6
// modal pre-populates. Builder reviews + tweaks + saves.
//
// Trust model: we only return *suggested values*, never apply them
// directly. The client decides what to keep. This stops a bad model
// output from silently corrupting estimates.
//
// Constrained output: tool_use with an input_schema matching the
// ExtraMaterial shape forces well-formed JSON. No free-form text
// parsing.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { findStubAssembly } from "@/lib/assemblies/stub-catalog";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-sonnet-4-6";

interface RequestBody {
  /** The assembly id the line is being added to (e.g. "stub-carpet"). */
  assembly_id: string;
  /** Plain-English description from the builder. */
  description: string;
}

interface Suggestion {
  name: string;
  uom: string;
  base_quantity?: number;
  scale_property?: string;
  scale_multiplier?: number;
  unit_cost_usd: number;
  labor_cost_usd?: number;
  /** Claude's one-sentence rationale for the field choices — helps the
   *  builder sanity-check before saving. */
  reasoning: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const { assembly_id, description } = body;
  if (!assembly_id || !description?.trim()) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const assembly = findStubAssembly(assembly_id);
  if (!assembly) {
    return NextResponse.json(
      { ok: false, error: "assembly_not_found" },
      { status: 404 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 },
    );
  }

  // Scaleable properties (number type, excluding option/choice cost
  // multipliers). These are the only valid `scale_property` values
  // Claude can pick from.
  const scaleableProperties = assembly.properties
    .filter((p) => p.kind !== "option" && p.kind !== "choice")
    .map((p) => ({ name: p.name, uom: p.uom }));

  const propertyDescriptions = assembly.properties
    .map((p) => {
      if (p.kind === "option" && p.options) {
        return `- ${p.name} (option, values: ${p.options.map((o) => o.label).join(" / ")})`;
      }
      if (p.kind === "choice" && p.choices) {
        return `- ${p.name} (choice, values: ${p.choices.join(" / ")} ${p.uom})`;
      }
      return `- ${p.name} (number, ${p.uom})`;
    })
    .join("\n");

  const stockMaterials = assembly.materials
    .map((m) => `- ${m.name}: qty=${m.quantityFormula} ${m.uom}`)
    .join("\n");

  const system = `You are an estimating assistant for KeystonePro, a custom-home builder app. The user wants to add a new material line to an existing assembly. You'll suggest values for the line's fields based on their plain-English description.

ASSEMBLY: ${assembly.name}
DESCRIPTION: ${assembly.description ?? ""}

PROPERTIES (the builder can vary these on each estimate):
${propertyDescriptions}

EXISTING STOCK MATERIALS in this assembly (for context — don't duplicate):
${stockMaterials}

QUANTITY MODEL:
- final_quantity = base_quantity + (value_of_scale_property × scale_multiplier)
- For static lines (one $500 transition strip): set base_quantity=1, no scale_property.
- For scaling lines (vapor barrier across floor area): set base_quantity=0, scale_property=relevant property, scale_multiplier=ratio.
- For waste factors, multiply scale_multiplier accordingly (e.g. 10% waste → 1.10).

Use ONLY these scale_property names (the assembly's number properties): ${scaleableProperties.map((p) => `"${p.name}"`).join(", ") || "none"}.

Costs are PER UNIT before any org-wide multipliers. Use realistic 2026 residential prices. Labor cost is the install labor per unit; 0 if a flat-cost line.

Always include a short reasoning sentence so the builder can sanity-check before accepting.`;

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [
        {
          name: "suggest_extra_material",
          description:
            "Return the suggested values for the new material line based on the builder's description.",
          input_schema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "Short descriptive name shown in the line item (e.g. 'Vapor barrier').",
              },
              uom: {
                type: "string",
                description:
                  "Unit of measure: SF, LF, EA, CY, BAG, etc. Default EA when unsure.",
              },
              base_quantity: {
                type: "number",
                description:
                  "Static quantity added regardless of property values. 0 for purely-scaling lines.",
              },
              scale_property: {
                type: "string",
                description:
                  "Name of an existing property to scale by. Must exactly match one of the assembly's number properties. Omit for purely-static lines.",
              },
              scale_multiplier: {
                type: "number",
                description:
                  "Multiplier on the scale_property value. 1.0 for direct, <1 to divide (e.g. 1 fixture per 250 SF → 0.004), >1 to bake in waste (1.10 = 10% waste).",
              },
              unit_cost_usd: {
                type: "number",
                description:
                  "Material cost per unit in USD before any org multipliers.",
              },
              labor_cost_usd: {
                type: "number",
                description:
                  "Install labor cost per unit in USD. 0 for flat material-only lines.",
              },
              reasoning: {
                type: "string",
                description:
                  "One-sentence explanation of the field choices so the builder can sanity-check.",
              },
            },
            required: ["name", "uom", "unit_cost_usd", "reasoning"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "suggest_extra_material" },
      messages: [
        {
          role: "user",
          content: description.trim().slice(0, 1000),
        },
      ],
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "claude_api_error",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  // Pull the tool_use block. With tool_choice forced, there's exactly
  // one and it contains the suggestion.
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      { ok: false, error: "no_suggestion" },
      { status: 502 },
    );
  }
  const raw = toolUse.input as Partial<Suggestion>;

  // Validate scale_property against the actual property list — if
  // Claude hallucinated a name, drop it rather than silently producing
  // bad output later.
  if (raw.scale_property) {
    const valid = scaleableProperties.some(
      (p) => p.name === raw.scale_property,
    );
    if (!valid) {
      delete raw.scale_property;
      delete raw.scale_multiplier;
    }
  }

  return NextResponse.json({ ok: true, suggestion: raw });
}
