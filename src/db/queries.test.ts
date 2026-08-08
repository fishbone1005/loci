import { buildListQuery } from './queries';

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
    expect(sql).toContain('WHERE (name LIKE ? OR address LIKE ?)');
    expect(params).toEqual(['%카페%', '%카페%']);
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
    expect(sql).toContain('WHERE (name LIKE ? OR address LIKE ?) AND created_at >= ?');
  });
});
