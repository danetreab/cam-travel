import dataProviderNestjsQuery, {
  GraphQLClient,
  liveProvider as liveProviderNestjsQuery,
} from "@refinedev/nestjs-query";
import dataProviderSimpleRest from "@refinedev/simple-rest";
import axios from "axios";
import { createClient as createWSClient } from "graphql-ws";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Subscriptions speak graphql-ws over WebSocket and the gateway's TCP
// microservice transport doesn't carry WS upgrades — point straight at the
// graphql service for live updates. HTTP queries/mutations still go through
// the gateway so the better-auth cookie / AuthGuard chain stays intact.
const wsUrl = import.meta.env.VITE_GRAPHQL_WS_URL ?? "ws://localhost:3002/graphql/v1";

// `credentials: "include"` lets the better-auth session cookie ride along on
// every GraphQL request — without it the gateway's AuthGuard rejects.
const graphqlClient = new GraphQLClient(`${baseUrl}/graphql/v1`, {
  credentials: "include",
});

const wsClient = createWSClient({ url: wsUrl });

export const dataProvider = dataProviderNestjsQuery(graphqlClient);
export const liveProvider = liveProviderNestjsQuery(wsClient);

// Kept for resources without a GraphQL backing. Resources opt in via
// `meta.dataProviderName: "rest"`.
const axiosInstance = axios.create({ withCredentials: true });
export const restDataProvider = dataProviderSimpleRest(`${baseUrl}/api/v1`, axiosInstance);
