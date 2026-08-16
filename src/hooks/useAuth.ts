import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async ({ signal }) => {
      const { getMe } = await import("@/services/api");
      return getMe({ signal });
    },
    staleTime: 30_000,
    // 后台在新标签页登录后，返回时必须立即校验。
    refetchOnWindowFocus: "always",
  });
}
