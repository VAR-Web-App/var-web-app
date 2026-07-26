import type { OrgSettings } from "@/types";

/** Baseline org settings. Written at signup (so client-facing docs have the
 *  builder's name from day one instead of a "Your builder" placeholder) and
 *  used as the in-memory fallback on the Settings page. */
export function defaultSettings(orgRef: string): OrgSettings {
  return {
    org_ref: orgRef,
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    // Builder repurpose of the federal-contractor identifier fields.
    cage_code: "", // → State Contractor License #
    duns: "", // → EIN (or business reg #)
    sam_id: "", // → Local business license #
    default_blanket_discount_percent: 0,
    default_markup_percent: 15,
    default_manufacturer: "Custom Home",
    prepared_by_name: "",
    prepared_by_phone: "",
  };
}
