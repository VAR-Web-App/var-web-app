// AR export — mesh → GLB (Android/web) + USDZ (iOS AR Quick Look).
//
// Client-only: three's exporters need browser APIs, so keep this OUT of the
// pure index.ts barrel (which the server STL route imports). Import it
// directly from client components.
//
// Units: our mesh is in millimetres; glTF/USDZ are metres. We scale by 1/1000
// so a model built to a ~200 mm longest side lands as a ~0.2 m dollhouse on
// the table in AR — exactly the physical-print size.

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import type { Mesh } from "./types";

const MM_TO_M = 0.001;

/** Build a lit three.js scene with a single solid mesh, in metres. */
export function meshToThreeScene(mesh: Mesh): THREE.Scene {
  const positions = new Float32Array(mesh.triangles.length * 9);
  let i = 0;
  for (const t of mesh.triangles) {
    for (const p of [t.a, t.b, t.c]) {
      positions[i++] = p.x * MM_TO_M;
      positions[i++] = p.y * MM_TO_M;
      positions[i++] = p.z * MM_TO_M;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xf3f4f6,
    roughness: 0.85,
    metalness: 0,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geo, material));
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(1, 2, 1);
  scene.add(dir);
  return scene;
}

/** Binary glTF (.glb) for Android Scene Viewer / web viewers. */
export async function exportGlb(mesh: Mesh): Promise<Blob> {
  const scene = meshToThreeScene(mesh);
  const result = await new GLTFExporter().parseAsync(scene, { binary: true });
  return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
}

/** USDZ for iOS AR Quick Look. */
export async function exportUsdz(mesh: Mesh): Promise<Blob> {
  const scene = meshToThreeScene(mesh);
  const bytes = await new USDZExporter().parseAsync(scene);
  return new Blob([bytes as BlobPart], { type: "model/vnd.usdz+zip" });
}
