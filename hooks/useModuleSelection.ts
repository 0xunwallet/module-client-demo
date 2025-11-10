import { useCallback, useState } from "react";
import { getRequiredState } from "unwallet";
import type { ModuleName, RequiredStateData } from "unwallet";
import { formatError } from "@/lib/error-utils";

interface UseModuleSelectionReturn {
  loading: boolean;
  error: string | null;
  requiredState: RequiredStateData | null;
  selectModule: (
    moduleName: ModuleName,
    destinationChainId?: number | string
  ) => Promise<void>;
  reset: () => void;
}

export function useModuleSelection(): UseModuleSelectionReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiredState, setRequiredState] = useState<RequiredStateData | null>(
    null
  );

  type SupportedChainId = Parameters<
    typeof getRequiredState
  >[0]["sourceChainId"];

  const selectModule = useCallback(
    async (moduleName: ModuleName, destinationChainId?: number | string) => {
      setLoading(true);
      setError(null);
      try {
        // Default to Arbitrum Sepolia if no destination chain provided
        const defaultChainId = 421614;
        const targetChainId = destinationChainId
          ? typeof destinationChainId === "string"
            ? parseInt(destinationChainId)
            : destinationChainId
          : defaultChainId;

        // Note: sourceChainId parameter is misleading - it's actually the destination chain
        const result = await getRequiredState({
          moduleName,
          sourceChainId: String(targetChainId) as unknown as SupportedChainId,
        });
        setRequiredState(result);
      } catch (err) {
        const errorMessage = formatError(err);
        setError(errorMessage);
        console.error("Error getting required state:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = () => {
    setRequiredState(null);
    setError(null);
    setLoading(false);
  };

  return {
    loading,
    error,
    requiredState,
    selectModule,
    reset,
  };
}
