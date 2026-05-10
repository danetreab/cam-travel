import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  notLike,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type {
  DrizzleQueryServiceOptions,
  FieldComparison,
  Filter,
  QueryInput,
  QueryResult,
  Sort,
} from './types';

/**
 * Generic Drizzle data layer used by both GraphQL resolvers (via CrudResolver)
 * and REST controllers (via RestQueryAdapter). Translates the nestjs-query-shaped
 * filter/sort/paging inputs into Drizzle query-builder calls.
 *
 * Dialect-aware where it matters: SQLite has no ILIKE and no NULLS FIRST/LAST,
 * so those are emulated when `opts.dialect === 'sqlite'`.
 */
export class DrizzleQueryService<TDto = any> {
  protected readonly idColumnName: string;
  protected readonly dialect: 'pg' | 'sqlite';

  constructor(
    protected readonly db: any,
    protected readonly table: any,
    protected readonly opts: DrizzleQueryServiceOptions = {},
  ) {
    this.idColumnName = opts.idColumn ?? 'id';
    this.dialect = opts.dialect ?? 'pg';
  }

  protected get cols(): Record<string, any> {
    return this.table as Record<string, any>;
  }

  protected get idCol(): any {
    const col = this.cols[this.idColumnName];
    if (!col) {
      throw new Error(
        `[DrizzleQueryService] id column "${this.idColumnName}" not found on table`,
      );
    }
    return col;
  }

  // --- Read ---------------------------------------------------------------

  async query(input: QueryInput<TDto>): Promise<QueryResult<TDto>> {
    const where = this.buildWhere(input.filter);
    const orderBy = (input.sorting ?? []).map((s) => this.buildSort(s));
    const limit = input.paging?.limit ?? 10;
    const offset = input.paging?.offset ?? 0;

    const rowsP = this.applyOrderAndPage(
      this.db.select().from(this.table).where(where),
      orderBy,
      limit,
      offset,
    );

    const countP = this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(this.table)
      .where(where);

    const [nodes, countRows] = await Promise.all([rowsP, countP]);
    const totalCount = (countRows[0]?.value as number | undefined) ?? 0;
    return { nodes: nodes as TDto[], totalCount };
  }

  protected applyOrderAndPage(qb: any, orderBy: SQL[], limit: number, offset: number) {
    let q = qb;
    if (orderBy.length) q = q.orderBy(...orderBy);
    return q.limit(limit).offset(offset);
  }

