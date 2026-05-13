import { Image, Select, Space, Table, Tag, Typography } from "antd";
import { StarFilled } from "@ant-design/icons";
import {
  List,
  EditButton,
  DeleteButton,
  useTable,
} from "@refinedev/antd";
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
        province
        activityType
        cachedRating
        cachedUserRatingsTotal
        files {
          id
          thumbnailUrl
          hasThumbnail
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

// Cambodian provinces relevant for travel. Order roughly mirrors traveller
// volume; "Other" intentionally absent — leave the filter cleared instead.
const PROVINCES = [
  "Phnom Penh",
  "Siem Reap",
  "Preah Sihanouk",
  "Battambang",
  "Kampot",
  "Kep",
  "Mondulkiri",
  "Ratanakiri",
  "Koh Kong",
  "Pursat",
  "Kampong Cham",
  "Kratie",
  "Stung Treng",
  "Banteay Meanchey",
];

export const AttractionsList = (props: Partial<ListProps> = {}) => {
  const { tableProps, filters, setFilters } = useTable<Attraction>({
    resource: "attractions",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    meta: { gqlQuery: ATTRACTIONS_LIST_QUERY },
  });

  const provinceFilter = (filters ?? []).find(
    (f) => "field" in f && f.field === "province",
  );
  const selectedProvince =
    provinceFilter && "value" in provinceFilter
      ? (provinceFilter.value as string | undefined)
      : undefined;

  return (
    <List {...props}>
      <Space style={{ marginBottom: 16 }}>
        <Typography.Text>Province:</Typography.Text>
        <Select
          allowClear
          placeholder="All provinces"
          style={{ width: 220 }}
          value={selectedProvince}
          options={PROVINCES.map((p) => ({ label: p, value: p }))}
          onChange={(value) =>
            setFilters(
              value
                ? [{ field: "province", operator: "eq", value }]
                : [{ field: "province", operator: "eq", value: undefined }],
              "replace",
            )
          }
        />
      </Space>
      <Table<Attraction>
        {...tableProps}
        rowKey="id"
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
              const [first] = all;
              return (
                <Image.PreviewGroup items={all.map((url) => ({ src: url }))}>
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
            title: "Province",
            dataIndex: "province",
            render: (v: string | null) =>
              v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: "Type",
            dataIndex: "activityType",
            render: (v: string | null) =>
              v ? <Tag color={ACTIVITY_COLORS[v] ?? "default"}>{v}</Tag> : "—",
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
