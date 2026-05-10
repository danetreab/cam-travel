import { applyDecorators, UseGuards, type Type } from "@nestjs/common";
import {
  Args,
  ID,
  Mutation,
  Query,
  Resolver,
  Subscription,
} from "@nestjs/graphql";
import {
  AllowAnonymous,
  UserHasPermission,
} from "@thallesp/nestjs-better-auth";
import { camelCase } from "lodash";
import pluralize from "pluralize";
import {
  DeleteManyResponse,
  OffsetPaging,
  UpdateManyResponse,
} from "./comparisons";
import { ConnectionType } from "./connection-type.factory";
import { FilterType } from "./filter-type.factory";
import {
  CreateManyInputType,
  CreateOneInputType,
  CreateSubscriptionFilterInputType,
  DeleteManyInputType,
  DeleteOneInputType,
  DeleteOneSubscriptionFilterInputType,
  DeleteResponseType,
  UpdateManyInputType,
  UpdateOneInputType,
  UpdateOneSubscriptionFilterInputType,
} from "./input-type.factories";
import { pubSub } from "./pubsub";
import { SortType } from "./sort-type.factory";
import type { DrizzleQueryService } from "./drizzle-query.service";
import { deriveEntityName } from "./util";

export interface CrudResolverOpts<TDto, TCreate, TUpdate> {
  DTOClass: Type<TDto>;
  /** Omit to disable createOne/createMany — those mutations won't be in the schema. */
  CreateDTOClass?: Type<TCreate>;
  /** Omit to disable updateOne/updateMany — those mutations won't be in the schema. */
  UpdateDTOClass?: Type<TUpdate>;
  /** Override the singular entity name. Defaults to DTOClass.name with any
   *  trailing "Dto" / "DTO" stripped — so `class UserDto` → "User". */
  entityName?: string;
  /** Override pluralized name (defaults to pluralize(camelCase(entityName))). */
  pluralName?: string;
  enableSubscriptions?: boolean;
  guards?: { read?: Type[]; create?: Type[]; update?: Type[]; delete?: Type[] };
  /**
   * Resource → actions map per CRUD verb, e.g.
   * `{ create: { user: ['create'] }, read: { user: ['list'] } }`.
   * Forwarded to the `@UserHasPermission` decorator from
   * `@thallesp/nestjs-better-auth`, which calls Better-Auth's
   * `auth.api.userHasPermission` against the admin-plugin AC.
   *
   * The whole object — and every per-verb key — is optional. Verbs without an
   * entry simply don't get the permission check. Entries for create/update are
   * ignored when the matching DTO class is omitted.
   */
  permissions?: {
    read?: Record<string, string[]>;
    create?: Record<string, string[]>;
    update?: Record<string, string[]>;
    delete?: Record<string, string[]>;
  };
}

const decorate = (
  guards?: Type[],
  perms?: Record<string, string[]>,
): MethodDecorator =>
  applyDecorators(
    ...(guards?.length ? [UseGuards(...guards)] : []),
    ...(perms ? [UserHasPermission({ permission: perms })] : []),
  );

// Apply @Mutation + @Args('input') + guards/permissions to a prototype method
// at runtime, so the create/update mutations only land in the schema when their
// DTO class was supplied. Decorator order mirrors source-level evaluation:
// parameter decorators first, then the inner method decorator, then @Mutation.
function applyMutation(
  cls: abstract new (...args: any[]) => any,
  methodName: string,
  returnType: () => any,
  schemaName: string,
  inputType: () => any,
  extra: MethodDecorator,
) {
  const proto = cls.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, methodName);
  if (!desc) {
    throw new Error(`CrudResolver: missing prototype method "${methodName}"`);
  }
  // tsc only emits design:paramtypes when a method already has a decorator in
  // source. createOne/createMany/updateOne/updateMany are decorator-less in
  // BaseCrudResolver — @Args still reads design:paramtypes even with an
  // explicit type fn, so seed a placeholder before applying the decorator.
  if (!Reflect.getMetadata("design:paramtypes", proto, methodName)) {
    Reflect.defineMetadata("design:paramtypes", [Object], proto, methodName);
  }
  Args("input", { type: inputType })(proto, methodName, 0);
  extra(proto, methodName, desc);
  Mutation(returnType, { name: schemaName })(proto, methodName, desc);
}

