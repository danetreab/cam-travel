import {
  Avatar,
  Button,
  Image,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useDelete, useList, useNavigation } from "@refinedev/core";
import gql from "graphql-tag";

type ItemFile = {
  id: string;
  thumbnailUrl?: string | null;
  hasThumbnail: boolean;
  mimetype: string;
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  createdAt: string;
  updatedAt: string;
  files: ItemFile[];
};

const ITEMS_LIST_QUERY = gql`
  query ItemsList(
    $filter: ItemFilter
    $paging: OffsetPaging
    $sorting: [ItemSort!]
  ) {
    items(filter: $filter, paging: $paging, sorting: $sorting) {
      nodes {
        id
        name
        description
        price
        createdAt
        updatedAt
        files {
          id
          thumbnailUrl
          hasThumbnail
          mimetype
        }
      }
      totalCount
    }
  }
`;

export const ItemsList = () => {
  const { create, edit } = useNavigation();
  const { mutate: deleteOne } = useDelete();

  const { result, query } = useList<Item>({
    resource: "items",
    pagination: { pageSize: 20 },
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { gqlQuery: ITEMS_LIST_QUERY },
  });

  return (
    <>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", display: "flex" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Items
        </Typography.Title>
        <Button type="primary" onClick={() => create("items")}>
          Create
        </Button>
      </Space>
      <Table<Item>
        rowKey="id"
        dataSource={(result?.data ?? []) as Item[]}
        loading={query.isLoading}
        pagination={{ pageSize: 20, total: result?.total ?? 0 }}
        columns={[
          {
            title: "Files",
            key: "files",
            width: 140,
            render: (_, record) => {
              const files = record.files ?? [];
              if (files.length === 0) {
                return <Typography.Text type="secondary">—</Typography.Text>;
              }
              const thumbs = files.filter(
                (f) => f.hasThumbnail && f.thumbnailUrl,
              );
              return (
                <Space size={4}>
                  <Avatar.Group max={{ count: 3 }} size="small">
                    {thumbs.map((f) => (
                      <Avatar
                        key={f.id}
                        src={
                          <Image
                            src={f.thumbnailUrl ?? undefined}
                            preview={false}
                          />
                        }
                      />
                    ))}
                  </Avatar.Group>
                  <Tag>{files.length}</Tag>
                </Space>
              );
            },
          },
          { title: "Name", dataIndex: "name" },
          {
            title: "Description",
            dataIndex: "description",
            render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: "Price",
            dataIndex: "price",
            render: (v: number) => `$${v.toFixed(2)}`,
          },
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => edit("items", record.id)}>
                  Edit
                </Button>
                <Popconfirm
                  title="Delete this item?"
                  onConfirm={() => deleteOne({ resource: "items", id: record.id })}
                >
                  <Button size="small" danger>
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
};
