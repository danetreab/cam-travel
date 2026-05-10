import type { Type } from '@nestjs/common';
import { Field, InputType, registerEnumType } from '@nestjs/graphql';
import { SortDirection, SortNulls } from './comparisons';
import { getSortableFields } from './decorators';
import { deriveEntityName } from './util';

const cache = new WeakMap<Function, Type<any>>();

/**
 * Builds <Entity>Sort input + the dynamically-named <Entity>SortFields enum.
 *
 * The enum's values mirror the keys of @SortableField properties on the DTO.
 * registerEnumType is called once per DTO; subsequent calls return the cached class.
 */
export function SortType<T>(DTOClass: Type<T>): Type<any> {
  const cached = cache.get(DTOClass);
  if (cached) return cached;

  const fieldNames = getSortableFields(DTOClass);
  if (fieldNames.length === 0) {
    throw new Error(
      `[nestjs-query-drizzle] SortType(${DTOClass.name}): no @SortableField found. ` +
        `At least one @SortableField is required to build the <Entity>SortFields enum.`,
    );
  }

  // Build a stable enum object whose keys === values.
  const SortFieldsEnum: Record<string, string> = {};
  for (const f of fieldNames) SortFieldsEnum[f] = f;

  const entityName = deriveEntityName(DTOClass);
  registerEnumType(SortFieldsEnum, { name: `${entityName}SortFields` });

  @InputType(`${entityName}Sort`)
  class GeneratedSort {}

  Field(() => SortFieldsEnum)(GeneratedSort.prototype, 'field');
  Field(() => SortDirection)(GeneratedSort.prototype, 'direction');
  Field(() => SortNulls, { nullable: true })(GeneratedSort.prototype, 'nulls');

  cache.set(DTOClass, GeneratedSort as Type<any>);
  return GeneratedSort as Type<any>;
}
