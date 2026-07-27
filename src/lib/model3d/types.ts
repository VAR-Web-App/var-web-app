// 3D scale-model pipeline — shared types.
//
// Goal: turn a floor-plan layout (the same PlacedRoom[] the walkthrough POC
// produces) into a printable, to-scale solid mesh we can hand to a print-on-
// demand vendor as an STL. Pure geometry — no three.js, no DOM — so it runs
// on the server (for POD order automation) or the client (for a download).
//
// STATUS: scaffold. Produces a solid "massing" model (a block per room + a
// base plate). Good enough to slice/print as a proof. The refined geometry
// (true perimeter + interior walls, a watertight manifold union, an optional
// roof) is the next layer — see build-mesh.ts TODOs. That's the piece to
// divide with Brennan before anyone deepens it.

/** A point in model space. Units are millimetres (print-ready). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One triangle. Winding is counter-clockwise when viewed from outside so the
 *  outward normal can be derived at export time (STL stores a normal too). */
export interface Triangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

export interface Mesh {
  triangles: Triangle[];
}

/** How to turn real-world feet into a physical model. */
export interface ModelSpec {
  /** Architectural scale denominator, i.e. 1:N. Default 100 (1:100).
   *  Ignored when `targetLongestMm` is set. */
  scaleDenominator: number;
  /** If set, auto-scale so the footprint's longest side prints at this many
   *  mm (fit-to-size). Overrides `scaleDenominator`. Handy to clamp to a
   *  vendor's max build volume. */
  targetLongestMm?: number;
  /** Base plate thickness in mm. 0 = no base. Default 3. */
  baseThicknessMm: number;
  /** Base plate margin around the footprint, in mm. Default 5. */
  baseMarginMm: number;
  /** Wall/ceiling height per storey, in real feet, when a room doesn't carry
   *  its own. Default 10 (main) — second storeys stack on top. */
  storeyHeightFt: number;
}

export const DEFAULT_MODEL_SPEC: ModelSpec = {
  scaleDenominator: 100,
  baseThicknessMm: 3,
  baseMarginMm: 5,
  storeyHeightFt: 10,
};

/** Real-world millimetres in one foot. */
export const MM_PER_FOOT = 304.8;
