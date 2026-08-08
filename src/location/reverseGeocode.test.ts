import { formatAddress } from './reverseGeocode';

describe('formatAddress', () => {
  test('joins region/city/district/street when all present', () => {
    expect(
      formatAddress({ region: '서울특별시', city: '마포구', district: '연남동', street: '동교로 158' })
    ).toBe('서울특별시 마포구 연남동 동교로 158');
  });

  test('skips missing fields without leaving blanks', () => {
    expect(formatAddress({ region: '서울특별시', city: '마포구' })).toBe('서울특별시 마포구');
  });

  test('drops duplicate consecutive parts', () => {
    expect(formatAddress({ region: '서울특별시', city: '서울특별시', district: '마포구' })).toBe(
      '서울특별시 마포구'
    );
  });

  test('returns empty string when nothing is available', () => {
    expect(formatAddress({})).toBe('');
  });
});
