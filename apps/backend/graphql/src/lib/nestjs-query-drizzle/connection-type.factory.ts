import type { Type } from '@nestjs/common';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { OffsetPageInfo } from './comparisons';
import { deriveEntityName } from './util';

const cache = new WeakMap<Function, Type<any>>();

/**
 * Builds <Entity>Connection { nodes, totalCount, pageInfo } as a code-first
 * @ObjectType. Cached per DTO class so repeat calls return the same class.
 */
export function ConnectionType<T>(DTOClass: Type<T>): Type<{
  nodes: T[];
  totalCount: number;
  pageInfo: OffsetPageInfo;
}> {
  const cached = cache.get(DTOClass);
  if (cached) return cached as Type<any>;

  @ObjectType(`${deriveEntityName(DTOClass)}Connection`)
  class GeneratedConnection {
    @Field(() => [DTOClass])
    nodes!: T[];

    @Field(() => Int)
    totalCount!: number;

    @Field(() => OffsetPageInfo)
    pageInfo!: OffsetPageInfo;
  }

  cache.set(DTOClass, GeneratedConnection as Type<any>);
  return GeneratedConnection as Type<any>;
}
