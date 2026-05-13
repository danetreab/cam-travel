import { Image, Input, Select, Space, Table, Tag, Typography } from "antd";
import { StarFilled } from "@ant-design/icons";
import {
  List,
  EditButton,
  DeleteButton,
  FilterDropdown,
  getDefaultFilter,
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

const ACTIVITY_TYPES = Object.keys(ACTIVITY_COLORS);

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
  const { tableProps, filters } = useTable<Attraction>({
    resource: "attractions",
    syncWithLocation: true,
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    meta: { gqlQuery: ATTRACTIONS_LIST_QUERY },
  });

  return (
    <List {...props}>
      <Table<Attraction>
        {...tableProps}
        rowKey="id"
        size="small"
        pagination={{
          ...tableProps.pagination,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        }}
      >
        <Table.Column<Attraction>
          title="Photo"
          key="photo"
          width={100}
          render={(_, record) => {
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
          }}
        />
        <Table.Column
          title="Name"
          dataIndex="name"
          filterDropdown={(dropdownProps) => (
            <FilterDropdown {...dropdownProps}>
              <Input
                style={{ width: 200 }}
                placeholder="Search name"
                allowClear
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("name", filters, "contains")}
        />
        <Table.Column
          title="Province"
          dataIndex="province"
          render={(v: string | null) =>
            v ?? <Typography.Text type="secondary">—</Typography.Text>
          }
          filterDropdown={(dropdownProps) => (
            <FilterDropdown {...dropdownProps}>
              <Select
                style={{ width: 200 }}
                placeholder="All provinces"
                options={PROVINCES.map((p) => ({ label: p, value: p }))}
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("province", filters, "eq")}
        />
        <Table.Column
          title="Type"
          dataIndex="activityType"
          render={(v: string | null) =>
            v ? <Tag color={ACTIVITY_COLORS[v] ?? "default"}>{v}</Tag> : "—"
          }
          filterDropdown={(dropdownProps) => (
            <FilterDropdown {...dropdownProps}>
              <Select
                style={{ width: 200 }}
                placeholder="All types"
                options={ACTIVITY_TYPES.map((t) => ({ label: t, value: t }))}
                allowClear
              />
            </FilterDropdown>
          )}
          defaultFilteredValue={getDefaultFilter("activityType", filters, "eq")}
        />
        <Table.Column<Attraction>
          title="Rating"
          dataIndex="cachedRating"
          render={(v: number | null, record) =>
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
            )
          }
        />
        <Table.Column<Attraction>
          title="Actions"
          key="actions"
          render={(_, record) => (
            <Space>
              <EditButton hideText recordItemId={record.id} />
              <DeleteButton hideText recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
