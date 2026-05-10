# Adding a new CRUD feature

End-to-end recipe for adding a new resource (table → GraphQL CRUD → dashboard page with realtime). Worked example: `product`. The previous walkthrough that produced the `item` resource follows the exact same pattern — you can grep the codebase for any of the following filenames as a working reference.

## Prerequisites

- `bun run dev` works locally and `packages/db` has been built at least once (its `dev` task does `tsc --watch`).
- `apps/backend/auth/.env` has a real `DATABASE_URL` you can run migrations against.
- `apps/backend/graphql` is reachable on `:3002` and the gateway on `:3000`.

## 1. Add the table

Custom application tables live in their **own file** under `packages/db/src/`. `packages/db/src/schema.ts` is overwritten by `bun run auth:generate` — anything you put there gets wiped.

Create `packages/db/src/products.ts`:

```ts
import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

export const product = pgTable("product", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
```

Wire it into the package's three integration points:

- `packages/db/src/index.ts` — re-export so consumers can `import { product } from "@repo/db"`:
  ```ts
  export { product } from "./products";
  ```
- `packages/db/src/client.ts` — merge into the drizzle schema map (already does this for `items`; just import and spread):
  ```ts
  import * as productsSchema from "./products";
  const schema = { ...authSchema, ...itemsSchema, ...productsSchema };
  ```
- `packages/db/drizzle.config.ts` — add the file to the schema array:
  ```ts
  schema: ["./src/schema.ts", "./src/items.ts", "./src/products.ts"],
  ```

## 2. Generate and apply the migration

```bash
bun run db:generate    # writes packages/db/drizzle/<n>_<name>.sql
bun run db:migrate     # applies pending SQL to DATABASE_URL
```

If `db:generate` complains about `DATABASE_URL undefined`, drizzle-kit reads `.env` from cwd. Either add `packages/db/.env` or run inline:

```bash
DATABASE_URL="$(grep ^DATABASE_URL apps/backend/auth/.env | cut -d= -f2-)" bun run db:generate
```

Inspect the generated SQL before running `db:migrate` — that's your last chance to adjust the diff (column types, defaults, FKs) before it hits the DB.

## 3. Add the GraphQL CRUD resource

Mirror `apps/backend/graphql/src/admin/items/`. Six files:

**`apps/backend/graphql/src/admin/products/dto/product.dto.ts`** — the read/output type. `@FilterableField` makes a column filterable, `@SortableField` makes it sortable, `@IDField` marks the primary key.

```ts
import { Field, Float, ObjectType } from "@nestjs/graphql";
import { FilterableField, IDField, SortableField } from "../../../lib/nestjs-query-drizzle";

@ObjectType("Product")
export class ProductDto {
  @IDField()
  id!: string;

  @FilterableField()
  @SortableField()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @FilterableField(() => Float)
  @SortableField(() => Float)
  price!: number;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  createdAt!: Date;

  @FilterableField(() => Date)
  @SortableField(() => Date)
  updatedAt!: Date;
}
```

> **Numbers need an explicit type.** `@Field()` / `@FilterableField()` cannot infer `Float` vs `Int` from a TypeScript `number`. Always pass `() => Float` (or `Int`) for numeric fields, otherwise schema generation falls back to `String` filter and you lose `gt`/`gte`/`lt`/`lte`.

**`dto/create-product.input.ts`**:

```ts
import { Field, Float, InputType } from "@nestjs/graphql";

@InputType()
export class CreateProductInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float)
  price!: number;
}
```

**`dto/update-product.input.ts`** — every field nullable:

```ts
import { Field, Float, InputType } from "@nestjs/graphql";

@InputType()
export class UpdateProductInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float, { nullable: true })
  price?: number;
}
```

**`products.service.ts`** — extends the lib's `DrizzleQueryService` and binds it to the drizzle table:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { DRIZZLE_DB, type Db, product } from "@repo/db";
import { DrizzleQueryService } from "../../lib/nestjs-query-drizzle";
import type { ProductDto } from "./dto/product.dto";

@Injectable()
export class ProductsService extends DrizzleQueryService<ProductDto> {
  constructor(@Inject(DRIZZLE_DB) db: Db) {
    super(db, product, { idColumn: "id", dialect: "pg" });
  }
}
```

**`products.resolver.ts`** — the `CrudResolver` factory generates the eight nestjs-query operations + three subscription topics for you:

```ts
import { Resolver } from "@nestjs/graphql";
import { CrudResolver } from "../../lib/nestjs-query-drizzle";
import { CreateProductInput } from "./dto/create-product.input";
import { UpdateProductInput } from "./dto/update-product.input";
import { ProductDto } from "./dto/product.dto";
import { ProductsService } from "./products.service";

