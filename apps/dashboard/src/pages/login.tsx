import { AuthPage } from "@refinedev/antd";

// Pre-fill credentials only when running in dev AND both vars are set, so
// contributors don't have to dig them up every reload. Production builds get
// a blank form regardless of what's in the environment.
const devEmail = import.meta.env.VITE_DEV_LOGIN_EMAIL as string | undefined;
const devPassword = import.meta.env.VITE_DEV_LOGIN_PASSWORD as string | undefined;
const devInitialValues =
  import.meta.env.DEV && devEmail && devPassword
    ? { email: devEmail, password: devPassword }
    : undefined;

export const LoginPage = () => (
  <AuthPage
    type="login"
    title={<h1 style={{ textAlign: "center", margin: 0 }}>Monobase Admin</h1>}
    formProps={devInitialValues ? { initialValues: devInitialValues } : undefined}
    registerLink={false}
    forgotPasswordLink={false}
  />
);
