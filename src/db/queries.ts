export type ListPlacesOptions = {
  sort: 'recent' | 'name';
  query?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function buildListQuery(options: ListPlacesOptions): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.query && options.query.trim().length > 0) {
    clauses.push('(name LIKE ? OR address LIKE ?)');
    const like = `%${options.query.trim()}%`;
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

  const orderBy = options.sort === 'name' ? 'name COLLATE NOCASE ASC' : 'created_at DESC';
  const parts = ['SELECT * FROM places'];
  if (clauses.length > 0) parts.push(`WHERE ${clauses.join(' AND ')}`);
  parts.push(`ORDER BY ${orderBy}`);

  return { sql: parts.join(' '), params };
}
