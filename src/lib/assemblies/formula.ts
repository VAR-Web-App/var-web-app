/**
 * Formula evaluator for Assembly material quantity formulas.
 *
 * Formulas use the 1build-style syntax: parent property names in curly
 * braces, optionally with embedded UoM markers that are treated as no-ops.
 *
 * Examples
 *   "{Wall Length} * (12 / {Stud Spacing}) + 4"
 *   "({Wall Length}*{Wall Height}) + 1 LF"
 *
 * After property substitution and UoM stripping, the remaining string is
 * a plain arithmetic expression (digits, + - * / ( ) and whitespace).
 * We validate that nothing else remains before evaluating via the Function
 * constructor — so even an untrusted assembly definition can't smuggle
 * arbitrary JavaScript through.
 */

/** UoM tokens that may be embedded in formulas — stripped before evaluation. */
const UOM_TOKEN = /\b(LF|SF|EA|CF|CY|MO|HR|SHEET|IN|FT|LBS|OZ|GAL|YD)\b/gi;

/** After substitution + stripping, only these chars may remain. */
const SAFE_ARITHMETIC = /^[\d+\-*/().\s]+$/;

/**
 * Evaluate a quantity formula against a property bag.
 * Throws if a referenced property is missing or the expression doesn't
 * reduce to a finite number.
 */
export function evaluateFormula(
  formula: string,
  properties: Record<string, number>,
): number {
  // 1. Substitute {Property Name} → numeric value.
  const substituted = formula.replace(/\{([^}]+)\}/g, (_, raw) => {
    const key = String(raw).trim();
    const value = properties[key];
    if (value == null || !Number.isFinite(value)) {
      throw new Error(`Formula property "${key}" is not set`);
    }
    return String(value);
  });

  // 2. Strip UoM markers — they're labels, not math.
  const stripped = substituted.replace(UOM_TOKEN, "");

  // 3. Validate: only safe arithmetic characters remain.
  if (!SAFE_ARITHMETIC.test(stripped)) {
    throw new Error(`Formula contains invalid characters: "${stripped}"`);
  }

  // 4. Evaluate. Function-constructor eval is safe here because we've
  //    sanitized the string to digits + math operators only.
  // eslint-disable-next-line no-new-func
  const result = new Function(`"use strict"; return (${stripped});`)() as unknown;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`Formula did not evaluate to a finite number: "${stripped}"`);
  }
  return result;
}
