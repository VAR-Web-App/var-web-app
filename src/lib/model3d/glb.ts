// Mesh → binary glTF (.glb), pure TS — no three.js, no DOM. Runs on the
// server so Android's Scene Viewer can fetch the model from a real URL
// (Scene Viewer does a plain GET and can't use a browser blob: URL).
//
// GLB layout: 12-byte header, then a JSON chunk (the glTF document) and a BIN
// chunk (interleaved-free POSITION + NORMAL float buffers). Units metres
// (mm→m), so a 200 mm model lands as a ~0.2 m dollhouse in AR.

import type { Mesh } from "./types";

const MM_TO_M = 0.001;

export function meshToGlb(mesh: Mesh): Uint8Array {
  const tris = mesh.triangles;
  const N = tris.length * 3; // non-indexed: 3 verts per triangle
  const pos = new Float32Array(N * 3);
  const nor = new Float32Array(N * 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  let v = 0;
  for (const t of tris) {
    const ux = t.b.x - t.a.x, uy = t.b.y - t.a.y, uz = t.b.z - t.a.z;
    const wx = t.c.x - t.a.x, wy = t.c.y - t.a.y, wz = t.c.z - t.a.z;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [t.a, t.b, t.c]) {
      const x = p.x * MM_TO_M, y = p.y * MM_TO_M, z = p.z * MM_TO_M;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
      v++;
    }
  }

  const posBytes = pos.byteLength;
  const norBytes = nor.byteLength;
  const binLen = posBytes + norBytes;

  const doc = {
    asset: { version: "2.0", generator: "KeystonePro" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.95, 0.96, 0.97, 1],
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: N, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: N, type: "VEC3" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: norBytes, target: 34962 },
    ],
    buffers: [{ byteLength: binLen }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (binLen % 4)) % 4;
  const jsonChunkLen = jsonBytes.length + jsonPad;
  const binChunkLen = binLen + binPad;
  const total = 12 + 8 + jsonChunkLen + 8 + binChunkLen;

  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let o = 0;
  dv.setUint32(o, 0x46546c67, true); o += 4; // magic "glTF"
  dv.setUint32(o, 2, true); o += 4; // version
  dv.setUint32(o, total, true); o += 4; // total length

  // JSON chunk
  dv.setUint32(o, jsonChunkLen, true); o += 4;
  dv.setUint32(o, 0x4e4f534a, true); o += 4; // "JSON"
  u8.set(jsonBytes, o); o += jsonBytes.length;
  for (let i = 0; i < jsonPad; i++) u8[o++] = 0x20; // pad with spaces

  // BIN chunk (little-endian floats; all target platforms are LE)
  dv.setUint32(o, binChunkLen, true); o += 4;
  dv.setUint32(o, 0x004e4942, true); o += 4; // "BIN\0"
  u8.set(new Uint8Array(pos.buffer), o); o += posBytes;
  u8.set(new Uint8Array(nor.buffer), o); o += norBytes;
  // remaining binPad bytes already zero

  return u8;
}
