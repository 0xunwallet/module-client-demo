import { useState } from "react";
import { getRequiredState } from "unwallet";
import type { ModuleName, RequiredStateData } from "unwallet";
import { formatError } from "@/lib/error-utils";

interface UseModuleSelectionReturn {
  loading: boolean;
  error: string | null;
  requiredState: RequiredStateData | null;
  selectModule: (moduleName: ModuleName) => Promise<void>;
  reset: () => void;
}

export function useModuleSelection(): UseModuleSelectionReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiredState, setRequiredState] = useState<RequiredStateData | null>(null);

  const selectModule = async (moduleName: ModuleName) => {
    setLoading(true);
    setError(null);
    try {
      // Match test script: getRequiredState is called with arbitrumSepolia.id (destination chain)
      const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
      const result = await getRequiredState({
        moduleName,
        sourceChainId: ARBITRUM_SEPOLIA_CHAIN_ID,
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
  };

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

