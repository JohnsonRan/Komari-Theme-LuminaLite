import { useQuery } from "@tanstack/react-query";
import type { PublicConfig } from "@/types/komari";

export function usePublicConfig() {
  return useQuery<PublicConfig>({
    queryKey: ["public"],
    queryFn: async ({ signal }) => {
      const { getPublic } = await import("@/services/api");
      return getPublic({ signal });
    },
    staleTime: 60_000,
  });
}
