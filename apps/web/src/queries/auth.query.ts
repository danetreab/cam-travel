import { queryOptions } from "@tanstack/react-query"
import { getUserSession } from "@/api/auth.api"

export const authQueryOptions = () =>
  queryOptions({
    queryKey: ["user"],
    queryFn: ({ signal }) => getUserSession({ signal }),
  })

export type AuthQueryResult = Awaited<ReturnType<typeof getUserSession>>
