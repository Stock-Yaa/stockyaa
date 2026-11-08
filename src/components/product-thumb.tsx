import { ImageOff } from "lucide-react";
import Image from "next/image";
import { productImageUrl } from "@/lib/product-images-client";
import { cn } from "@/lib/utils";

/** A product's main photo as a small square, or a placeholder without one. */
export function ProductThumb({
  photoId,
  label,
  size = 40,
  className,
}: {
  photoId: string | null;
  /** Accessible text for the placeholder ("No photo"). */
  label: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted", className)}
      style={{ width: size, height: size }}
    >
      {photoId ? (
        <Image src={productImageUrl(photoId)} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" />
      ) : (
        <ImageOff className="size-4 text-muted-foreground/60" aria-label={label} />
      )}
    </span>
  );
}
