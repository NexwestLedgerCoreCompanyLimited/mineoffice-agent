import { ImageAttachment } from '@shared/types';

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the smallest limit among the AI services

const SIGNATURES: { mimeType: string; matches: (data: Buffer) => boolean }[] = [
  { mimeType: 'image/png', matches: data => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/jpeg', matches: data => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  { mimeType: 'image/gif', matches: data => ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('latin1')) },
  {
    mimeType: 'image/webp',
    matches: data => data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
  }
];

/** What the file really is, from its bytes. A name or a claimed type proves nothing. */
export function detectImageType(data: Buffer): string | undefined {
  return SIGNATURES.find(signature => signature.matches(data))?.mimeType;
}

/** Keeps only real images within the limits, and throws with a reason a person can act on. */
export function validateImages(images: unknown): ImageAttachment[] {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images)) throw new Error('Images must be a list.');
  if (images.length > MAX_IMAGES) throw new Error(`You can attach up to ${MAX_IMAGES} images.`);

  return images.map((image: any) => {
    const name = String(image?.name || 'image').slice(0, 120);
    const base64 = typeof image?.base64 === 'string' ? image.base64.replace(/^data:[^,]*,/, '') : '';
    const data = Buffer.from(base64, 'base64');
    if (data.length === 0) throw new Error(`"${name}" is empty.`);
    if (data.length > MAX_IMAGE_BYTES) throw new Error(`"${name}" is larger than 5 MB.`);

    const mimeType = detectImageType(data);
    if (!mimeType) throw new Error(`"${name}" is not a PNG, JPEG, WebP or GIF image.`);
    return { name, mimeType, base64 };
  });
}
