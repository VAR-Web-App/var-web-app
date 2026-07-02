// Starter selection templates for common residential construction categories.
// The GC picks a template to pre-fill category, title, allowance, and option
// stubs. All values are editable after creation.

import type { SelectionCategory } from "@/types/builder";

export interface SelectionTemplate {
  category: SelectionCategory;
  title: string;
  default_allowance: number;
  default_options: Array<{ label: string; description: string; cost: number }>;
}

export const SELECTION_TEMPLATES: SelectionTemplate[] = [
  {
    category: "countertops",
    title: "Kitchen Countertops",
    default_allowance: 5000,
    default_options: [
      { label: "Laminate", description: "Standard laminate countertop", cost: 2500 },
      { label: "Granite", description: "Natural granite slab, level 1", cost: 5000 },
      { label: "Quartz — Calacatta", description: "Engineered quartz, premium pattern", cost: 7500 },
    ],
  },
  {
    category: "cabinets",
    title: "Kitchen Cabinets",
    default_allowance: 12000,
    default_options: [
      { label: "Builder Grade — Painted", description: "MDF shaker, painted white", cost: 10000 },
      { label: "Semi-Custom — Maple", description: "Solid maple, soft-close hardware", cost: 15000 },
      { label: "Custom — Inset", description: "Full inset, custom finish", cost: 25000 },
    ],
  },
  {
    category: "flooring",
    title: "Main Floor Flooring",
    default_allowance: 8000,
    default_options: [
      { label: "LVP — Standard", description: "Luxury vinyl plank, mid-grade", cost: 6000 },
      { label: "Engineered Hardwood", description: "Oak engineered hardwood", cost: 10000 },
      { label: "Solid Hardwood — White Oak", description: "Site-finished white oak", cost: 16000 },
    ],
  },
  {
    category: "paint",
    title: "Interior Paint Colors",
    default_allowance: 3500,
    default_options: [
      { label: "Builder White — Flat", description: "Single color throughout, flat finish", cost: 2800 },
      { label: "Two-Tone — Eggshell", description: "Trim + wall colors, eggshell finish", cost: 3500 },
      { label: "Custom Palette", description: "Multi-room color selections, accent walls", cost: 5000 },
    ],
  },
  {
    category: "brick",
    title: "Exterior Brick / Stone",
    default_allowance: 15000,
    default_options: [
      { label: "Standard Brick", description: "Modular brick, running bond", cost: 12000 },
      { label: "Tumbled Brick", description: "Aged/tumbled finish", cost: 16000 },
      { label: "Natural Stone Veneer", description: "Thin-cut natural stone", cost: 22000 },
    ],
  },
  {
    category: "fixtures",
    title: "Plumbing Fixtures",
    default_allowance: 4000,
    default_options: [
      { label: "Chrome — Builder Pack", description: "Moen or Delta chrome fixtures", cost: 3000 },
      { label: "Brushed Nickel — Mid-Range", description: "Coordinated nickel set", cost: 5000 },
      { label: "Matte Black — Premium", description: "Designer matte black collection", cost: 7500 },
    ],
  },
  {
    category: "fireplace",
    title: "Fireplace Surround",
    default_allowance: 3000,
    default_options: [
      { label: "Painted Drywall", description: "Simple drywall surround, painted", cost: 1500 },
      { label: "Tile Surround", description: "Floor-to-ceiling tile", cost: 4000 },
      { label: "Stone Surround", description: "Stacked stone or ledgestone", cost: 6500 },
    ],
  },
  {
    category: "appliances",
    title: "Kitchen Appliances",
    default_allowance: 6000,
    default_options: [
      { label: "Standard — Stainless", description: "GE or Whirlpool stainless suite", cost: 5000 },
      { label: "Mid-Range — Samsung/LG", description: "Samsung or LG suite with smart features", cost: 8000 },
      { label: "Premium — KitchenAid/Bosch", description: "KitchenAid or Bosch appliance suite", cost: 14000 },
    ],
  },
  {
    category: "tile",
    title: "Master Bath Tile",
    default_allowance: 4000,
    default_options: [
      { label: "Ceramic — Standard", description: "12×24 ceramic floor + tub surround", cost: 3000 },
      { label: "Porcelain — Large Format", description: "24×48 porcelain, linear drain", cost: 5500 },
      { label: "Natural Marble", description: "Carrara marble floor + shower walls", cost: 9000 },
    ],
  },
  {
    category: "lighting",
    title: "Light Fixtures",
    default_allowance: 3000,
    default_options: [
      { label: "Builder Pack", description: "Standard can lights + basic pendants", cost: 2500 },
      { label: "Curated Mix", description: "Statement pendants, sconces, can lights", cost: 4500 },
      { label: "Designer Package", description: "Full lighting design with dimmers", cost: 7000 },
    ],
  },
  {
    category: "hardware",
    title: "Door & Cabinet Hardware",
    default_allowance: 1200,
    default_options: [
      { label: "Satin Nickel — Basic", description: "Schlage or Kwikset satin nickel", cost: 900 },
      { label: "Matte Black — Mid", description: "Coordinated matte black pulls + knobs", cost: 1500 },
      { label: "Brass — Premium", description: "Unlacquered brass, custom pulls", cost: 2800 },
    ],
  },
];
