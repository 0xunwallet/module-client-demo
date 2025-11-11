import { useState } from "react";
import {
  getRequiredState,
  createOrchestrationData,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from "unwallet";
import type { CurrentState, OrchestrationData } from "unwallet";
import { formatError } from "@/lib/error-utils";
import { getNetworkByChainId } from "@/lib/chain-constants";

interface UseOrchestrationCreationParams {
  currentState: {
    chainId: string;
    tokenAddress: string;
    amount: string;
  } | null;
  ownerAddress: string;
  destinationChainId: string; // ✅ NEW: Destination chain ID
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
  destinationChainId,
}: UseOrchestrationCreationParams): UseOrchestrationCreationReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orchestrationData, setOrchestrationData] =
    useState<OrchestrationData | null>(null);

  const createOrchestration = async (): Promise<OrchestrationData | null> => {
    if (!currentState || !ownerAddress || !destinationChainId) {
      setError("Missing required data for orchestration creation");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Determine source and destination networks dynamically (like test file)
      const sourceChainId = parseInt(currentState.chainId);
      const destChainId = parseInt(destinationChainId);
      const isSameChain = sourceChainId === destChainId;

      const sourceNetwork = getNetworkByChainId(sourceChainId);
      const destNetwork = getNetworkByChainId(destChainId);

      console.log("\n🌉 Bidirectional Flow Configuration");
      console.log("-----------------------------------");
      console.log(
        `📍 Source Chain: ${sourceNetwork.name} (${sourceNetwork.chainId})`
      );
      console.log(
        `📍 Destination Chain: ${destNetwork.name} (${destNetwork.chainId})`
      );
      console.log(
        `📍 Flow Type: ${
          isSameChain ? "Same-Chain (No Bridge)" : "Cross-Chain"
        }`
      );

      // Test configuration
      const TEST_CONFIG = {
        bridgeAmount: parseFloat(currentState.amount) * 1e6,
        apiUrl:
          process.env.NEXT_PUBLIC_SERVER_URL ||
          process.env.NEXT_PUBLIC_TEST_SERVER_URL ||
          "https://tee.wall8.xyz",
        apiKey:
          process.env.NEXT_PUBLIC_API_KEY || "test-gasless-deposit-eip3009",
      };

      // Get required state for AutoEarn module on destination chain
      // For same-chain flows, this will be the same chain as source
      console.log("\n📊 Getting Required State");
      console.log("--------------------------");
      console.log(
        `📊 Getting required state for AutoEarn module on ${destNetwork.name} (chainId: ${destNetwork.chainId})...`
      );
      type SupportedChainId = Parameters<
        typeof getRequiredState
      >[0]["sourceChainId"];

      // For same-chain: use the same chain ID (matching test file exactly)
      const chainIdForRequiredState = isSameChain
        ? sourceChainId // Use source chain ID for same-chain (matches test file)
        : destChainId; // Use destination chain ID for cross-chain

      const requiredState = await getRequiredState({
        sourceChainId: String(
          chainIdForRequiredState
        ) as unknown as SupportedChainId,
        moduleName: "AUTOEARN",
      });

      // Verify that for same-chain, the requiredState chainId matches currentState chainId
      if (isSameChain && requiredState.chainId !== String(sourceChainId)) {
        console.warn(
          `⚠️  Warning: Same-chain flow but requiredState.chainId (${requiredState.chainId}) doesn't match sourceChainId (${sourceChainId})`
        );
      }

      console.log("✅ Required state retrieved:");
      console.log(`   Chain ID: ${requiredState.chainId}`);
      console.log(`   Module: ${requiredState.moduleName}`);
      console.log(`   Module Address: ${requiredState.moduleAddress}`);
      console.log(`   Config Input Type: ${requiredState.configInputType}`);

      // Encode AutoEarn module data for destination chain
      // For same-chain: use destination chain (which equals source chain)
      console.log("\n🔧 Encoding AutoEarn module configuration...");
      const autoEarnConfig = createAutoEarnConfig(
        destNetwork.chainId, // ✅ Destination chain ID (for same-chain, equals source)
        destNetwork.contracts.usdcToken, // ✅ Destination chain token
        destNetwork.contracts.aavePool // ✅ Destination chain Aave pool
      );
      const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
      console.log(
        `✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`
      );

      // Create orchestration request with source chain
      // For same-chain flows, currentState.chainId should match requiredState.chainId
      // This is how createOrchestrationData detects same-chain vs cross-chain
      console.log("\n🎯 Creating orchestration request...");
      const currentStateForOrchestration: CurrentState = {
        chainId: String(
          sourceNetwork.chainId
        ) as unknown as CurrentState["chainId"], // ✅ Source chain ID (for same-chain, this matches destination)
        tokenAddress: sourceNetwork.contracts.usdcToken, // ✅ Source chain token
        tokenAmount: TEST_CONFIG.bridgeAmount.toString(),
        ownerAddress: ownerAddress as `0x${string}`,
      };

      // Verify same-chain detection: currentState.chainId should match requiredState.chainId
      if (isSameChain) {
        console.log(
          `✅ Same-chain flow detected: currentState.chainId (${currentStateForOrchestration.chainId}) matches requiredState.chainId (${requiredState.chainId})`
        );
      } else {
        console.log(
          `✅ Cross-chain flow: currentState.chainId (${currentStateForOrchestration.chainId}) != requiredState.chainId (${requiredState.chainId})`
        );
      }

      console.log("📝 User Intent:");
      console.log(
        `   Current: ${(TEST_CONFIG.bridgeAmount / 1e6).toFixed(6)} USDC on ${
          sourceNetwork.name
        }`
      );
      console.log(`   Target: Invest in Aave on ${destNetwork.name}`);
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
      console.log(
        `💼 Source Account: ${orchestration.accountAddressOnSourceChain}`
      );
      console.log(
        `💼 Destination Account: ${orchestration.accountAddressOnDestinationChain}`
      );
      console.log(
        `🔧 Source Modules: ${orchestration.sourceChainAccountModules.join(
          ", "
        )}`
      );
      console.log(
        `🔧 Destination Modules: ${orchestration.destinationChainAccountModules.join(
          ", "
        )}`
      );

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
