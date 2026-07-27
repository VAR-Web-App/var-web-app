"use client";

// On-screen 3D preview. Renders the SAME walled-house mesh that the AR export
// and STL print use (buildWalledHouseMesh), so what you see here is what you
// get on your table / in your hand. Orbit to look around.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";
import { buildWalledHouseMesh } from "@/lib/model3d";

export default function WalkthroughViewer({ layout }: { layout: WalkthroughLayout }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || layout.rooms.length === 0) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f7);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(1, 2, 1.5);
    scene.add(dir);

    // Build the walled mesh (mm) → BufferGeometry.
    const mesh = buildWalledHouseMesh(layout, { scaleDenominator: 1 });
    const positions = new Float32Array(mesh.triangles.length * 9);
    let i = 0;
    for (const t of mesh.triangles) {
      for (const p of [t.a, t.b, t.c]) {
        positions[i++] = p.x;
        positions[i++] = p.y;
        positions[i++] = p.z;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const center = bb.getCenter(new THREE.Vector3());
    const size = bb.getSize(new THREE.Vector3());

    const house = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.9,
        metalness: 0,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
    house.position.sub(center); // center at origin
    scene.add(house);

    // Ground just below the model.
    const span = Math.max(size.x, size.y, size.z);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 4, span * 4),
      new THREE.MeshStandardMaterial({ color: 0xdbe3ec }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -size.y / 2 - span * 0.002;
    scene.add(ground);

    camera.position.set(span * 0.9, span * 0.75, span * 1.15);
    controls.target.set(0, 0, 0);
    controls.update();

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      geo.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [layout]);

  return <div ref={mountRef} className="h-[460px] w-full rounded-lg" />;
}
