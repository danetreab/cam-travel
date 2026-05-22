import type { AuthProvider } from "@refinedev/core";
import { authClient } from "./auth-client";

const NOT_ADMIN_MESSAGE =
  "This account does not have admin access to the dashboard.";

// better-auth's admin plugin stores a comma-separated string of roles on
// `user.role`. Treat the account as an admin if any of those entries match.
const isAdminRole = (role: string | null | undefined) =>
  !!role &&
  role
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .includes("admin");

export const authProvider: AuthProvider = {
  login: async ({ email, password }: { email: string; password: string }) => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      return {
        success: false,
        error: { name: "Login failed", message: error.message ?? "Invalid credentials" },
      };
    }

    const { data } = await authClient.getSession();
    if (!isAdminRole(data?.user?.role)) {
      await authClient.signOut();
      return {
        success: false,
        error: { name: "Not authorized", message: NOT_ADMIN_MESSAGE },
      };
    }

    return { success: true, redirectTo: "/" };
  },

  logout: async () => {
    await authClient.signOut();
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const { data } = await authClient.getSession();
    if (!data?.session) {
      return { authenticated: false, redirectTo: "/login", logout: true };
    }
    if (!isAdminRole(data.user?.role)) {
      await authClient.signOut();
      return {
        authenticated: false,
        redirectTo: "/login",
        logout: true,
        error: { name: "Not authorized", message: NOT_ADMIN_MESSAGE },
      };
    }
    return { authenticated: true };
  },

  getIdentity: async () => {
    const { data } = await authClient.getSession();
    return data?.user ?? null;
  },

  getPermissions: async () => {
    const { data } = await authClient.getSession();
    return data?.user?.role ?? null;
  },

  onError: async (error) => {
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return { logout: true, redirectTo: "/login", error };
    }
    return {};
  },
};
