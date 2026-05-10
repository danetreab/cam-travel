import type { Type } from '@nestjs/common';
import { Field, ID, InputType, ObjectType } from '@nestjs/graphql';
import { camelCase } from 'lodash';
import { deriveEntityName } from './util';

const cache = new Map<string, Type<any>>();

function getOrBuild(key: string, build: () => Type<any>): Type<any> {
  const existing = cache.get(key);
  if (existing) return existing;
  const cls = build();
  cache.set(key, cls);
  return cls;
}

export function CreateOneInputType<T>(CreateDTOClass: Type<T>, entityName: string): Type<any> {
  return getOrBuild(`CreateOne${entityName}Input`, () => {
    const entityCamel = camelCase(entityName);
    @InputType(`CreateOne${entityName}Input`)
    class CreateOneInput {}
    Field(() => CreateDTOClass)(CreateOneInput.prototype, entityCamel);
    return CreateOneInput as Type<any>;
  });
}

export function CreateManyInputType<T>(
  CreateDTOClass: Type<T>,
  entityName: string,
  pluralName: string,
): Type<any> {
  return getOrBuild(`CreateMany${entityName}Input`, () => {
    @InputType(`CreateMany${entityName}Input`)
    class CreateManyInput {}
    Field(() => [CreateDTOClass])(CreateManyInput.prototype, pluralName);
    return CreateManyInput as Type<any>;
  });
}

export function UpdateOneInputType<T>(UpdateDTOClass: Type<T>, entityName: string): Type<any> {
  return getOrBuild(`UpdateOne${entityName}Input`, () => {
    @InputType(`UpdateOne${entityName}Input`)
    class UpdateOneInput {}
    Field(() => ID)(UpdateOneInput.prototype, 'id');
    Field(() => UpdateDTOClass)(UpdateOneInput.prototype, 'update');
    return UpdateOneInput as Type<any>;
  });
}

export function UpdateManyInputType<T>(
  UpdateDTOClass: Type<T>,
  entityName: string,
  FilterClass: Type<any>,
): Type<any> {
  return getOrBuild(`UpdateMany${entityName}Input`, () => {
    @InputType(`UpdateMany${entityName}Input`)
    class UpdateManyInput {}
    Field(() => FilterClass)(UpdateManyInput.prototype, 'filter');
    Field(() => UpdateDTOClass)(UpdateManyInput.prototype, 'update');
    return UpdateManyInput as Type<any>;
  });
}

export function DeleteOneInputType(entityName: string): Type<any> {
  return getOrBuild(`DeleteOne${entityName}Input`, () => {
    @InputType(`DeleteOne${entityName}Input`)
    class DeleteOneInput {}
    Field(() => ID)(DeleteOneInput.prototype, 'id');
    return DeleteOneInput as Type<any>;
  });
}

export function DeleteManyInputType(entityName: string, FilterClass: Type<any>): Type<any> {
  return getOrBuild(`DeleteMany${entityName}Input`, () => {
    @InputType(`DeleteMany${entityName}Input`)
    class DeleteManyInput {}
    Field(() => FilterClass)(DeleteManyInput.prototype, 'filter');
    return DeleteManyInput as Type<any>;
  });
}

/**
 * Subscription filter inputs. @refinedev/nestjs-query's liveProvider sends:
 *   subscription CreatedUser($input: CreateUserSubscriptionFilterInput) { … }
 *   subscription UpdatedUser($input: UpdateOneUserSubscriptionFilterInput!) { … }
 *   subscription DeletedUser($input: DeleteOneUserSubscriptionFilterInput!) { … }
 * Shape: `{ filter: <Entity>Filter }`. We accept it so the schema matches
 * what refine emits; v1 ignores the filter and emits every event.
 */
function buildSubFilterInput(typeName: string, FilterClass: Type<any>): Type<any> {
  return getOrBuild(typeName, () => {
    @InputType(typeName)
    class SubFilterInput {}
    Field(() => FilterClass, { nullable: true })(SubFilterInput.prototype, 'filter');
    return SubFilterInput as Type<any>;
  });
}

export const CreateSubscriptionFilterInputType = (entityName: string, FilterClass: Type<any>) =>
  buildSubFilterInput(`Create${entityName}SubscriptionFilterInput`, FilterClass);

export const UpdateOneSubscriptionFilterInputType = (entityName: string, FilterClass: Type<any>) =>
  buildSubFilterInput(`UpdateOne${entityName}SubscriptionFilterInput`, FilterClass);

export const DeleteOneSubscriptionFilterInputType = (entityName: string, FilterClass: Type<any>) =>
  buildSubFilterInput(`DeleteOne${entityName}SubscriptionFilterInput`, FilterClass);

/**
 * <Entity>DeleteResponse. v1 simplification: returns just the deleted id.
 * Refine's nestjs-query data provider lets the caller pick the selection set,
 * so id-only is sufficient for cache invalidation; richer payloads can come
 * from subscriptions or refetch.
 */
export function DeleteResponseType<T>(DTOClass: Type<T>): Type<any> {
  const entityName = deriveEntityName(DTOClass);
  return getOrBuild(`${entityName}DeleteResponse`, () => {
    @ObjectType(`${entityName}DeleteResponse`)
    class DeleteResponse {
      @Field(() => ID, { nullable: true })
      id?: string | number;
    }
    return DeleteResponse as Type<any>;
  });
}
