import type { AuthProvider } from "@refinedev/core";
import { authClient } from "./auth-client";

export const authProvider: AuthProvider = {
  login: async ({ email, password }: { email: string; password: string }) => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      return {
        success: false,
        error: { name: "Login failed", message: error.message ?? "Invalid credentials" },
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
    return data?.session
      ? { authenticated: true }
      : { authenticated: false, redirectTo: "/login", logout: true };
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
