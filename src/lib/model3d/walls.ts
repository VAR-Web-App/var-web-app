// Level 2 geometry — hollow walled rooms + a gabled roof, instead of the v0
// solid massing blocks. Deterministic (no vision extraction yet): rooms come
// from the layout, each gets four thin perimeter walls + a floor slab, and a
// single gable roof (9:12 pitch) caps the footprint. This reads as an actual
// house — good for both the AR preview and the physical print.
//
// TODO (Level 2.5): true plan-accurate wall lines + door/window openings via
// vision extraction off the floor-plan image; shared-wall dedup; hip roofs.

import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";
import {
  DEFAULT_MODEL_SPEC,
  type Mesh,
  type ModelSpec,
  type Triangle,
  type Vec3,
} from "./types";
import { mmPerFoot } from "./build-mesh";

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const WALL_FT = 0.5; // ~6" walls
const SLAB_FT = 0.4; // floor slab thickness
const ROOF_PITCH = 0.75; // 9-on-12

/** 12 triangles for an axis-aligned box, wound CCW-from-outside. */
function box(min: Vec3, max: Vec3): Triangle[] {
  const { x: x0, y: y0, z: z0 } = min;
  const { x: x1, y: y1, z: z1 } = max;
  const p = [
    v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1),
    v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1),
  ];
  const quad = (a: number, b: number, c: number, d: number): Triangle[] => [
    { a: p[a], b: p[b], c: p[c] },
    { a: p[a], b: p[c], c: p[d] },
  ];
  return [
    ...quad(0, 3, 2, 1), ...quad(4, 5, 6, 7),
    ...quad(0, 1, 5, 4), ...quad(2, 3, 7, 6),
    ...quad(1, 2, 6, 5), ...quad(3, 0, 4, 7),
  ];
}

/** Gable roof over [min..max] with the ridge along the longer axis. */
function gableRoof(min: Vec3, max: Vec3): Triangle[] {
  const x0 = min.x, x1 = max.x, z0 = min.z, z1 = max.z, y = min.y;
  const spanX = x1 - x0, spanZ = z1 - z0;
  const tris: Triangle[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    tris.push({ a, b, c }, { a, b: c, c: d });
  };
  if (spanX >= spanZ) {
    const zMid = (z0 + z1) / 2;
    const ry = y + (spanZ / 2) * ROOF_PITCH;
    quad(v(x0, y, z0), v(x1, y, z0), v(x1, ry, zMid), v(x0, ry, zMid)); // -Z slope
    quad(v(x0, ry, zMid), v(x1, ry, zMid), v(x1, y, z1), v(x0, y, z1)); // +Z slope
    tris.push({ a: v(x0, y, z0), b: v(x0, ry, zMid), c: v(x0, y, z1) }); // gable −X
    tris.push({ a: v(x1, y, z0), b: v(x1, y, z1), c: v(x1, ry, zMid) }); // gable +X
  } else {
    const xMid = (x0 + x1) / 2;
    const ry = y + (spanX / 2) * ROOF_PITCH;
    quad(v(x0, y, z0), v(x0, y, z1), v(xMid, ry, z1), v(xMid, ry, z0)); // −X slope
    quad(v(xMid, ry, z0), v(xMid, ry, z1), v(x1, y, z1), v(x1, y, z0)); // +X slope
    tris.push({ a: v(x0, y, z0), b: v(xMid, ry, z0), c: v(x1, y, z0) }); // gable −Z
    tris.push({ a: v(x0, y, z1), b: v(x1, y, z1), c: v(xMid, ry, z1) }); // gable +Z
  }
  return tris;
}

export function buildWalledHouseMesh(
  layout: WalkthroughLayout,
  partial: Partial<ModelSpec> = {},
): Mesh {
  const spec: ModelSpec = { ...DEFAULT_MODEL_SPEC, ...partial };
  const f = mmPerFoot(spec, layout);
  const rooms = layout.rooms ?? [];
  if (rooms.length === 0) return { triangles: [] };

  const xs = rooms.flatMap((r) => [r.x, r.x + r.width]);
  const zs = rooms.flatMap((r) => [r.z, r.z + r.depth]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const X = (ft: number) => (ft - cx) * f;
  const Z = (ft: number) => (ft - cz) * f;

  const tris: Triangle[] = [];
  const base = spec.baseThicknessMm;
  const storey = spec.storeyHeightFt * f;
  const wall = WALL_FT * f;
  const slab = SLAB_FT * f;

  if (base > 0) {
    const m = spec.baseMarginMm;
    tris.push(...box(v(X(minX) - m, 0, Z(minZ) - m), v(X(maxX) + m, base, Z(maxZ) + m)));
  }

  const levels: Array<"main" | "second"> = ["main", "second"];
  const present = levels.filter((lvl) => rooms.some((r) => (r.level ?? "main") === lvl));

  present.forEach((lvl, li) => {
    const levelRooms = rooms.filter((r) => (r.level ?? "main") === lvl);
    const lxs = levelRooms.flatMap((r) => [r.x, r.x + r.width]);
    const lzs = levelRooms.flatMap((r) => [r.z, r.z + r.depth]);
    const yBase = base + li * storey;
    // floor slab for this level
    tris.push(
      ...box(
        v(X(Math.min(...lxs)), yBase, Z(Math.min(...lzs))),
        v(X(Math.max(...lxs)), yBase + slab, Z(Math.max(...lzs))),
      ),
    );
    const wy0 = yBase + slab, wy1 = wy0 + storey;
    for (const r of levelRooms) {
      const x0 = X(r.x), x1 = X(r.x + r.width), z0 = Z(r.z), z1 = Z(r.z + r.depth);
      tris.push(...box(v(x0, wy0, z0), v(x1, wy1, z0 + wall))); // south
      tris.push(...box(v(x0, wy0, z1 - wall), v(x1, wy1, z1))); // north
      tris.push(...box(v(x0, wy0, z0), v(x0 + wall, wy1, z1))); // west
      tris.push(...box(v(x1 - wall, wy0, z0), v(x1, wy1, z1))); // east
    }
  });

  // Roof caps the footprint at the top of the highest storey.
  const roofBaseY = base + present.length * storey + slab;
  tris.push(...gableRoof(v(X(minX), roofBaseY, Z(minZ)), v(X(maxX), roofBaseY, Z(maxZ))));

  return { triangles: tris };
}
