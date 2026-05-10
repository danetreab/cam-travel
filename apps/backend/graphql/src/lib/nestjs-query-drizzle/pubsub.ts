import { PubSub } from 'graphql-subscriptions';

/**
 * Single in-memory PubSub instance used by the CrudResolver factory.
 *
 * Production note: in-memory PubSub does not work across multiple API
 * instances. Swap for graphql-redis-subscriptions or similar when scaling out.
 */
export const pubSub = new PubSub<Record<string, unknown>>();
