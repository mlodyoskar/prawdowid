import { ImageInput, MAX_IMAGE_BASE64_LENGTH } from '@prawdowid/contracts';

export type AttachedImage = {
  name: string;
  previewUrl: string;
  input: ImageInput;
};

const MEDIA_TYPES: readonly string[] = ImageInput.shape.mediaType.options;
export const IMAGE_ACCEPT = MEDIA_TYPES.join(',');

/** Reads a picked or pasted file into the API's image input. Throws a user-facing message. */
export async function readImage(file: File): Promise<AttachedImage> {
  if (!MEDIA_TYPES.includes(file.type)) {
    throw new Error('Obsługujemy zdjęcia JPG, PNG i WebP.');
  }
  // Base64 grows the payload by 4/3.
  if (Math.ceil(file.size / 3) * 4 > MAX_IMAGE_BASE64_LENGTH) {
    throw new Error('Zdjęcie jest za duże. Limit to około 5 MB.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Nie udało się odczytać pliku.')),
    );
    reader.addEventListener('error', () => reject(new Error('Nie udało się odczytać pliku.')));
    reader.readAsDataURL(file);
  });
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const parsed = ImageInput.safeParse({ mediaType: file.type, data });
  if (!parsed.success) throw new Error('Nie udało się odczytać pliku.');
  return {
    name: file.name || 'wklejony obraz',
    previewUrl: URL.createObjectURL(file),
    input: parsed.data,
  };
}
