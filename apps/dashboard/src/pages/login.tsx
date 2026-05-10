import { AuthPage } from "@refinedev/antd";

export const LoginPage = () => (
  <AuthPage
    type="login"
    title={<h1 style={{ textAlign: "center", margin: 0 }}>Monobase Admin</h1>}
    formProps={{
      initialValues: { email: "admin@cam-travel.local", password: "password123" },
    }}
    registerLink={false}
    forgotPasswordLink={false}
  />
);
