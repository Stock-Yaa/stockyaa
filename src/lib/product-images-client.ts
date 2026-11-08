/* Client-safe parts of ./product-images (no database imports). */

export const MAX_PRODUCT_PHOTOS = 10;
export const productImageUrl = (id: string) => `/products/images/${id}`;

export type PhotoRef = { id: string; isMain: boolean };
