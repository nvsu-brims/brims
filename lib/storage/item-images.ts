// Real path: lib/storage/item-images.ts
//
// Item picture storage (public Supabase Storage bucket `item-images`).
// Server only — called from the Server Actions in admin/items/actions.ts,
// which have already checked that the caller is an admin for this item.
import { createAdminClient } from "@/lib/supabase/admin";

export const ITEM_IMAGE_BUCKET = "item-images";
export const MAX_ITEM_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

export type ValidatedImage = {
  buffer: Buffer;
  ext: "jpg" | "png";
  contentType: "image/jpeg" | "image/png";
};

export type ImageValidation =
  | ({ ok: true } & ValidatedImage)
  | { ok: false; error: string };

/**
 * Server-side validation, run BEFORE anything is uploaded or written.
 * The type is decided by the file's leading bytes ("magic bytes"), never by
 * the filename or the browser-declared MIME type, so a renamed .exe or script
 * can't pass as .jpg. The extension in the stored filename comes from the
 * detected type too.
 */
export async function validateItemImage(file: File): Promise<ImageValidation> {
  if (file.size === 0) return { ok: false, error: "The picture file is empty." };
  if (file.size > MAX_ITEM_IMAGE_BYTES) {
    return { ok: false, error: "The picture must be 10MB or smaller." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Re-check on the real bytes; file.size comes from the request.
  if (buffer.length > MAX_ITEM_IMAGE_BYTES) {
    return { ok: false, error: "The picture must be 10MB or smaller." };
  }

  const isPng =
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (isPng) return { ok: true, buffer, ext: "png", contentType: "image/png" };

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  if (isJpeg) return { ok: true, buffer, ext: "jpg", contentType: "image/jpeg" };

  return { ok: false, error: "The picture must be a PNG or JPEG image." };
}

/** Uploads to `items/{itemId}-{timestamp}.{ext}` and returns the public URL. */
export async function uploadItemImage(
  itemId: number,
  image: ValidatedImage
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const supabase = createAdminClient();
    const path = `items/${itemId}-${Date.now()}.${image.ext}`;
    const { error } = await supabase.storage
      .from(ITEM_IMAGE_BUCKET)
      .upload(path, image.buffer, {
        contentType: image.contentType,
        upsert: false,
      });
    if (error) {
      console.error("Item image upload failed:", error.message);
      return { ok: false, error: "Could not upload the picture. Please try again." };
    }
    const { data } = supabase.storage.from(ITEM_IMAGE_BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch (error) {
    console.error("Item image upload failed:", error);
    return { ok: false, error: "Could not upload the picture. Please try again." };
  }
}

/**
 * Best-effort delete of a stored picture, given the public URL saved in
 * `imageUrl`. Never throws: a failed delete only leaves an orphaned file
 * (harmless clutter), and must never fail the item action that called it.
 * URLs that aren't from this bucket are ignored.
 */
export async function deleteItemImageByUrl(
  url: string | null | undefined
): Promise<void> {
  if (!url) return;
  const marker = `/storage/v1/object/public/${ITEM_IMAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.storage
      .from(ITEM_IMAGE_BUCKET)
      .remove([path]);
    if (error) console.error("Item image delete failed:", error.message);
  } catch (error) {
    console.error("Item image delete failed:", error);
  }
}