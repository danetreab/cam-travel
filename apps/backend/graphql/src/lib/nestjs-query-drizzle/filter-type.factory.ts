import type { Type } from '@nestjs/common';
import { Field, ID, InputType } from '@nestjs/graphql';
import { deriveEntityName } from './util';
import {
  BooleanFieldComparison,
  DateFieldComparison,
  IDFilterComparison,
  NumberFieldComparison,
  StringFieldComparison,
} from './comparisons';
import { getFilterableFields, getIdField, type FilterableFieldMeta } from './decorators';

const cache = new WeakMap<Function, Type<any>>();

/**
 * Builds <Entity>Filter input. One field per @FilterableField on the DTO,
 * each typed by the right *FieldComparison input. Includes self-referential
 * `and` / `or` for arbitrary boolean nesting.
 */
export function FilterType<T>(DTOClass: Type<T>): Type<any> {
  const cached = cache.get(DTOClass);
  if (cached) return cached;

  const fields = getFilterableFields(DTOClass);
  const idFieldName = getIdField(DTOClass);

  @InputType(`${deriveEntityName(DTOClass)}Filter`)
  class GeneratedFilter {}

  // Self-referential and/or — must reference GeneratedFilter itself, after the class exists.
  Field(() => [GeneratedFilter], { nullable: true })(GeneratedFilter.prototype, 'and');
  Field(() => [GeneratedFilter], { nullable: true })(GeneratedFilter.prototype, 'or');

  for (const f of fields) {
    const Cmp = pickComparisonInput(f, idFieldName);
    Field(() => Cmp, { nullable: true })(GeneratedFilter.prototype, f.propertyKey);
  }

  cache.set(DTOClass, GeneratedFilter as Type<any>);
  return GeneratedFilter as Type<any>;
}

function pickComparisonInput(meta: FilterableFieldMeta, idFieldName: string): Type<any> {
  if (meta.propertyKey === idFieldName) return IDFilterComparison;

  const t = meta.type();
  if (t === ID) return IDFilterComparison;
  if (t === String) return StringFieldComparison;
  if (t === Number) return NumberFieldComparison;
  if (t === Boolean) return BooleanFieldComparison;
  if (t === Date) return DateFieldComparison;
  // For custom scalars / enums, callers should pass an explicit type thunk that
  // resolves to one of the comparison classes — or extend pickComparisonInput here.
  return StringFieldComparison;
}
