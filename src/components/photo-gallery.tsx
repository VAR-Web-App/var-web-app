"use client";

import { useEffect, useRef, useState } from "react";
import {
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { newId } from "@/types";
import {
  ProjectPhoto,
  PROJECT_PHASES,
  ProjectPhase,
} from "@/types/builder";
import { listPhotos, savePhoto, deletePhoto } from "@/lib/store";
import { uploadPhotoFile } from "@/lib/storage";

export default function PhotoGallery({
  dealId,
  orgRef,
}: {
  dealId: string;
  orgRef: string;
}) {
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<ProjectPhase>("Site Work");
  const [filter, setFilter] = useState<"all" | ProjectPhase>("all");
  const [dragActive, setDragActive] = useState(false);
  const [lightbox, setLightbox] = useState<ProjectPhoto | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    listPhotos(dealId).then((p) => {
      if (active) {
        setPhotos(p);
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [dealId]);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const now = new Date().toISOString();
    // Optimistic add: show local object URLs immediately so the grid
    // doesn't sit empty during the upload. Persistent Storage URL + path
    // swap in once each upload resolves; if upload fails, the optimistic
    // record is rolled back.
    const optimistic: ProjectPhoto[] = arr.map((f) => ({
      id: newId("photo"),
      deal_ref: dealId,
      org_ref: orgRef,
      url: URL.createObjectURL(f),
      phase: uploadPhase,
      caption: "",
      size: f.size,
      uploaded_at: now,
    }));
    setPhotos((prev) => [...optimistic, ...prev]);

    for (let i = 0; i < optimistic.length; i++) {
      const placeholder = optimistic[i];
      try {
        const { url, storagePath } = await uploadPhotoFile(
          arr[i],
          dealId,
          placeholder.id,
        );
        const persisted: ProjectPhoto = {
          ...placeholder,
          url,
          storage_path: storagePath,
        };
        await savePhoto(persisted);
        setPhotos((prev) =>
          prev.map((x) => (x.id === placeholder.id ? persisted : x)),
        );
        URL.revokeObjectURL(placeholder.url);
      } catch (e) {
        console.warn("[photo-gallery] upload failed", e);
        setPhotos((prev) => prev.filter((x) => x.id !== placeholder.id));
        URL.revokeObjectURL(placeholder.url);
      }
    }
  }

  async function onRemove(p: ProjectPhoto) {
    if (!confirm("Delete this photo?")) return;
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    await deletePhoto(p.id);
  }

  async function updateCaption(p: ProjectPhoto, caption: string) {
    const next: ProjectPhoto = { ...p, caption };
    setPhotos((prev) => prev.map((x) => (x.id === p.id ? next : x)));
    await savePhoto(next);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
  }

  // Group + filter
  const filtered = filter === "all" ? photos : photos.filter((p) => p.phase === filter);
  const phaseCounts: Record<string, number> = {};
  for (const p of photos) phaseCounts[p.phase] = (phaseCounts[p.phase] || 0) + 1;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Project Photos</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {photos.length} photo{photos.length === 1 ? "" : "s"} across the build · organized by phase
          </p>
        </div>
      </div>

      {/* Upload */}
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Upload phase
            </label>
            <select
              value={uploadPhase}
              onChange={(e) => setUploadPhase(e.target.value as ProjectPhase)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {PROJECT_PHASES.map((ph) => (
                <option key={ph} value={ph}>{ph}</option>
              ))}
            </select>
          </div>
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            className={`flex flex-1 min-w-[260px] cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed py-2.5 text-sm font-medium transition-colors ${
              dragActive
                ? "border-sky-500 bg-sky-50 text-sky-800"
                : "border-slate-300 text-slate-600 hover:border-sky-300 hover:bg-sky-50/50 hover:text-sky-700"
            }`}
          >
            <PlusIcon className="h-4 w-4" />
            Drop photos here or click to add
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              if (fileInput.current) fileInput.current.value = "";
            }}
            className="hidden"
          />
        </div>
      </div>

      {/* Phase filter chips */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-6 py-3">
          <FilterChip
            label={`All · ${photos.length}`}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {PROJECT_PHASES.filter((ph) => phaseCounts[ph] > 0).map((ph) => (
            <FilterChip
              key={ph}
              label={`${ph} · ${phaseCounts[ph]}`}
              active={filter === ph}
              onClick={() => setFilter(ph)}
            />
          ))}
        </div>
      )}

      {/* Gallery */}
      {!loaded ? (
        <div className="px-6 py-8 text-sm text-slate-500">Loading photos…</div>
      ) : photos.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <PhotoIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No photos yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Upload progress photos as you build — they&apos;ll show up in the customer portal too.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-500">
          No photos in this phase yet.
        </div>
      ) : filter === "all" ? (
        // 'All' view: group photos by phase with section headers so the
        // build narrative reads top-to-bottom (Site Work → Foundation →
        // Framing → ...). Filter chips above still let the GC drill in
        // to a single phase.
        <div className="space-y-6 p-4">
          {PROJECT_PHASES.filter((ph) => phaseCounts[ph] > 0).map((ph) => {
            const phasePhotos = photos.filter((p) => p.phase === ph);
            return (
              <div key={ph}>
                <div className="mb-2 flex items-baseline gap-2 border-b border-slate-100 pb-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    {ph}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {phasePhotos.length} photo{phasePhotos.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
                  {phasePhotos.map((p) => (
                    <PhotoCard
                      key={p.id}
                      photo={p}
                      onCaption={(c) => updateCaption(p, c)}
                      onRemove={() => onRemove(p)}
                      onView={() => setLightbox(p)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <PhotoCard
              key={p.id}
              photo={p}
              onCaption={(c) => updateCaption(p, c)}
              onRemove={() => onRemove(p)}
              onView={() => setLightbox(p)}
            />
          ))}
        </div>
      )}

      {lightbox && (
        <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-sky-600 text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function PhotoCard({
  photo,
  onCaption,
  onRemove,
  onView,
}: {
  photo: ProjectPhoto;
  onCaption: (c: string) => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption);

  return (
    <figure className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <button
        onClick={onView}
        className="block aspect-[4/3] w-full overflow-hidden bg-slate-100"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || photo.phase}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      </button>

      <button
        onClick={onRemove}
        className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-500 opacity-0 shadow transition-opacity hover:bg-white hover:text-red-600 group-hover:opacity-100"
        title="Delete photo"
        aria-label="Delete photo"
      >
        <TrashIcon className="h-4 w-4" />
      </button>

      <figcaption className="bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-800">
            {photo.phase}
          </span>
          <time className="text-[10px] text-slate-400" dateTime={photo.uploaded_at}>
            {new Date(photo.uploaded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </time>
        </div>
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption !== photo.caption && onCaption(caption)}
          placeholder="Add caption…"
          className="mt-1 w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
      </figcaption>
    </figure>
  );
}

function Lightbox({ photo, onClose }: { photo: ProjectPhoto; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <XMarkIcon className="h-6 w-6" />
      </button>
      <div className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || photo.phase}
          className="max-h-[80vh] max-w-full rounded-lg object-contain"
        />
        <div className="mt-3 text-center text-sm text-white">
          <span className="rounded-full bg-sky-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            {photo.phase}
          </span>
          {photo.caption && <span className="ml-2">{photo.caption}</span>}
        </div>
      </div>
    </div>
  );
}
