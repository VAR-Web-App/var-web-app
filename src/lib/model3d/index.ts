// 3D scale-model pipeline — public entry points.
//
//   floor-plan layout ──buildHouseMesh──▶ Mesh ──meshToBinaryStl──▶ STL bytes
//                                                                     │
//                                            client: downloadStl()  ◀─┤
//                                            server: POST to POD API ◀─┘
//
// The POD hand-off (upload STL → quote → order → dropship to the homeowner)
// plugs in after this — Treatstock's REST API is the current front-runner for
// that. See src/app/api/walkthrough/stl/route.ts for the server seam.

import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";
import { meshBoundsMm } from "./build-mesh";
import { buildWalledHouseMesh } from "./walls";
import { meshToBinaryStl } from "./stl";
import type { ModelSpec } from "./types";

export * from "./types";
export { buildHouseMesh, meshBoundsMm, mmPerFoot } from "./build-mesh";
export { buildWalledHouseMesh } from "./walls";
export { meshToBinaryStl, downloadStl } from "./stl";

export interface StlResult {
  bytes: Uint8Array;
  /** Print bounding box in mm — for a "prints at N×N×N mm" note + vendor
   *  build-volume checks. */
  boundsMm: { x: number; y: number; z: number };
  triangleCount: number;
}

/** One-shot: layout → printable STL bytes + print dimensions. */
export function layoutToStl(
  layout: WalkthroughLayout,
  spec: Partial<ModelSpec> = {},
): StlResult {
  const mesh = buildWalledHouseMesh(layout, spec);
  return {
    bytes: meshToBinaryStl(mesh),
    boundsMm: meshBoundsMm(mesh),
    triangleCount: mesh.triangles.length,
  };
}
