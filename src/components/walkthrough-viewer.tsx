"use client";

// Path-B 3D walkthrough viewer (POC). Extrudes an LLM-inferred room layout
// into a navigable 3D box-model with three.js — one foot = one world unit.
// Orbit to look around; each room is a translucent volume with a floor slab
// and a floating name label. Approximate massing, not a survey model.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WalkthroughLayout } from "@/app/api/walkthrough/layout/route";

const MAIN_CEILING = 10;
const SECOND_CEILING = 9;
const LEVEL_COLORS = { main: 0x38bdf8, second: 0xf59e0b };

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = 48;
  ctx.font = `600 ${font}px sans-serif`;
  const w = ctx.measureText(text).width;
  canvas.width = w + 40;
  canvas.height = font + 30;
  ctx.font = `600 ${font}px sans-serif`;
  ctx.fillStyle = "rgba(15,23,42,0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const scale = 0.02;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

export default function WalkthroughViewer({ layout }: { layout: WalkthroughLayout }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || layout.rooms.length === 0) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f7);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(60, 120, 40);
    scene.add(dir);

    // Model bounds → center everything at the origin.
    const xs = layout.rooms.flatMap((r) => [r.x, r.x + r.width]);
    const zs = layout.rooms.flatMap((r) => [r.z, r.z + r.depth]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));

    const group = new THREE.Group();
    for (const r of layout.rooms) {
      const ceiling = r.level === "second" ? SECOND_CEILING : MAIN_CEILING;
      const baseY = r.level === "second" ? MAIN_CEILING + 0.4 : 0;
      const color = LEVEL_COLORS[r.level] ?? LEVEL_COLORS.main;
      const px = r.x + r.width / 2 - cx;
      const pz = r.z + r.depth / 2 - cz;

      // floor slab
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(r.width, 0.25, r.depth),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55 }),
      );
      floor.position.set(px, baseY + 0.12, pz);
      group.add(floor);

      // translucent room volume + wireframe edges
      const box = new THREE.BoxGeometry(r.width, ceiling, r.depth);
      const vol = new THREE.Mesh(
        box,
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.12 }),
      );
      vol.position.set(px, baseY + ceiling / 2, pz);
      group.add(vol);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(box),
        new THREE.LineBasicMaterial({ color: 0x334155 }),
      );
      edges.position.copy(vol.position);
      group.add(edges);

      const label = labelSprite(r.name);
      label.position.set(px, baseY + ceiling + 1.5, pz);
      group.add(label);
    }
    scene.add(group);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 3, span * 3),
      new THREE.MeshStandardMaterial({ color: 0xdbe3ec }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    const dist = span * 1.5 + 30;
    camera.position.set(dist * 0.7, dist * 0.8, dist * 0.9);
    controls.target.set(0, MAIN_CEILING, 0);
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
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [layout]);

  return <div ref={mountRef} className="h-[460px] w-full rounded-lg" />;
}
