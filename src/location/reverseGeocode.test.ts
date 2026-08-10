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

  test('collapses a district that is also a prefix of the street (lot-number addresses)', () => {
    expect(
      formatAddress({ region: '제주특별자치도', city: '제주시', district: '일도이동', street: '일도이동 389-1' })
    ).toBe('제주특별자치도 제주시 일도이동 389-1');
  });

  test('collapses when the shorter duplicate appears after the longer one', () => {
    expect(formatAddress({ street: '일도이동 389-1', name: '일도이동' })).toBe('일도이동 389-1');
  });
});
