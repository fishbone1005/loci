jest.mock('../supabase/client', () => ({ supabase: {} }));
jest.mock('../db/placesRepo', () => ({ listPlaces: jest.fn(), upsertRemotePlace: jest.fn() }));

import { placesToPull } from './pull';

describe('placesToPull', () => {
  test('returns remote ids missing locally', () => {
    expect(placesToPull(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c']);
  });

  test('returns empty when everything is already local', () => {
    expect(placesToPull(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });

  test('returns all remote ids when local is empty', () => {
    expect(placesToPull(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