/**
 * Builds an abstract resolver class with the eight nestjs-query-shaped operations
 * (list, findOne, createOne, createMany, updateOne, updateMany, deleteOne, deleteMany)
 * plus optional subscriptions. Each operation routes to the injected DrizzleQueryService.
 *
 * `CreateDTOClass`, `UpdateDTOClass`, and `permissions` are all optional — omitting a
 * DTO class drops its mutations from the schema entirely; omitting permissions just
 * skips the `@UserHasPermission` check on those operations.
 *
 * Concrete resolvers extend the returned class and pass the service via super().
 */
export function CrudResolver<
  TDto,
  TCreate = Partial<TDto>,
  TUpdate = Partial<TDto>,
>(opts: CrudResolverOpts<TDto, TCreate, TUpdate>): Type<any> {
  const { DTOClass, CreateDTOClass, UpdateDTOClass, enableSubscriptions } =
    opts;

  const Entity = opts.entityName ?? deriveEntityName(DTOClass); // "User"
  const entity = camelCase(Entity); // "user"
  const plural = opts.pluralName ?? pluralize(entity); // "users"

  const Connection = ConnectionType(DTOClass);
  const Filter = FilterType(DTOClass);
  const Sort = SortType(DTOClass);

  const DeleteOneInput = DeleteOneInputType(Entity);
  const DeleteManyInput = DeleteManyInputType(Entity, Filter);
  const DeleteResponse = DeleteResponseType(DTOClass);

  const CreatedSubFilter = CreateSubscriptionFilterInputType(Entity, Filter);
  const UpdatedSubFilter = UpdateOneSubscriptionFilterInputType(Entity, Filter);
  const DeletedSubFilter = DeleteOneSubscriptionFilterInputType(Entity, Filter);

  // Subscription topic names — captured by closure for the prototype methods below.
  const TOPIC_CREATED = `created${Entity}`;
  const TOPIC_UPDATED = `updatedOne${Entity}`;
  const TOPIC_DELETED = `deletedOne${Entity}`;

  @Resolver({ isAbstract: true })
  abstract class BaseCrudResolver {
    constructor(protected readonly service: DrizzleQueryService<any>) {}

    // --- Read --------------------------------------------------------------

    @Query(() => Connection, { name: plural })
    @decorate(opts.guards?.read, opts.permissions?.read)
    async list(
      @Args("filter", { type: () => Filter, defaultValue: {} }) filter: any,
      @Args("paging", {
        type: () => OffsetPaging,
        defaultValue: { limit: 10, offset: 0 },
      })
      paging: any,
      @Args("sorting", { type: () => [Sort], defaultValue: [] }) sorting: any[],
    ) {
      const { nodes, totalCount } = await this.service.query({
        filter,
        paging,
        sorting,
      });
      const offset = paging?.offset ?? 0;
      return {
        nodes,
        totalCount,
        pageInfo: {
          hasNextPage: offset + nodes.length < totalCount,
          hasPreviousPage: offset > 0,
        },
      };
    }

    @Query(() => DTOClass, { name: entity, nullable: true })
    @decorate(opts.guards?.read, opts.permissions?.read)
    findOne(@Args("id", { type: () => ID }) id: string) {
      return this.service.findById(id);
    }

    // --- Create ------------------------------------------------------------
    // Decorators applied at runtime below — only when CreateDTOClass is provided.

    async createOne(input: any) {
      const data = (input?.[entity] ?? input) as Partial<TDto>;
      const row = await this.service.createOne(data);
      if (enableSubscriptions)
        await pubSub.publish(TOPIC_CREATED, { [TOPIC_CREATED]: row });
      return row;
    }

    async createMany(input: any) {
      const list = (input?.[plural] ?? []) as Partial<TDto>[];
      const rows = await this.service.createMany(list);
      if (enableSubscriptions) {
        for (const row of rows) {
          await pubSub.publish(TOPIC_CREATED, { [TOPIC_CREATED]: row });
        }
      }
      return rows;
    }

    // --- Update ------------------------------------------------------------
    // Decorators applied at runtime below — only when UpdateDTOClass is provided.

    async updateOne(input: any) {
      const row = await this.service.updateOne(input.id, input.update);
      if (enableSubscriptions)
        await pubSub.publish(TOPIC_UPDATED, { [TOPIC_UPDATED]: row });
      return row;
    }

    updateMany(input: any) {
      return this.service.updateMany(input.filter, input.update);
    }

    // --- Delete ------------------------------------------------------------

    @Mutation(() => DeleteResponse, { name: `deleteOne${Entity}` })
    @decorate(opts.guards?.delete, opts.permissions?.delete)
    async deleteOne(@Args("input", { type: () => DeleteOneInput }) input: any) {
      const row = await this.service.deleteOne(input.id);
      // Publish the full row so the deletedOne subscription (typed as DTO)
      // can satisfy whatever selection set refine's liveProvider sends —
      // it reuses meta.fields across created/updated/deleted, so partial
      // payloads here fail with "Cannot query field X on type Response".
      if (enableSubscriptions) {
        await pubSub.publish(TOPIC_DELETED, { [TOPIC_DELETED]: row });
      }
      return { id: (row as any)?.id ?? input.id };
    }

    @Mutation(() => DeleteManyResponse, { name: `deleteMany${Entity}` })
    @decorate(opts.guards?.delete, opts.permissions?.delete)
    deleteMany(@Args("input", { type: () => DeleteManyInput }) input: any) {
      return this.service.deleteMany(input.filter);
    }

    // --- Subscriptions -----------------------------------------------------
    // Always present in the schema. Refine's nestjs-query liveProvider sends
    // `input: $input` with the matching <Op><Entity>SubscriptionFilterInput
    // type — we accept it to satisfy the schema but ignore the filter for v1.
    //
    // If you set `enableSubscriptions: false` the operations stay in the
    // schema but no events are ever published, so subscribers will hang.
    // Don't combine `enableSubscriptions: false` with `liveMode: 'auto'`.
    //
    // @AllowAnonymous: graphql-ws subscriptions don't expose the WS upgrade
    // headers in the per-message GraphQL context, so the library's global
    // AuthGuard can't read the session cookie and rejects all subscribers
    // — which silently breaks live updates. Subscriptions emit the same
    // rows the authed list query already returns; for stricter isolation,
    // wire WS auth via `subscriptions.graphql-ws.onConnect` later.

    @AllowAnonymous()
    @Subscription(() => DTOClass, {
      name: TOPIC_CREATED,
      resolve: (payload: any) => payload[TOPIC_CREATED],
    })
    created(
      @Args("input", { type: () => CreatedSubFilter, nullable: true })
      _input?: any,
    ) {
      void _input;
      return pubSub.asyncIterableIterator(TOPIC_CREATED);
    }

    @AllowAnonymous()
    @Subscription(() => DTOClass, {
      name: TOPIC_UPDATED,
      resolve: (payload: any) => payload[TOPIC_UPDATED],
    })
    updatedOne(
      @Args("input", { type: () => UpdatedSubFilter, nullable: true })
      _input?: any,
    ) {
      void _input;
      return pubSub.asyncIterableIterator(TOPIC_UPDATED);
    }

    // Return the DTO (not DeleteResponse) so refine's liveProvider can pick
    // any field from meta.fields — it shares the same selection across all
    // three subscription operations.
    @AllowAnonymous()
    @Subscription(() => DTOClass, {
      name: TOPIC_DELETED,
      resolve: (payload: any) => payload[TOPIC_DELETED],
    })
    deletedOne(
      @Args("input", { type: () => DeletedSubFilter, nullable: true })
      _input?: any,
    ) {
      void _input;
      return pubSub.asyncIterableIterator(TOPIC_DELETED);
    }
  }

  if (CreateDTOClass) {
    const CreateOneInput = CreateOneInputType(CreateDTOClass, Entity);
    const CreateManyInput = CreateManyInputType(CreateDTOClass, Entity, plural);
    const createDecorate = decorate(
      opts.guards?.create,
      opts.permissions?.create,
    );

    applyMutation(
      BaseCrudResolver,
      "createOne",
      () => DTOClass,
      `createOne${Entity}`,
      () => CreateOneInput,
      createDecorate,
    );
    applyMutation(
      BaseCrudResolver,
      "createMany",
      () => [DTOClass],
      `createMany${Entity}`,
      () => CreateManyInput,
      createDecorate,
    );
  }

  if (UpdateDTOClass) {
    const UpdateOneInput = UpdateOneInputType(UpdateDTOClass, Entity);
    const UpdateManyInput = UpdateManyInputType(UpdateDTOClass, Entity, Filter);
    const updateDecorate = decorate(
      opts.guards?.update,
      opts.permissions?.update,
    );

    applyMutation(
      BaseCrudResolver,
      "updateOne",
      () => DTOClass,
      `updateOne${Entity}`,
      () => UpdateOneInput,
      updateDecorate,
    );
    applyMutation(
      BaseCrudResolver,
      "updateMany",
      () => UpdateManyResponse,
      `updateMany${Entity}`,
      () => UpdateManyInput,
      updateDecorate,
    );
  }

  return BaseCrudResolver as Type<any>;
}
