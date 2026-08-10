import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { supabase } from '../supabase/client';
import type { Photo } from '../types';

const PHOTO_DIR = 'photos';

/**
 * Copy picker-provided photos out of the OS cache into the app's document
 * directory. `expo-image-picker` hands back URIs into a temp/cache folder that
 * the system is free to purge, which would leave records pointing at nothing.
 *
 * Returns the permanent `file://` URIs. A photo that fails to copy is dropped
 * rather than stored as a dangling cache URI.
 */
export async function persistPhotos(uris: string[]): Promise<string[]> {
  if (uris.length === 0) return [];

  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const saved: string[] = [];
  for (const uri of uris) {
    try {
      const destination = new File(dir, `${Crypto.randomUUID()}.jpg`);
      await new File(uri).copy(destination);
      saved.push(destination.uri);
    } catch {
      // Skip this photo; the rest of the record is still worth saving.
    }
  }
  return saved;
}

/**
 * Resolve the URI to render for a photo: the local file when we have one,
 * otherwise a short-lived signed Storage URL (cloud-restored photos have
 * `storagePath` but no local file yet).
 */
export function usePhotoUri(photo: Pick<Photo, 'localUri' | 'storagePath'> | null | undefined): string | null {
  const [uri, setUri] = useState<string | null>(photo?.localUri ?? null);

  useEffect(() => {
    if (!photo) {
      setUri(null);
      return;
    }
    if (photo.localUri) {
      setUri(photo.localUri);
      return;
    }
    if (!photo.storagePath) {
      setUri(null);
      return;
    }

    let cancelled = false;
    supabase.storage
      .from('place-photos')
      .createSignedUrl(photo.storagePath, 3600)
      .then(({ data }) => {
        if (!cancelled) setUri(data?.signedUrl ?? null);
      })
      // ponytail: no caching of signed URLs — re-resolves per mount, fine at
      // personal-app scale; memoize by storagePath if it ever gets chatty.
      .catch(() => {
        if (!cancelled) setUri(null);
      });

    return () => {
      cancelled = true;
    };
  }, [photo?.localUri, photo?.storagePath]);

  return uri;
}
