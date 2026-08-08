import { processSyncQueue, SyncDeps } from './syncQueue';
import type { Place, Photo } from '../types';

function makePlace(id: string): Place {
  return {
    id,
    userId: 'u1',
    name: `장소 ${id}`,
    address: '서울',
    latitude: 37.5,
    longitude: 127,
    memo: '',
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    synced: false,
  };
}

function makePhoto(id: string, placeId: string): Photo {
  return { id, placeId, storagePath: null, localUri: `file://${id}.jpg`, sortOrder: 0, synced: false };
}

describe('processSyncQueue', () => {
  test('skips entirely when offline', async () => {
    const deps: SyncDeps = {
      listUnsyncedPlaces: jest.fn(() => [makePlace('p1')]),
      listUnsyncedPhotos: jest.fn(() => []),
      isOnline: async () => false,
      uploadPlace: jest.fn(async () => {}),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced: jest.fn(),
      markPhotoSynced: jest.fn(),
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0, skippedOffline: true });
    expect(deps.uploadPlace).not.toHaveBeenCalled();
  });

  test('uploads each pending place and its photos, then marks them synced', async () => {
    const place = makePlace('p1');
    const photo = makePhoto('ph1', 'p1');
    const markPlaceSynced = jest.fn();
    const markPhotoSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => [place],
      listUnsyncedPhotos: () => [photo],
      isOnline: async () => true,
      uploadPlace: jest.fn(async () => {}),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced,
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0, skippedOffline: false });
    expect(markPhotoSynced).toHaveBeenCalledWith('ph1');
    expect(markPlaceSynced).toHaveBeenCalledWith('p1');
  });

  test('leaves a place unsynced when upload fails, without throwing', async () => {
    const place = makePlace('p1');
    const markPlaceSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => [place],
      listUnsyncedPhotos: () => [],
      isOnline: async () => true,
      uploadPlace: jest.fn(async () => {
        throw new Error('network blip');
      }),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced: jest.fn(),
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 1, succeeded: 0, failed: 1, skippedOffline: false });
    expect(markPlaceSynced).not.toHaveBeenCalled();
  });

  test('retries a previously failed place on the next call and can succeed', async () => {
    const place = makePlace('p1');
    let attempt = 0;
    const markPlaceSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => [place],
      listUnsyncedPhotos: () => [],
      isOnline: async () => true,
      uploadPlace: jest.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('network blip');
      }),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced: jest.fn(),
    };

    const first = await processSyncQueue(deps);
    expect(first.failed).toBe(1);
    expect(markPlaceSynced).not.toHaveBeenCalled();

    const second = await processSyncQueue(deps);
    expect(second.succeeded).toBe(1);
    expect(markPlaceSynced).toHaveBeenCalledWith('p1');
  });

  test('processes multiple pending places independently', async () => {
    const places = [makePlace('p1'), makePlace('p2')];
    const markPlaceSynced = jest.fn();

    const deps: SyncDeps = {
      listUnsyncedPlaces: () => places,
      listUnsyncedPhotos: () => [],
      isOnline: async () => true,
      uploadPlace: jest.fn(async (p: Place) => {
        if (p.id === 'p2') throw new Error('fail p2');
      }),
      uploadPhoto: jest.fn(async () => {}),
      markPlaceSynced,
      markPhotoSynced: jest.fn(),
    };

    const result = await processSyncQueue(deps);

    expect(result).toEqual({ attempted: 2, succeeded: 1, failed: 1, skippedOffline: false });
    expect(markPlaceSynced).toHaveBeenCalledWith('p1');
    expect(markPlaceSynced).not.toHaveBeenCalledWith('p2');
  });
});
