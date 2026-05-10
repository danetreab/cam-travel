# nestjs-query-drizzle

A small adapter that emits the GraphQL schema shape `@refinedev/nestjs-query` consumes, backed by [Drizzle ORM](https://orm.drizzle.team/) instead of TypeORM/Sequelize/Mongoose.

## What's here

| File | Purpose |
| --- | --- |
| `decorators.ts` | `@FilterableField`, `@SortableField`, `@IDField` — record metadata read by the type factories |
| `comparisons.ts` | `*FieldComparison` input types, `OffsetPaging`, `OffsetPageInfo`, `SortDirection`, `SortNulls`, `UpdateManyResponse`, `DeleteManyResponse` |
| `connection-type.factory.ts` | `ConnectionType(DTO)` → `<Entity>Connection` |
| `filter-type.factory.ts` | `FilterType(DTO)` → `<Entity>Filter` (plus `and` / `or`) |
| `sort-type.factory.ts` | `SortType(DTO)` → `<Entity>Sort` + `<Entity>SortFields` enum |
| `input-type.factories.ts` | All `CreateOne…Input`, `UpdateOne…Input`, etc. |
| `drizzle-query.service.ts` | Generic data layer; translates `Filter` / `Sort` / `OffsetPaging` to Drizzle |
| `crud-resolver.factory.ts` | `CrudResolver({ DTOClass, … })` — abstract resolver class with all eight CRUD operations |
| `pubsub.ts` | In-memory `PubSub` instance for subscriptions |

## Wire shape

Operations emitted (per resource, where `<Entity>` is the DTO class name and `<entityPlural>` is its pluralized camelCase form):

```
<entityPlural>(filter, paging, sorting): <Entity>Connection!
<entity>(id: ID!): <Entity>
createOne<Entity>(input: CreateOne<Entity>Input!): <Entity>!
createMany<Entity>(input: CreateMany<Entity>Input!): [<Entity>!]!
updateOne<Entity>(input: UpdateOne<Entity>Input!): <Entity>!
updateMany<Entity>(input: UpdateMany<Entity>Input!): UpdateManyResponse!
deleteOne<Entity>(input: DeleteOne<Entity>Input!): <Entity>DeleteResponse!
deleteMany<Entity>(input: DeleteMany<Entity>Input!): DeleteManyResponse!

# When `enableSubscriptions: true`:
created<Entity>: <Entity>!
updatedOne<Entity>: <Entity>!
deletedOne<Entity>: <Entity>DeleteResponse!
```

Type names match `@refinedev/nestjs-query`'s string templates exactly.

## Usage sketch

```ts
// 1. DTO
@ObjectType('User')
export class UserDto {
  @IDField() id!: string;
  @FilterableField() @SortableField() email!: string;
  @FilterableField() @SortableField() name!: string;
  @FilterableField(() => Date) @SortableField(() => Date) createdAt!: Date;
}

// 2. Inputs
@InputType('CreateUserInput') export class CreateUserInput { /* … */ }
@InputType('UpdateUserInput') export class UpdateUserInput { /* … */ }

// 3. Service
@Injectable()
export class UsersService extends DrizzleQueryService<UserDto> {
  constructor(@InjectDB() db: DrizzleDB) { super(db, users); }
}

// 4. Resolver
@Resolver(() => UserDto)
export class UsersResolver extends CrudResolver({
  DTOClass: UserDto,
  CreateDTOClass: CreateUserInput,
  UpdateDTOClass: UpdateUserInput,
  enableSubscriptions: true,
  guards: { read: [SessionGuard], create: [SessionGuard, PermissionsGuard] },
  permissions: {
    create: [PERMISSIONS.USERS_CREATE],
    update: [PERMISSIONS.USERS_UPDATE],
    delete: [PERMISSIONS.USERS_DELETE],
  },
}) {
  constructor(svc: UsersService) { super(svc); }
}
```

## Supported (v1)

- `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `notLike`, `iLike`, `notILike`, `in`, `notIn`, `is`, `isNot` field comparisons
- Arbitrary `and` / `or` nesting
- `OffsetPaging` (limit/offset)
- Multi-field sort with optional `NULLS_FIRST` / `NULLS_LAST`
- Postgres + SQLite dialects (SQLite uses `LOWER()` fallback for `iLike` and emulates nulls ordering)
- Soft-delete via `opts.softDelete = { column, deletedValue }`
- Subscriptions for `created`, `updatedOne`, `deletedOne`

## Not supported (v1) — intentional gaps

- **Cursor / keyset paging.** `@refinedev/nestjs-query` only uses offset.
- **Relations** (`@FilterableRelation`, `@Relation`, nested filters across joins). Expose related data via custom `@ResolveField` on your DTO for now.
- **Aggregations** (`<entity>Aggregate` queries).
- **Assemblers.** DTO ↔ table column mapping is one-to-one. If you need divergence, wrap or override `DrizzleQueryService` per resource.
- **Subscription filter inputs** (the optional `input: Create<Entity>SubscriptionFilterInput`). Subscriptions emit every event for now; clients filter on the receiving end.
- **Custom scalars / enums in `pickComparisonInput`.** Defaults to `StringFieldComparison` for unknown types — pass an explicit thunk to a comparison class to override, or extend the factory.

## Test plan

Per `SETUP_PROMPT.md` §2.1.4:

1. Unit tests for each `*FieldComparison` → Drizzle predicate
2. `and` / `or` nesting
3. Sorting with `nulls` on Postgres + SQLite
4. Pagination edge cases (offset past end; `limit > totalCount`)
5. Subscriptions firing on each mutation
6. **End-to-end snapshot test:** boot Nest, snapshot the GraphQL operations refine emits in the admin app, fire each, assert each parses cleanly on the refine side. This is the real signal — the wire-shape contract holds or breaks here.

The build order calls for proving this snapshot test against a single throwaway entity (`widgets`) before generalizing.