  async findById(id: string | number): Promise<TDto | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(this.idCol, id))
      .limit(1);
    return ((rows[0] as TDto | undefined) ?? null) as TDto | null;
  }

  // --- Write --------------------------------------------------------------

  async createOne(input: Partial<TDto>): Promise<TDto> {
    const rows = await this.db.insert(this.table).values(input).returning();
    return rows[0] as TDto;
  }

  async createMany(inputs: Partial<TDto>[]): Promise<TDto[]> {
    if (inputs.length === 0) return [];
    const rows = await this.db.insert(this.table).values(inputs).returning();
    return rows as TDto[];
  }

  async updateOne(id: string | number, input: Partial<TDto>): Promise<TDto> {
    const rows = await this.db
      .update(this.table)
      .set(input)
      .where(eq(this.idCol, id))
      .returning();
    if (!rows[0]) throw new Error(`[DrizzleQueryService] updateOne: no row with id=${id}`);
    return rows[0] as TDto;
  }

  async updateMany(
    filter: Filter<TDto>,
    input: Partial<TDto>,
  ): Promise<{ updatedCount: number }> {
    const where = this.buildWhere(filter);
    const rows = await this.db
      .update(this.table)
      .set(input)
      .where(where)
      .returning({ id: this.idCol });
    return { updatedCount: rows.length };
  }

  async deleteOne(id: string | number): Promise<TDto> {
    if (this.opts.softDelete) {
      const rows = await this.db
        .update(this.table)
        .set({ [this.opts.softDelete.column]: this.opts.softDelete.deletedValue })
        .where(eq(this.idCol, id))
        .returning();
      if (!rows[0]) throw new Error(`[DrizzleQueryService] deleteOne: no row with id=${id}`);
      return rows[0] as TDto;
    }
    const rows = await this.db.delete(this.table).where(eq(this.idCol, id)).returning();
    if (!rows[0]) throw new Error(`[DrizzleQueryService] deleteOne: no row with id=${id}`);
    return rows[0] as TDto;
  }

  async deleteMany(filter: Filter<TDto>): Promise<{ deletedCount: number }> {
    const where = this.buildWhere(filter);
    if (this.opts.softDelete) {
      const rows = await this.db
        .update(this.table)
        .set({ [this.opts.softDelete.column]: this.opts.softDelete.deletedValue })
        .where(where)
        .returning({ id: this.idCol });
      return { deletedCount: rows.length };
    }
    const rows = await this.db.delete(this.table).where(where).returning({ id: this.idCol });
    return { deletedCount: rows.length };
  }

  // --- Filter / Sort translation -----------------------------------------

  protected buildWhere(filter?: Filter<TDto>): SQL | undefined {
    if (!filter) return undefined;
    const parts: SQL[] = [];

    if (filter.and?.length) {
      const inner = filter.and
        .map((f) => this.buildWhere(f))
        .filter((s): s is SQL => Boolean(s));
      if (inner.length) {
        const combined = and(...inner);
        if (combined) parts.push(combined);
      }
    }
    if (filter.or?.length) {
      const inner = filter.or
        .map((f) => this.buildWhere(f))
        .filter((s): s is SQL => Boolean(s));
      if (inner.length) {
        const combined = or(...inner);
        if (combined) parts.push(combined);
      }
    }

    for (const [field, cmp] of Object.entries(filter)) {
      if (field === 'and' || field === 'or' || cmp == null) continue;
      const col = this.cols[field];
      if (!col) continue; // unknown field — silently drop. Tighten later if needed.
      const part = this.buildFieldComparison(col, cmp as FieldComparison<unknown>);
      if (part) parts.push(part);
    }

    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return and(...parts);
  }

  protected buildFieldComparison(col: any, cmp: FieldComparison<unknown>): SQL | undefined {
    const ops: SQL[] = [];

    if (cmp.eq !== undefined) ops.push(eq(col, cmp.eq));
    if (cmp.neq !== undefined) ops.push(ne(col, cmp.neq));
    if (cmp.gt !== undefined) ops.push(gt(col, cmp.gt as any));
    if (cmp.gte !== undefined) ops.push(gte(col, cmp.gte as any));
    if (cmp.lt !== undefined) ops.push(lt(col, cmp.lt as any));
    if (cmp.lte !== undefined) ops.push(lte(col, cmp.lte as any));
    if (cmp.like !== undefined) ops.push(like(col, cmp.like));
    if (cmp.notLike !== undefined) ops.push(notLike(col, cmp.notLike));
    if (cmp.iLike !== undefined) ops.push(this.iLikeOp(col, cmp.iLike));
    if (cmp.notILike !== undefined) ops.push(sql`NOT (${this.iLikeOp(col, cmp.notILike)})`);
    if (cmp.in !== undefined) ops.push(inArray(col, cmp.in as unknown[]));
    if (cmp.notIn !== undefined) ops.push(notInArray(col, cmp.notIn as unknown[]));

    // nestjs-query convention:
    //   { is:  null }  → IS NULL
    //   { is:  true }  → IS NOT NULL
    //   { isNot: null }→ IS NOT NULL
    //   { isNot: true }→ IS NULL
    if (cmp.is === null) ops.push(isNull(col));
    if (cmp.is === true) ops.push(isNotNull(col));
    if (cmp.isNot === null) ops.push(isNotNull(col));
    if (cmp.isNot === true) ops.push(isNull(col));

    if (ops.length === 0) return undefined;
    if (ops.length === 1) return ops[0];
    return and(...ops);
  }

  protected iLikeOp(col: any, val: string): SQL {
    return this.dialect === 'sqlite'
      ? sql`LOWER(${col}) LIKE LOWER(${val})`
      : ilike(col, val);
  }

  protected buildSort(s: Sort<TDto>): SQL {
    const col = this.cols[s.field];
    if (!col) {
      throw new Error(`[DrizzleQueryService] sort field "${String(s.field)}" not found on table`);
    }
    const base = s.direction === 'DESC' ? desc(col) : asc(col);
    if (!s.nulls) return base;

    if (this.dialect === 'sqlite') {
      // SQLite: emulate NULLS FIRST/LAST via an `IS NULL` precondition.
      const nullsFirst = s.nulls === 'NULLS_FIRST';
      const nullPart = nullsFirst ? sql`(${col} IS NULL) DESC` : sql`(${col} IS NULL) ASC`;
      return sql`${nullPart}, ${base}`;
    }
    return s.nulls === 'NULLS_FIRST' ? sql`${base} NULLS FIRST` : sql`${base} NULLS LAST`;
  }
}
