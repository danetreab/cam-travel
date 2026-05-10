import { Controller } from "@nestjs/common";
import { GraphQLSchemaHost } from "@nestjs/graphql";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { graphql } from "graphql";

type ExecutePayload = {
  query: string;
  variables?: Record<string, unknown> | null;
  operationName?: string | null;
  // Auth is enforced by the gateway. These fields are forwarded so resolvers
  // can read the caller's identity from contextValue if they need to.
  user?: { id: string; email: string; role: string | null } | null;
  session?: unknown;
};

@Controller()
export class GraphqlMicroserviceController {
  constructor(private readonly schemaHost: GraphQLSchemaHost) {}

  @MessagePattern("graphql.execute")
  async execute(@Payload() data: ExecutePayload) {
    return graphql({
      schema: this.schemaHost.schema,
      source: data.query ?? "",
      variableValues: data.variables ?? undefined,
      operationName: data.operationName ?? undefined,
      contextValue: {
        user: data.user ?? null,
        session: data.session ?? null,
      },
    });
  }
}
