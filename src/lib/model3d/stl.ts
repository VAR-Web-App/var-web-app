// Mesh → binary STL. Pure — no three.js, works on server or client.
//
// Binary STL layout:
//   80-byte header (ignored) · uint32 triangle count ·
//   per triangle: 3×float32 normal + 3×(3×float32 vertex) + uint16 attr = 50B

import type { Mesh, Triangle, Vec3 } from "./types";

function normal(t: Triangle): Vec3 {
  const ux = t.b.x - t.a.x, uy = t.b.y - t.a.y, uz = t.b.z - t.a.z;
  const vx = t.c.x - t.a.x, vy = t.c.y - t.a.y, vz = t.c.z - t.a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

/** Serialize a mesh to a binary STL as bytes. */
export function meshToBinaryStl(mesh: Mesh): Uint8Array {
  const count = mesh.triangles.length;
  const buf = new ArrayBuffer(84 + count * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, count, true);

  let off = 84;
  const putVec = (p: Vec3) => {
    dv.setFloat32(off, p.x, true); off += 4;
    dv.setFloat32(off, p.y, true); off += 4;
    dv.setFloat32(off, p.z, true); off += 4;
  };
  for (const t of mesh.triangles) {
    putVec(normal(t));
    putVec(t.a);
    putVec(t.b);
    putVec(t.c);
    dv.setUint16(off, 0, true); off += 2;
  }
  return new Uint8Array(buf);
}

/** Browser-only: trigger a download of the STL. No-op if not in a browser. */
export function downloadStl(bytes: Uint8Array, filename = "model.stl"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([bytes as BlobPart], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".stl") ? filename : `${filename}.stl`;
  a.click();
  URL.revokeObjectURL(url);
}
