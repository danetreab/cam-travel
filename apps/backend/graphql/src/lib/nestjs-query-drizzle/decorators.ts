import 'reflect-metadata';
import { Field, ID } from '@nestjs/graphql';

type FieldOptions = Record<string, any>;

export const FILTERABLE_FIELDS = 'nq:filterable-fields';
export const SORTABLE_FIELDS = 'nq:sortable-fields';
export const ID_FIELD = 'nq:id-field';

export type ComparisonKey =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'notLike'
  | 'iLike'
  | 'notILike'
  | 'in'
  | 'notIn'
  | 'is'
  | 'isNot';

export interface FilterableFieldMeta {
  propertyKey: string;
  /** Type thunk: () => String | Number | Boolean | Date | ID-marker | enum */
  type: () => unknown;
  allowedComparisons?: ComparisonKey[];
}

export interface FilterableFieldOptions extends FieldOptions {
  allowedComparisons?: ComparisonKey[];
}

/**
 * Marks a DTO property as filterable. Auto-applies @Field for the underlying
 * GraphQL type, and records metadata so FilterType(DTO) can build the
 * <Entity>Filter input with the right *FieldComparison per property.
 */
export function FilterableField(
  typeOrOptions?: (() => unknown) | FilterableFieldOptions,
  maybeOptions?: FilterableFieldOptions,
): PropertyDecorator {
  const isTypeFn = typeof typeOrOptions === 'function';
  const typeFn = isTypeFn ? (typeOrOptions as () => unknown) : undefined;
  const options: FilterableFieldOptions =
    (isTypeFn ? maybeOptions : (typeOrOptions as FilterableFieldOptions)) ?? {};

  return (target, propertyKey) => {
    const ctor = target.constructor;
    const list: FilterableFieldMeta[] = Reflect.getMetadata(FILTERABLE_FIELDS, ctor) ?? [];
    list.push({
      propertyKey: propertyKey as string,
      type:
        typeFn ??
        (() => Reflect.getMetadata('design:type', target, propertyKey)),
      allowedComparisons: options.allowedComparisons,
    });
    Reflect.defineMetadata(FILTERABLE_FIELDS, list, ctor);

    // Apply @Field. Strip our extra option before forwarding.
    const { allowedComparisons: _ac, ...fieldOptions } = options;
    void _ac;
    if (typeFn) Field(typeFn as any, fieldOptions)(target, propertyKey);
    else Field(fieldOptions)(target, propertyKey);
  };
}

/**
 * Marks a DTO property as sortable. Adds it to <Entity>SortFields enum.
 */
export function SortableField(
  typeOrOptions?: (() => unknown) | FieldOptions,
  maybeOptions?: FieldOptions,
): PropertyDecorator {
  const isTypeFn = typeof typeOrOptions === 'function';
  const typeFn = isTypeFn ? (typeOrOptions as () => unknown) : undefined;
  const options: FieldOptions = (isTypeFn ? maybeOptions : (typeOrOptions as FieldOptions)) ?? {};

  return (target, propertyKey) => {
    const ctor = target.constructor;
    const list: string[] = Reflect.getMetadata(SORTABLE_FIELDS, ctor) ?? [];
    if (!list.includes(propertyKey as string)) list.push(propertyKey as string);
    Reflect.defineMetadata(SORTABLE_FIELDS, list, ctor);

    if (typeFn) Field(typeFn as any, options)(target, propertyKey);
    else Field(options)(target, propertyKey);
  };
}

/**
 * Marks the DTO's primary key. Filter input uses IDFilterComparison for it.
 * Auto-applies @Field(() => ID).
 */
export function IDField(options: FieldOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    const ctor = target.constructor;
    Reflect.defineMetadata(ID_FIELD, propertyKey, ctor);

    // Also implicitly filterable + sortable.
    const flist: FilterableFieldMeta[] = Reflect.getMetadata(FILTERABLE_FIELDS, ctor) ?? [];
    if (!flist.find((f) => f.propertyKey === propertyKey)) {
      flist.push({ propertyKey: propertyKey as string, type: () => ID });
      Reflect.defineMetadata(FILTERABLE_FIELDS, flist, ctor);
    }
    const slist: string[] = Reflect.getMetadata(SORTABLE_FIELDS, ctor) ?? [];
    if (!slist.includes(propertyKey as string)) slist.push(propertyKey as string);
    Reflect.defineMetadata(SORTABLE_FIELDS, slist, ctor);

    Field(() => ID, options)(target, propertyKey);
  };
}

export function getIdField(target: Function): string {
  return (Reflect.getMetadata(ID_FIELD, target) as string | undefined) ?? 'id';
}

export function getFilterableFields(target: Function): FilterableFieldMeta[] {
  return (Reflect.getMetadata(FILTERABLE_FIELDS, target) as FilterableFieldMeta[] | undefined) ?? [];
}

export function getSortableFields(target: Function): string[] {
  return (Reflect.getMetadata(SORTABLE_FIELDS, target) as string[] | undefined) ?? [];
}
