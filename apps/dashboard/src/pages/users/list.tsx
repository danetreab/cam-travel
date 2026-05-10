import { Button, Popconfirm, Space, Table, Tag, message } from "antd";
import { useList } from "@refinedev/core";
import gql from "graphql-tag";
import { authClient } from "../../auth-client";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  createdAt: string;
};

const USERS_LIST_QUERY = gql`
  query UsersList(
    $filter: UserFilter
    $paging: OffsetPaging
    $sorting: [UserSort!]
  ) {
    users(filter: $filter, paging: $paging, sorting: $sorting) {
      nodes {
        id
        name
        email
        role
        banned
        createdAt
      }
      totalCount
    }
  }
`;

export const UsersList = () => {
  const [messageApi, contextHolder] = message.useMessage();

  const { result, query } = useList<AdminUser>({
    resource: "users",
    pagination: { pageSize: 20 },
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { gqlQuery: USERS_LIST_QUERY },
  });

  // Admin mutations (role/ban) stay on authClient: better-auth's admin plugin
  // takes care of session invalidation on ban, which a raw GraphQL update
  // wouldn't trigger.
  const handleSetRole = async (userId: string, role: "admin" | "user") => {
    const { error } = await authClient.admin.setRole({ userId, role });
    if (error) {
      messageApi.error(error.message ?? "Failed to set role");
      return;
    }
    messageApi.success(`Role set to ${role}`);
    void query.refetch();
  };

  const handleBan = async (userId: string) => {
    const { error } = await authClient.admin.banUser({ userId });
    if (error) {
      messageApi.error(error.message ?? "Failed to ban user");
      return;
    }
    messageApi.success("User banned");
    void query.refetch();
  };

  const handleUnban = async (userId: string) => {
    const { error } = await authClient.admin.unbanUser({ userId });
    if (error) {
      messageApi.error(error.message ?? "Failed to unban user");
      return;
    }
    messageApi.success("User unbanned");
    void query.refetch();
  };

  return (
    <>
      {contextHolder}
      <Table<AdminUser>
        rowKey="id"
        dataSource={(result?.data ?? []) as AdminUser[]}
        loading={query.isLoading}
        pagination={{ pageSize: 20, total: result?.total ?? 0 }}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Email", dataIndex: "email" },
          {
            title: "Role",
            dataIndex: "role",
            render: (role: string | null) =>
              role === "admin" ? <Tag color="gold">admin</Tag> : <Tag>user</Tag>,
          },
          {
            title: "Status",
            dataIndex: "banned",
            render: (banned: boolean | null) =>
              banned ? <Tag color="red">banned</Tag> : <Tag color="green">active</Tag>,
          },
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space>
                {record.role === "admin" ? (
                  <Button size="small" onClick={() => handleSetRole(record.id, "user")}>
                    Demote
                  </Button>
                ) : (
                  <Button size="small" onClick={() => handleSetRole(record.id, "admin")}>
                    Promote
                  </Button>
                )}
                {record.banned ? (
                  <Button size="small" onClick={() => handleUnban(record.id)}>
                    Unban
                  </Button>
                ) : (
                  <Popconfirm title="Ban this user?" onConfirm={() => handleBan(record.id)}>
                    <Button size="small" danger>
                      Ban
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
    </>
  );
};
