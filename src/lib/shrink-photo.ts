/*
 * Shrinks a photo in the browser before upload: big enough to read a receipt
 * or recognise a product, small enough to send quickly from a phone.
 * Client-only (uses canvas).
 */

const MAX_SIDE = 1600;

export async function shrinkPhoto(file: File, name = "photo.jpg"): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (context) {
      // White behind transparent PNGs, which JPEG cannot keep.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob ? new File([blob], name, { type: "image/jpeg" }) : file;
  } catch {
    // Not an image the browser can read: let the server refuse it.
    return file;
  }
}
