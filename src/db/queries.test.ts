import { buildListQuery, escapeLike } from './queries';

describe('buildListQuery', () => {
  test('defaults to recent-first with no filters', () => {
    const { sql, params } = buildListQuery({ sort: 'recent' });
    expect(sql).toBe('SELECT * FROM places ORDER BY created_at DESC');
    expect(params).toEqual([]);
  });

  test('sorts by name when requested', () => {
    const { sql } = buildListQuery({ sort: 'name' });
    expect(sql).toContain('ORDER BY name COLLATE NOCASE ASC');
  });

  test('adds a keyword filter across name and address', () => {
    const { sql, params } = buildListQuery({ sort: 'recent', query: '카페' });
    expect(sql).toContain("WHERE (name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')");
    expect(params).toEqual(['%카페%', '%카페%']);
  });

  test('escapes LIKE wildcards in the keyword so they match literally', () => {
    const { params } = buildListQuery({ sort: 'recent', query: '50%_off' });
    expect(params).toEqual(['%50\\%\\_off%', '%50\\%\\_off%']);
  });

  test('adds a date range filter', () => {
    const { sql, params } = buildListQuery({
      sort: 'recent',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    });
    expect(sql).toContain('created_at >= ?');
    expect(sql).toContain('created_at <= ?');
    expect(params).toEqual(['2026-08-01', '2026-08-31']);
  });

  test('combines keyword and date filters with AND', () => {
    const { sql } = buildListQuery({ sort: 'recent', query: '카페', dateFrom: '2026-08-01' });
    expect(sql).toContain(
      "WHERE (name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\') AND created_at >= ?"
    );
  });
});

describe('escapeLike', () => {
  test('leaves ordinary text alone', () => {
    expect(escapeLike('성수동 카페')).toBe('성수동 카페');
  });

  test('escapes wildcards and the escape character itself', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
  });
});
