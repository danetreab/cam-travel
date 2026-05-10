import { Image, Rate, Space, Table, Tag, Typography } from "antd";
import { StarFilled } from "@ant-design/icons";
import { useList } from "@refinedev/core";
import { CreateButton, List, EditButton, DeleteButton } from "@refinedev/antd";
import type { ListProps } from "@refinedev/antd";
import gql from "graphql-tag";
import type { Attraction } from "../../types";

const ATTRACTIONS_LIST_QUERY = gql`
  query AttractionsList(
    $filter: AttractionFilter
    $paging: OffsetPaging
    $sorting: [AttractionSort!]
  ) {
    attractions(filter: $filter, paging: $paging, sorting: $sorting) {
      nodes {
        id
        name
        description
        latitude
        longitude
        activityType
        durationMinutes
        difficulty
        cachedRating
        cachedUserRatingsTotal
        createdAt
        updatedAt
        files {
          id
          thumbnailUrl
          hasThumbnail
          mimetype
        }
        photos {
          url
        }
      }
      totalCount
    }
  }
`;

const ACTIVITY_COLORS: Record<string, string> = {
  temple: "gold",
  beach: "cyan",
  hiking: "green",
  diving: "blue",
  food: "magenta",
  other: "default",
};

export const AttractionsList = (props: Partial<ListProps> = {}) => {
  const { result, query } = useList<Attraction>({
    resource: "attractions",
    pagination: { pageSize: 20 },
    sorters: [{ field: "createdAt", order: "desc" }],
    meta: { gqlQuery: ATTRACTIONS_LIST_QUERY },
  });

  return (
    <List {...props}>
      <Table<Attraction>
        rowKey="id"
        dataSource={(result?.data ?? []) as Attraction[]}
        loading={query.isLoading}
        pagination={{ pageSize: 20, total: result?.total ?? 0 }}
        columns={[
          {
            title: "Photo",
            key: "photo",
            width: 100,
            render: (_, record) => {
              const fileImages = record.files
                .filter((f) => f.hasThumbnail && f.thumbnailUrl)
                .map((f) => f.thumbnailUrl as string);
              const photoUrls = record.photos.map((p) => p.url);
              const all = [...fileImages, ...photoUrls];
              if (all.length === 0)
                return <Typography.Text type="secondary">—</Typography.Text>;
              const [first, ...rest] = all;
              return (
                <Image.PreviewGroup items={rest}>
                  <Image
                    src={first}
                    width={48}
                    height={48}
                    style={{ objectFit: "cover", borderRadius: 4 }}
                  />
                </Image.PreviewGroup>
              );
            },
          },
          { title: "Name", dataIndex: "name" },
          {
            title: "Type",
            dataIndex: "activityType",
            render: (v: string | null) =>
              v ? <Tag color={ACTIVITY_COLORS[v] ?? "default"}>{v}</Tag> : "—",
          },
          {
            title: "Difficulty",
            dataIndex: "difficulty",
            render: (v: number | null) =>
              v ? (
                <Rate disabled value={v} count={5} style={{ fontSize: 14 }} />
              ) : (
                "—"
              ),
          },
          {
            title: "Duration",
            dataIndex: "durationMinutes",
            render: (v: number | null) => (v ? `${v} min` : "—"),
          },
          {
            title: "Rating",
            dataIndex: "cachedRating",
            render: (v: number | null, record) =>
              v ? (
                <Space size={4}>
                  <StarFilled style={{ color: "#faad14" }} />
                  <span>{v.toFixed(1)}</span>
                  {record.cachedUserRatingsTotal && (
                    <Typography.Text type="secondary">
                      ({record.cachedUserRatingsTotal})
                    </Typography.Text>
                  )}
                </Space>
              ) : (
                "—"
              ),
          },
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space>
                <EditButton hideText recordItemId={record.id} />
                <DeleteButton hideText recordItemId={record.id} />
              </Space>
            ),
          },
        ]}
      />
    </List>
  );
};