@Resolver(() => ProductDto)
export class ProductsResolver extends CrudResolver({
  DTOClass: ProductDto,
  CreateDTOClass: CreateProductInput,
  UpdateDTOClass: UpdateProductInput,
  enableSubscriptions: true,
}) {
  constructor(private readonly products: ProductsService) {
    super(products);
  }
}
```

**`products.module.ts`**:

```ts
import { Module } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { ProductsResolver } from "./products.resolver";

@Module({
  providers: [ProductsResolver, ProductsService],
})
export class ProductsModule {}
```

Register the module in `apps/backend/graphql/src/app.module.ts`:

```ts
import { ProductsModule } from "./admin/products/products.module";

@Module({
  imports: [
    // …
    ProductsModule,
  ],
})
```

The graphql service running under `bun run dev` will restart, regenerate `apps/backend/graphql/schema.gql`, and the new `Product`, `ProductFilter`, `ProductSort`, `ProductConnection`, every `*OneProduct`/`*ManyProduct` mutation, and `createdProduct`/`updatedOneProduct`/`deletedOneProduct` subscriptions will be live.

## 4. Add dashboard pages

Three pages under `apps/dashboard/src/pages/products/`. Use `items` as the working template — same structure, identical wiring.

**`list.tsx`** — `useList` against the `products` query with `gqlQuery` in meta. Action column wires create/edit/delete via `useNavigation` + `useDelete`. The connection query shape is fixed by nestjs-query: `{ nodes, totalCount }`.

**`create.tsx`** — antd `Form` + refine `useForm({ action: "create" })` with `gqlMutation: gql\`mutation { createOneProduct(input: $input) { id … } }\``. Set `redirect: "list"` so save returns to the table.

**`edit.tsx`** — same as create but `action: "edit"`, plus `gqlQuery` for the load and `gqlMutation` for `updateOneProduct`. The `:id` URL param is automatic.

> Forms must use `gql` from `graphql-tag` (returns a `DocumentNode`), **not** the `gql` re-exported from `@refinedev/nestjs-query` (which is `graphql-request`'s tagged-string flavor — refine's meta wants a `DocumentNode`).

Wire routes and the resource in `apps/dashboard/src/App.tsx`:

```tsx
import { ProductsCreate } from "./pages/products/create";
import { ProductsEdit } from "./pages/products/edit";
import { ProductsList } from "./pages/products/list";

// inside <Refine resources={[…]}>:
{
  name: "products",
  list: "/products",
  create: "/products/create",
  edit: "/products/edit/:id",
  meta: { label: "Products" },
}

// inside <Routes>:
<Route path="/products" element={<ProductsList />} />
<Route path="/products/create" element={<ProductsCreate />} />
<Route path="/products/edit/:id" element={<ProductsEdit />} />
```

Realtime is automatic — `<Refine>` already has `liveProvider` and `options.liveMode: "auto"`, so every list/one query subscribes to its resource's three subscription topics. Mutations from any client trigger refetches in every other client.

## 5. Verify

```bash
bun run check-types        # all three services + dashboard
```

Smoke test in two browser tabs at `/products`:

1. Tab A: click **Create**, save a row.
2. Tab B: the table updates without a refresh (subscription fired `createdProduct`).
3. Tab A: edit it; Tab B picks up the change.
4. Tab A: delete it; Tab B's row disappears.

If realtime isn't firing, the usual culprits are:

- The graphql service didn't restart after `app.module.ts` changed (kill the watcher and re-run).
- `VITE_GRAPHQL_WS_URL` in `apps/dashboard/.env` doesn't match the graphql HTTP port (`3002`).
- Browser blocked the WS handshake — graphql's `enableCors` allow-list in `main.ts` needs the dashboard origin (default `http://localhost:5173`).

## Naming cheatsheet

For an entity named `Foo` (singular `PascalCase`):

| Layer            | Identifier                                |
| ---------------- | ----------------------------------------- |
| Drizzle table    | `foo` (singular, snake_case if needed)    |
| GraphQL type     | `Foo`                                     |
| List query       | `foos` (auto-pluralized via `pluralize`)  |
| One query        | `foo(id: ID!)`                            |
| Create mutations | `createOneFoo`, `createManyFoo`           |
| Update mutations | `updateOneFoo`, `updateManyFoo`           |
| Delete mutations | `deleteOneFoo`, `deleteManyFoo`           |
| Subscriptions    | `createdFoo`, `updatedOneFoo`, `deletedOneFoo` |

The pluralizer used by `CrudResolver` is `pluralize(camelCase(entityName))` — irregular plurals (`person → people`, `category → categories`) are handled correctly. Override via `entityName` / `pluralName` in the factory options if you need something custom.

## When the table needs auth-related fields

If your new table references `user.id` (e.g. `ownerId`), keep the FK in your custom file but reference `user` from the auth-managed schema:

```ts
import { user } from "./schema";

export const product = pgTable("product", {
  // …
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
```

This is safe — your file imports from `schema.ts`, not the other way around, so `auth:generate` never touches it.
