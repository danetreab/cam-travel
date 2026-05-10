export type FieldComparison<T> = {
  is?: boolean | null;
  isNot?: boolean | null;
  eq?: T;
  neq?: T;
  gt?: T;
  gte?: T;
  lt?: T;
  lte?: T;
  like?: string;
  notLike?: string;
  iLike?: string;
  notILike?: string;
  in?: T[];
  notIn?: T[];
};

export type Filter<TDto> = {
  and?: Filter<TDto>[];
  or?: Filter<TDto>[];
} & {
  [K in keyof TDto]?: FieldComparison<TDto[K]>;
};

export type Sort<TDto> = {
  field: keyof TDto & string;
  direction: 'ASC' | 'DESC';
  nulls?: 'NULLS_FIRST' | 'NULLS_LAST';
};

export interface OffsetPagingInput {
  limit?: number;
  offset?: number;
}

export interface QueryInput<TDto> {
  filter?: Filter<TDto>;
  paging?: OffsetPagingInput;
  sorting?: Sort<TDto>[];
}

export interface QueryResult<TDto> {
  nodes: TDto[];
  totalCount: number;
}

export type Dialect = 'pg' | 'sqlite';

export interface DrizzleQueryServiceOptions {
  idColumn?: string;
  softDelete?: { column: string; deletedValue: unknown };
  dialect?: Dialect;
}
