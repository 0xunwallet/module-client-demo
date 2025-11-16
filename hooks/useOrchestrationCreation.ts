import { useState } from "react";
import {
  getRequiredState,
  createOrchestrationData,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
  encodeBondModuleData,
  createBondModuleConfig,
} from "unwallet";
import type { CurrentState, OrchestrationData, ModuleName } from "unwallet";
import { formatError } from "@/lib/error-utils";
import { getNetworkByChainId } from "@/lib/chain-constants";
import { parseUnits, createPublicClient, http } from "viem";
import type { PublicClient } from "viem";

interface UseOrchestrationCreationParams {
  currentState: {
    chainId: string;
    tokenAddress: string;
    amount: string;
  } | null;
  ownerAddress: string;
  destinationChainId: string; // ✅ NEW: Destination chain ID
  moduleName?: ModuleName; // ✅ NEW: Module name (defaults to AUTOEARN for backward compatibility)
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
  moduleName = "AUTOEARN", // Default to AUTOEARN for backward compatibility
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

      // Get required state for module on destination chain
      // For same-chain flows, this will be the same chain as source
      console.log("\n📊 Getting Required State");
      console.log("--------------------------");
      console.log(
        `📊 Getting required state for ${moduleName} module on ${destNetwork.name} (chainId: ${destNetwork.chainId})...`
      );
      type SupportedChainId = Parameters<
        typeof getRequiredState
      >[0]["sourceChainId"];

      // For same-chain: use the same chain ID (matching test file exactly)
      const chainIdForRequiredState = isSameChain
        ? sourceChainId // Use source chain ID for same-chain (matches test file)
        : destChainId; // Use destination chain ID for cross-chain

      // For BondModule, we need to pass publicClient to getRequiredState
      // Always create destination chain public client for BondModule (matching test file)
      let destPublicClient: PublicClient | undefined = undefined;
      if (moduleName === "BOND") {
        // Always create destination chain public client (matching test file pattern)
        // The test file always creates destPublicClient regardless of source chain
        destPublicClient = createPublicClient({
          chain: destNetwork.chain,
          transport: http(destNetwork.rpcUrl),
        }) as PublicClient;
        console.log(
          `✅ Created destination chain public client for BondModule: ${destNetwork.name}`
        );
      }

      // Get required state - for BondModule, pass publicClient (matching test file)
      const getRequiredStateParams: {
        sourceChainId: SupportedChainId;
        moduleName: ModuleName;
        publicClient?: PublicClient;
      } = {
        sourceChainId: String(
          chainIdForRequiredState
        ) as unknown as SupportedChainId,
        moduleName: moduleName,
      };

      // For BondModule, add publicClient parameter (matching test file)
      if (moduleName === "BOND" && destPublicClient) {
        getRequiredStateParams.publicClient = destPublicClient;
      }

      const requiredState = await getRequiredState(getRequiredStateParams);

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

      // Encode module data for destination chain
      // For same-chain: use destination chain (which equals source chain)
      let encodedData: `0x${string}`;

      if (moduleName === "BOND") {
        console.log("\n🔧 Encoding BondModule configuration...");
        const bridgeAmount = parseUnits(currentState.amount, 6); // USDC has 6 decimals
        const bondConfig = createBondModuleConfig(
          [destNetwork.contracts.usdcToken], // Token addresses to bond
          [bridgeAmount] // Total amounts for each token
        );
        console.log(`✅ Created BondModule config:`);
        console.log(
          `   Token Addresses: ${bondConfig.tokenAddresses.join(", ")}`
        );
        console.log(
          `   Total Amounts: ${bondConfig.totalAmounts
            .map((a) => (Number(a) / 1e6).toFixed(6))
            .join(", ")} USDC`
        );
        encodedData = encodeBondModuleData(bondConfig) as `0x${string}`;
        console.log(
          `✅ Encoded BondModule data: ${encodedData.substring(0, 66)}...`
        );
      } else {
        // Default to AutoEarn for backward compatibility
        console.log("\n🔧 Encoding AutoEarn module configuration...");
        const autoEarnConfig = createAutoEarnConfig(
          destNetwork.chainId, // ✅ Destination chain ID (for same-chain, equals source)
          destNetwork.contracts.usdcToken, // ✅ Destination chain token
          destNetwork.contracts.aavePool // ✅ Destination chain Aave pool
        );
        encodedData = encodeAutoEarnModuleData([
          autoEarnConfig,
        ]) as `0x${string}`;
        console.log(
          `✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`
        );
      }

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
      if (moduleName === "BOND") {
        console.log(`   Target: Bond USDC on ${destNetwork.name}`);
      } else {
        console.log(`   Target: Invest in Aave on ${destNetwork.name}`);
      }
      console.log(`   User: ${ownerAddress}`);

      // EXACT MATCH TO TEST FILE - Create orchestration data
      const orchestration = await createOrchestrationData(
        currentStateForOrchestration,
        requiredState,
        ownerAddress as `0x${string}`,
        TEST_CONFIG.apiKey,
        encodedData
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
