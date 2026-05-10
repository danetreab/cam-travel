import { Authenticated, Refine } from "@refinedev/core";
import {
  ErrorComponent,
  ThemedLayout,
  ThemedTitle,
  useNotificationProvider,
} from "@refinedev/antd";
import routerProvider, {
  CatchAllNavigate,
  NavigateToResource,
} from "@refinedev/react-router";
import { App as AntdApp, ConfigProvider, theme } from "antd";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import "@refinedev/antd/dist/reset.css";

import { authProvider } from "./auth-provider";
import { ColorModeProvider, useColorMode } from "./contexts/color-mode";
import { Header } from "./components/header";
import { dataProvider, liveProvider, restDataProvider } from "./data-provider";
import { ItemsCreate } from "./pages/items/create";
import { ItemsEdit } from "./pages/items/edit";
import { ItemsList } from "./pages/items/list";
import { AttractionsCreate } from "./pages/attractions/create";
import { AttractionsEdit } from "./pages/attractions/edit";
import { AttractionsList } from "./pages/attractions/list";
import { LoginPage } from "./pages/login";
import { UsersList } from "./pages/users/list";

function AppInner() {
  const { mode } = useColorMode();
  return (
    <ConfigProvider
      theme={{
        algorithm:
          mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <AntdApp>
          <Refine
            authProvider={authProvider}
            dataProvider={{
              default: dataProvider,
              rest: restDataProvider,
            }}
            liveProvider={liveProvider}
            routerProvider={routerProvider}
            notificationProvider={useNotificationProvider}
            resources={[
              {
                name: "users",
                list: "/users",
                meta: { label: "Users", canDelete: false },
              },
              {
                name: "items",
                list: "/items",
                create: "/items/create",
                edit: "/items/edit/:id",
                meta: { label: "Items" },
              },
              {
                name: "attractions",
                list: "/attractions",
                create: "/attractions/create",
                edit: "/attractions/edit/:id",
                meta: { label: "Attractions" },
              },
            ]}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              // "auto" makes refine subscribe each list/one query to its
              // resource topic. Mutations elsewhere reach this client over
              // graphql-ws and refine refetches automatically.
              liveMode: "auto",
            }}
          >
            <Routes>
              <Route
                element={
                  <Authenticated key="auth-inner" fallback={<CatchAllNavigate to="/login" />}>
                    <ThemedLayout
                      Header={Header}
                      Title={({ collapsed }) => (
                        <ThemedTitle collapsed={collapsed} text="Monobase Admin" />
                      )}
                    >
                      <Outlet />
                    </ThemedLayout>
                  </Authenticated>
                }
              >
                <Route index element={<NavigateToResource resource="users" />} />
                <Route path="/users" element={<UsersList />} />
                <Route path="/items" element={<ItemsList />} />
                <Route path="/items/create" element={<ItemsCreate />} />
                <Route path="/items/edit/:id" element={<ItemsEdit />} />
                <Route path="/attractions" element={<AttractionsList />} />
                <Route path="/attractions/create" element={<AttractionsCreate />} />
                <Route path="/attractions/edit/:id" element={<AttractionsEdit />} />
                <Route path="*" element={<ErrorComponent />} />
              </Route>
              <Route
                element={
                  <Authenticated key="auth-outer" fallback={<Outlet />}>
                    <NavigateToResource resource="users" />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<LoginPage />} />
              </Route>
            </Routes>
          </Refine>
        </AntdApp>
      </ConfigProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ColorModeProvider>
        <AppInner />
      </ColorModeProvider>
    </BrowserRouter>
  );
}

export default App;
