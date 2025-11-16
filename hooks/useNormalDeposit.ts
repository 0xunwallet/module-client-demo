import { useState } from "react";
import {
  transferToOrchestrationAccount,
  notifyDeposit,
  pollOrchestrationStatus,
} from "unwallet";
import type { OrchestrationData, OrchestrationStatus } from "unwallet";
import type { PublicClient, WalletClient } from "viem";
import { formatError } from "@/lib/error-utils";
import { getNetworkByChainId } from "@/lib/chain-constants";

interface UseNormalDepositParams {
  orchestrationData: OrchestrationData | null;
  currentState: {
    chainId?: string;
    amount: string;
  } | null;
  walletClient: WalletClient | undefined;
  publicClient: PublicClient | null | undefined;
  moduleName?: string; // Optional: module name to determine deposit strategy
}

interface UseNormalDepositReturn {
  loading: boolean;
  error: string | null;
  deposit: (
    orchestrationDataOverride?: OrchestrationData | null,
    callbacks?: {
      onStatusUpdate?: (status: OrchestrationStatus) => void;
      onComplete?: (status: OrchestrationStatus) => void;
    }
  ) => Promise<void>;
  reset: () => void;
}

export function useNormalDeposit({
  orchestrationData,
  currentState,
  walletClient,
  publicClient,
  moduleName,
}: UseNormalDepositParams): UseNormalDepositReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = async (
    orchestrationDataOverride?: OrchestrationData | null,
    callbacks?: {
      onStatusUpdate?: (status: OrchestrationStatus) => void;
      onComplete?: (status: OrchestrationStatus) => void;
    }
  ) => {
    // Use override if provided, otherwise use state
    const dataToUse = orchestrationDataOverride ?? orchestrationData;

    if (!walletClient || !dataToUse || !currentState || !publicClient) {
      const missing = [];
      if (!walletClient) missing.push("walletClient");
      if (!dataToUse) missing.push("orchestrationData");
      if (!currentState) missing.push("currentState");
      if (!publicClient) missing.push("publicClient");
      console.error(
        `Missing required data for normal deposit: ${missing.join(", ")}`
      );
      setError(null); // Don't show error to user
      return;
    }

    // Type assertion for publicClient compatibility
    const viemPublicClient = publicClient as PublicClient;

    setLoading(true);
    setError(null);

    try {
      // Determine source chain dynamically from orchestrationData or currentState
      const sourceChainId = dataToUse?.sourceChainId
        ? parseInt(String(dataToUse.sourceChainId))
        : currentState?.chainId
        ? parseInt(currentState.chainId)
        : 84532; // fallback to Base Sepolia

      const sourceNetwork = getNetworkByChainId(sourceChainId);
      const isSameChain =
        String(dataToUse.sourceChainId) ===
        String(dataToUse.destinationChainId);

      console.log("\n💰 Normal Deposit Configuration");
      console.log("--------------------------------");
      console.log(`📍 Chain: ${sourceNetwork.name} (${sourceNetwork.chainId})`);
      console.log(`📍 Token: ${sourceNetwork.contracts.usdcToken}`);
      console.log(
        `📍 Type: ${isSameChain ? "Same-Chain (No Bridge)" : "Cross-Chain"}`
      );

      // Test configuration
      const TEST_CONFIG = {
        bridgeAmount: BigInt(parseFloat(currentState.amount) * 1e6),
      };

      // NORMAL DEPOSIT - Direct Transfer
      console.log("\n===== NORMAL DEPOSIT (using SDK) =====");
      console.log(
        `Amount: ${(Number(TEST_CONFIG.bridgeAmount) / 1e6).toFixed(6)} USDC`
      );
      console.log(`From: ${walletClient.account?.address} (User Wallet)`);

      if (!walletClient.account?.address) {
        throw new Error("Wallet account address is not available");
      }

      // For BondModule, always send to source account address (matching test file)
      // For other modules, use transferToOrchestrationAccount which handles orchestration
      let depositResult;
      if (moduleName === "BOND") {
        // BondModule: Always send to source account address
        const sourceAccountAddress = dataToUse.accountAddressOnSourceChain;
        console.log(
          `To: ${sourceAccountAddress} (Source Account - BondModule always uses source)`
        );
        console.log(
          `⚠️  This will submit an on-chain transaction (user pays gas)`
        );

        // For BondModule, create a modified orchestration data that uses source account
        // This ensures transferToOrchestrationAccount sends to source account
        const bondOrchestrationData = {
          ...dataToUse,
          accountAddressOnDestinationChain: sourceAccountAddress, // Override to use source account
        };

        depositResult = await transferToOrchestrationAccount(
          bondOrchestrationData,
          walletClient,
          viemPublicClient
        );
      } else {
        // Other modules: Use transferToOrchestrationAccount
        console.log(
          `To: ${dataToUse.accountAddressOnDestinationChain} (Smart Account)`
        );
        console.log(
          `⚠️  This will submit an on-chain transaction (user pays gas)`
        );

        depositResult = await transferToOrchestrationAccount(
          dataToUse,
          walletClient,
          viemPublicClient
        );
      }

      if (!depositResult.success || !depositResult.txHash) {
        throw new Error(
          `Transfer failed: ${depositResult.error || "Unknown error"}`
        );
      }

      console.log("\n✅ Transfer submitted successfully!");
      console.log(`   Transaction Hash: ${depositResult.txHash}`);

      // Wait for transaction confirmation
      console.log("⏳ Waiting for transaction confirmation...");
      const receipt = await viemPublicClient.waitForTransactionReceipt({
        hash: depositResult.txHash as `0x${string}`,
      });

      console.log(`✅ Transfer confirmed! Block: ${receipt.blockNumber}`);

      // NOTIFY SERVER
      console.log("\n===== NOTIFY SERVER OF DEPOSIT (using SDK) =====");
      console.log(`   Request ID: ${dataToUse.requestId}`);
      console.log(`   Transaction Hash: ${receipt.transactionHash}`);
      console.log(`   Block Number: ${receipt.blockNumber}`);

      await notifyDeposit({
        requestId: dataToUse.requestId,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber.toString(),
      });

      console.log("✅ Server notified successfully!");

      // MONITOR ORCHESTRATION STATUS
      console.log("\n===== MONITOR ORCHESTRATION STATUS (using SDK) =====");
      if (isSameChain) {
        console.log("⏳ Server will now:");
        console.log("   1. Execute Multicall3 batch:");
        console.log("      - Deploy Nexus account on chain");
        console.log("      - Execute AutoEarn module (deposit to Aave)");
        console.log("   2. Update status to COMPLETED");
        console.log("   ⚠️  No bridge needed - same chain!");
      } else {
        console.log("⏳ Server will now:");
        console.log("   1. Execute Multicall3 batch:");
        console.log("      - Deploy smart account on source chain");
        console.log("      - Execute bridge operation");
        console.log("   2. Monitor destination chain for funds");
        console.log("   3. Deploy smart account on destination chain");
        console.log("   4. Execute AutoEarn module");
      }
      console.log("\n⏳ Polling orchestration status...");

      await pollOrchestrationStatus({
        requestId: dataToUse.requestId,
        interval: 5000,
        maxAttempts: 60,
        onStatusUpdate: (status: OrchestrationStatus) => {
          console.log(`\n[Status Update] ${status.status}`);
          if (status.updated_at || status.created_at) {
            console.log(
              `   Updated: ${new Date(
                status.updated_at || status.created_at || Date.now()
              ).toLocaleString()}`
            );
          }
          if (status.error_message) {
            console.log(`   Error: ${status.error_message}`);
          }
          // Call user-provided callback
          callbacks?.onStatusUpdate?.(status);
        },
        onComplete: (status: OrchestrationStatus) => {
          console.log("\n🎉 Orchestration completed successfully!");
          console.log(`   Final Status: ${status.status}`);
          // Call user-provided callback
          callbacks?.onComplete?.(status);
        },
        onError: (error: Error) => {
          console.log(`\n❌ Orchestration error: ${error.message}`);
        },
      });
    } catch (err) {
      const errorMessage = formatError(err);
      setError(errorMessage);
      console.error("Error in normal deposit:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setError(null);
    setLoading(false);
  };

  return {
    loading,
    error,
    deposit,
    reset,
  };
}
