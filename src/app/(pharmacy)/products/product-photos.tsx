"use client";

import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n/client";
import { MAX_PRODUCT_PHOTOS, productImageUrl, type PhotoRef } from "@/lib/product-images-client";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { cn } from "@/lib/utils";
import { deletePhoto, setMainPhoto, uploadProductPhoto } from "./actions";

/** A photo picked for a product that is not saved yet. */
export type QueuedPhoto = { key: string; file: File; url: string };

/** Uploads photos one by one; returns how many failed. */
export async function uploadPhotos(productId: string, files: File[]): Promise<number> {
  let failed = 0;
  for (const file of files) {
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("photo", await shrinkPhoto(file), "photo.jpg");
    const result = await uploadProductPhoto(formData).catch(() => null);
    if (!result?.ok) {
      failed++;
      if (result?.message) toast.error(result.message);
    }
  }
  return failed;
}

function Thumb({
  src,
  main,
  busy,
  onMain,
  onDelete,
}: {
  src: string;
  main: boolean;
  busy: boolean;
  onMain: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg border bg-muted",
        main ? "border-primary ring-2 ring-primary" : "border-border",
      )}
    >
      <Image src={src} alt="" fill unoptimized sizes="120px" className="object-cover" />
      {main && (
        <span className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {t("products.mainPhoto")}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/45 p-1">
        {!main && (
          <button
            type="button"
            onClick={onMain}
            disabled={busy}
            aria-label={t("products.makeMain")}
            title={t("products.makeMain")}
            className="rounded p-1 text-white hover:bg-white/20"
          >
            <Star className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={t("products.deletePhoto")}
          title={t("products.deletePhoto")}
          className="rounded p-1 text-white hover:bg-white/20"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * The photos of a product in its form. For a saved product every change is
 * stored at once; for a new one, picked photos wait in `queued` and are
 * uploaded after the product is created (the first one becomes main).
 */
export function ProductPhotos({
  productId,
  photos,
  queued,
  onQueue,
}: {
  productId: string | null;
  photos: PhotoRef[];
  queued: QueuedPhoto[];
  onQueue: (next: QueuedPhoto[]) => void;
}) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, startTransition] = useTransition();
  const count = productId ? photos.length : queued.length;
  const room = MAX_PRODUCT_PHOTOS - count;

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []).slice(0, Math.max(0, room));
    if (input.current) input.current.value = "";
    if (picked.length === 0) return;
    if (!productId) {
      onQueue([
        ...queued,
        ...picked.map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
      ]);
      return;
    }
    setUploading(true);
    const failed = await uploadPhotos(productId, picked);
    setUploading(false);
    if (failed < picked.length) toast.success(t("products.photosAdded", { count: picked.length - failed }));
    router.refresh();
  }

  function run(action: () => Promise<{ ok: boolean; message?: string } | null>) {
    startTransition(async () => {
      const result = await action();
      if (result?.message) (result.ok ? toast.success : toast.error)(result.message);
      router.refresh();
    });
  }

  return (
    <div className="sm:col-span-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{t("products.photos")}</p>
        <p className="text-xs text-muted-foreground">
          {t("products.photosHint", { count, max: MAX_PRODUCT_PHOTOS })}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {productId
          ? photos.map((photo) => (
              <Thumb
                key={photo.id}
                src={productImageUrl(photo.id)}
                main={photo.isMain}
                busy={busy}
                onMain={() => run(() => setMainPhoto(photo.id))}
                onDelete={() => run(() => deletePhoto(photo.id))}
              />
            ))
          : queued.map((photo, index) => (
              <Thumb
                key={photo.key}
                src={photo.url}
                main={index === 0}
                busy={false}
                // The first queued photo becomes the main one.
                onMain={() => onQueue([photo, ...queued.filter((q) => q.key !== photo.key)])}
                onDelete={() => {
                  URL.revokeObjectURL(photo.url);
                  onQueue(queued.filter((q) => q.key !== photo.key));
                }}
              />
            ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {uploading ? t("products.uploading") : t("products.addPhotos")}
          </button>
        )}
      </div>
      {count === 0 && <p className="mt-1.5 text-xs text-warning">{t("products.noPhotoYet")}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => onPick(e.target.files)}
        aria-label={t("products.addPhotos")}
      />
    </div>
  );
}
