import { useState } from "react";
import {
  getRequiredState,
  createOrchestrationData,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from "unwallet";
import type {
  CurrentState,
  OrchestrationData,
  RequiredStateData,
} from "unwallet";
import { formatError } from "@/lib/error-utils";

interface UseOrchestrationCreationParams {
  currentState: {
    chainId: string;
    tokenAddress: string;
    amount: string;
  } | null;
  ownerAddress: string;
}

interface UseOrchestrationCreationReturn {
  loading: boolean;
  error: string | null;
  orchestrationData: OrchestrationData | null;
  createOrchestration: () => Promise<OrchestrationData | null>;
  reset: () => void;
}

export function useOrchestrationCreation({
  currentState,
  ownerAddress,
}: UseOrchestrationCreationParams): UseOrchestrationCreationReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orchestrationData, setOrchestrationData] =
    useState<OrchestrationData | null>(null);

  const createOrchestration = async () => {
    if (!currentState || !ownerAddress) {
      setError("Missing required data for orchestration creation");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // EXACT MATCH TO TEST FILE - Network configurations
      const NETWORKS = {
        baseSepolia: {
          contracts: {
            usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
          },
        },
        arbitrumSepolia: {
          contracts: {
            usdcToken: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" as `0x${string}`,
            aavePool: "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff" as `0x${string}`,
          },
        },
      };

      // EXACT MATCH TO TEST FILE - Test configuration
      const TEST_CONFIG = {
        bridgeAmount: parseFloat(currentState.amount) * 1e6,
        apiUrl:
          process.env.NEXT_PUBLIC_SERVER_URL ||
          process.env.NEXT_PUBLIC_TEST_SERVER_URL ||
          "https://tee.wall8.xyz",
        apiKey:
          process.env.NEXT_PUBLIC_API_KEY || "test-gasless-deposit-eip3009",
      };

      // EXACT MATCH TO TEST FILE - Get required state for AutoEarn module
      console.log("\n📊 Getting Required State");
      console.log("--------------------------");
      const requiredState = await getRequiredState({
        sourceChainId: 421614, // arbitrumSepolia.id
        moduleName: "AUTOEARN",
      });

      console.log("✅ Required state retrieved:");
      console.log(`   Chain ID: ${requiredState.chainId}`);
      console.log(`   Module: ${requiredState.moduleName}`);
      console.log(`   Module Address: ${requiredState.moduleAddress}`);
      console.log(`   Config Input Type: ${requiredState.configInputType}`);

      // EXACT MATCH TO TEST FILE - Encode AutoEarn module data
      console.log("🔧 Encoding AutoEarn module configuration...");
      const autoEarnConfig = createAutoEarnConfig(
        421614, // Arbitrum Sepolia chain ID
        NETWORKS.arbitrumSepolia.contracts.usdcToken,
        NETWORKS.arbitrumSepolia.contracts.aavePool
      );
      const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
      console.log(
        `✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`
      );

      // EXACT MATCH TO TEST FILE - Create orchestration request
      console.log("\n🎯 Creating orchestration request...");
      const currentStateForOrchestration: CurrentState = {
        chainId: 84532, // baseSepolia.id
        tokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
        tokenAmount: TEST_CONFIG.bridgeAmount.toString(),
        ownerAddress: ownerAddress as `0x${string}`,
      };

      console.log("📝 User Intent:");
      console.log(
        `   Current: ${(TEST_CONFIG.bridgeAmount / 1e6).toFixed(6)} USDC on Base`
      );
      console.log(`   Target: Invest in Aave on Arbitrum`);
      console.log(`   User: ${ownerAddress}`);

      // EXACT MATCH TO TEST FILE - Create orchestration data
      const orchestration = await createOrchestrationData(
        currentStateForOrchestration,
        requiredState,
        ownerAddress as `0x${string}`,
        TEST_CONFIG.apiKey,
        encodedData as `0x${string}`
      );

      setOrchestrationData(orchestration);
      console.log("\n✅ Orchestration Created Successfully!");
      console.log("--------------------------------------");
      console.log(`📌 Request ID: ${orchestration.requestId}`);
      console.log(`📍 Source Chain: ${orchestration.sourceChainId}`);
      console.log(`📍 Destination Chain: ${orchestration.destinationChainId}`);
      console.log(`💼 Source Account: ${orchestration.accountAddressOnSourceChain}`);
      console.log(`💼 Destination Account: ${orchestration.accountAddressOnDestinationChain}`);
      console.log(`🔧 Source Modules: ${orchestration.sourceChainAccountModules.join(", ")}`);
      console.log(`🔧 Destination Modules: ${orchestration.destinationChainAccountModules.join(", ")}`);
      
      return orchestration;
    } catch (err) {
      const errorMessage = formatError(err);
      setError(errorMessage);
      console.error("Error creating orchestration data:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setOrchestrationData(null);
    setError(null);
    setLoading(false);
  };

  return {
    loading,
    error,
    orchestrationData,
    createOrchestration,
    reset,
  };
}

