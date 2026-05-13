import { Avatar, Layout, Space, Switch, Typography, theme } from "antd";
import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@refinedev/core";
import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { useTheme } from "next-themes";

type Identity = { name?: string; avatar?: string };

export const Header = ({ sticky }: RefineThemedLayoutHeaderProps) => {
  const { token } = theme.useToken();
  const { data: user } = useGetIdentity<Identity>();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Layout.Header
      style={{
        backgroundColor: token.colorBgElevated,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0px 24px",
        height: 64,
        ...(sticky ? { position: "sticky", top: 0, zIndex: 1 } : {}),
      }}
    >
      <Space size="middle">
        <Switch
          checked={isDark}
          onChange={(checked) => setTheme(checked ? "dark" : "light")}
          checkedChildren={<MoonOutlined />}
          unCheckedChildren={<SunOutlined />}
        />
        {user?.name && <Typography.Text strong>{user.name}</Typography.Text>}
        {user?.avatar && <Avatar src={user.avatar} alt={user.name} />}
      </Space>
    </Layout.Header>
  );
};
