// Floor-plan layout → printable solid mesh.
//
// v0 (scaffold): each room becomes a solid rectangular block (massing) sized
// to its footprint and storey height; a base plate sits under the whole thing.
// Overlapping adjacent blocks are fine — a slicer unions solids at print time,
// so this already prints as a clean massing model.
//
// TODO (next layer — coordinate with Brennan before deepening):
//   - True walls: extrude the footprint PERIMETER as outer walls + interior
//     partition walls with real thickness, instead of solid room blocks, for
//     a "dollhouse" look you can see into.
//   - Manifold union: merge intersecting solids into one watertight shell so
//     the STL is strictly manifold (some POD validators reject self-overlap).
//   - Optional roof (gable/hip) and a name/address deboss on the base.
//   - Second-storey stacking currently just offsets Y; verify alignment once
//     real multi-level plans flow through.

import type { PlacedRoom, WalkthroughLayout } from "@/app/api/walkthrough/layout/route";
import {
  DEFAULT_MODEL_SPEC,
  MM_PER_FOOT,
  type Mesh,
  type ModelSpec,
  type Triangle,
  type Vec3,
} from "./types";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** 12 triangles for an axis-aligned box between two opposite corners, wound
 *  CCW-from-outside so normals point outward. */
function box(min: Vec3, max: Vec3): Triangle[] {
  const { x: x0, y: y0, z: z0 } = min;
  const { x: x1, y: y1, z: z1 } = max;
  // 8 corners
  const p = [
    v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), // bottom 0-3
    v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1), // top 4-7
  ];
  const quad = (a: number, b: number, c: number, d: number): Triangle[] => [
    { a: p[a], b: p[b], c: p[c] },
    { a: p[a], b: p[c], c: p[d] },
  ];
  return [
    ...quad(0, 3, 2, 1), // bottom (−Y)
    ...quad(4, 5, 6, 7), // top (+Y)
    ...quad(0, 1, 5, 4), // front (−Z)
    ...quad(2, 3, 7, 6), // back (+Z)
    ...quad(1, 2, 6, 5), // right (+X)
    ...quad(3, 0, 4, 7), // left (−X)
  ];
}

/** Millimetres-per-foot for this spec: real feet → model mm. */
export function mmPerFoot(spec: ModelSpec, layout: WalkthroughLayout): number {
  if (spec.targetLongestMm && layout.footprint) {
    const longestFt = Math.max(layout.footprint.width, layout.footprint.depth);
    if (longestFt > 0) return spec.targetLongestMm / longestFt;
  }
  return MM_PER_FOOT / spec.scaleDenominator;
}

/** Build the printable mesh. Centered on X/Z, base sitting at Y=0. */
export function buildHouseMesh(
  layout: WalkthroughLayout,
  partial: Partial<ModelSpec> = {},
): Mesh {
  const spec: ModelSpec = { ...DEFAULT_MODEL_SPEC, ...partial };
  const f = mmPerFoot(spec, layout);
  const rooms = layout.rooms ?? [];

  // Footprint extent (feet) → center offset so the model straddles the origin.
  const xs = rooms.flatMap((r) => [r.x, r.x + r.width]);
  const zs = rooms.flatMap((r) => [r.z, r.z + r.depth]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minZ = zs.length ? Math.min(...zs) : 0;
  const maxZ = zs.length ? Math.max(...zs) : 0;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const tris: Triangle[] = [];
  const base = spec.baseThicknessMm;
  const storeyMm = spec.storeyHeightFt * f;

  // Base plate under the whole footprint.
  if (base > 0) {
    const m = spec.baseMarginMm;
    tris.push(
      ...box(
        v((minX - cx) * f - m, 0, (minZ - cz) * f - m),
        v((maxX - cx) * f + m, base, (maxZ - cz) * f + m),
      ),
    );
  }

  // One solid block per room.
  for (const r of rooms) {
    const y0 = base + (r.level === "second" ? storeyMm : 0);
    const y1 = y0 + storeyMm;
    tris.push(
      ...box(
        v((r.x - cx) * f, y0, (r.z - cz) * f),
        v((r.x + r.width - cx) * f, y1, (r.z + r.depth - cz) * f),
      ),
    );
  }

  return { triangles: tris };
}

/** Bounding-box dimensions of the built mesh, in mm — for vendor build-volume
 *  checks and a "your model will print at N×N×N mm" preview. */
export function meshBoundsMm(mesh: Mesh): { x: number; y: number; z: number } {
  if (mesh.triangles.length === 0) return { x: 0, y: 0, z: 0 };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const t of mesh.triangles) {
    for (const pt of [t.a, t.b, t.c] as Vec3[]) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
      if (pt.z > maxZ) maxZ = pt.z;
    }
  }
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

export type { PlacedRoom };
