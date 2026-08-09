export type ListPlacesOptions = {
  sort: 'recent' | 'name';
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
};

/** Treat `%`, `_` and the escape char itself as literals inside a LIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildListQuery(options: ListPlacesOptions): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.query && options.query.trim().length > 0) {
    clauses.push("(name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(options.query.trim())}%`;
    params.push(like, like);
  }
  if (options.dateFrom) {
    clauses.push('created_at >= ?');
    params.push(options.dateFrom);
  }
  if (options.dateTo) {
    clauses.push('created_at <= ?');
    params.push(options.dateTo);
  }
  if (options.categoryId) {
    clauses.push('id IN (SELECT place_id FROM place_categories WHERE category_id = ?)');
    params.push(options.categoryId);
  }

  const orderBy = options.sort === 'name' ? 'name COLLATE NOCASE ASC' : 'created_at DESC';
  const parts = ['SELECT * FROM places'];
  if (clauses.length > 0) parts.push(`WHERE ${clauses.join(' AND ')}`);
  parts.push(`ORDER BY ${orderBy}`);

  return { sql: parts.join(' '), params };
}
