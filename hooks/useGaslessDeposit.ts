import { useState } from "react";
import {
  depositGasless,
  notifyDepositGasless,
  pollOrchestrationStatus,
  TransferType,
} from "unwallet";
import type {
  OrchestrationData,
  GaslessDepositResult,
  OrchestrationStatus,
} from "unwallet";
import type { PublicClient, WalletClient } from "viem";
import { formatError } from "@/lib/error-utils";

interface UseGaslessDepositParams {
  orchestrationData: OrchestrationData | null;
  currentState: {
    amount: string;
  } | null;
  walletClient: WalletClient | undefined;
  publicClient: PublicClient | null | undefined;
}

interface UseGaslessDepositReturn {
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

export function useGaslessDeposit({
  orchestrationData,
  currentState,
  walletClient,
  publicClient,
}: UseGaslessDepositParams): UseGaslessDepositReturn {
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
    
    if (
      !walletClient ||
      !dataToUse ||
      !currentState ||
      !publicClient
    ) {
      const missing = [];
      if (!walletClient) missing.push("walletClient");
      if (!dataToUse) missing.push("orchestrationData");
      if (!currentState) missing.push("currentState");
      if (!publicClient) missing.push("publicClient");
      console.error(`Missing required data for gasless deposit: ${missing.join(", ")}`);
      setError(null); // Don't show error to user
      return;
    }

    // Type assertion for publicClient compatibility
    const viemPublicClient = publicClient as PublicClient;

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
      };

      // EXACT MATCH TO TEST FILE - Test configuration
      const TEST_CONFIG = {
        bridgeAmount: BigInt(parseFloat(currentState.amount) * 1e6),
      };

      // EXACT MATCH TO TEST FILE - GASLESS DEPOSIT WITH EIP-3009
      console.log("\n===== 3. GASLESS DEPOSIT WITH EIP-3009 (using SDK) =====");
      console.log(
        `Amount: ${(Number(TEST_CONFIG.bridgeAmount) / 1e6).toFixed(6)} USDC`
      );
      console.log(
        `Smart Account: ${dataToUse.accountAddressOnSourceChain}`
      );
      console.log("\nSigning EIP-3009 authorization (GASLESS!)...");
      console.log(`   From: ${walletClient.account?.address} (main wallet with USDC)`);
      console.log(
        `   To: ${dataToUse.accountAddressOnSourceChain} (smart account)`
      );
      console.log(`   ⚠️  Signing is OFF-CHAIN - NO GAS NEEDED!`);

      // EXACT MATCH TO TEST FILE - Use SDK depositGasless function
      if (!walletClient.account?.address) {
        throw new Error("Wallet account address is not available");
      }

      const gaslessResult: GaslessDepositResult = await depositGasless(
        walletClient.account.address,
        dataToUse.accountAddressOnSourceChain,
        NETWORKS.baseSepolia.contracts.usdcToken,
        TEST_CONFIG.bridgeAmount,
        walletClient,
        viemPublicClient
      );

      if (!gaslessResult.success || !gaslessResult.signedAuthorization) {
        throw new Error(
          `Gasless deposit failed: ${gaslessResult.error || "Unknown error"}`
        );
      }

      console.log("\n✅ EIP-3009 authorization signed successfully (gasless)!");
      console.log(
        `   Authorization From: ${gaslessResult.signedAuthorization.from}`
      );
      console.log(`   Authorization To: ${gaslessResult.signedAuthorization.to}`);
      console.log(
        `   Authorization Value: ${(Number(gaslessResult.signedAuthorization.value) / 1e6).toFixed(6)} USDC`
      );
      console.log(
        `   Authorization Nonce: ${gaslessResult.signedAuthorization.nonce}`
      );

      // EXACT MATCH TO TEST FILE - NOTIFY SERVER WITH SIGNED AUTHORIZATION
      console.log(
        "\n===== 4. NOTIFY SERVER WITH SIGNED AUTHORIZATION (using SDK) ====="
      );
      console.log(
        `   Transfer Type: TRANSFER_WITH_AUTHORIZATION (${TransferType.TRANSFER_WITH_AUTHORIZATION})`
      );
      console.log(`   Request ID: ${dataToUse.requestId}`);
      console.log(
        `   ⚠️  Note: No transaction hash needed - signing was off-chain!`
      );

      // EXACT MATCH TO TEST FILE - Use SDK notifyDepositGasless function
      await notifyDepositGasless(
        dataToUse.requestId,
        "0x" as `0x${string}`,
        "0",
        gaslessResult.signedAuthorization
      );

      console.log("✅ Server notified successfully!");
      console.log(
        "   Server will execute transferWithAuthorization in Multicall3 batch"
      );

      // EXACT MATCH TO TEST FILE - MONITOR ORCHESTRATION STATUS
      console.log(
        "\n===== 5. MONITOR ORCHESTRATION STATUS (using SDK) ====="
      );
      console.log("⏳ Server will now:");
      console.log("   1. Execute Multicall3 batch:");
      console.log(
        "      - transferWithAuthorization (move from user wallet to smart account)"
      );
      console.log("      - Deploy smart account on source chain");
      console.log("      - Execute bridge operation");
      console.log("   2. Monitor destination chain for funds");
      console.log("   3. Deploy smart account on destination chain");
      console.log("   4. Execute AutoEarn module");
      console.log("\n⏳ Polling orchestration status...");
      console.log("   (This may take 2-3 minutes for bridge transfer)");
      console.log("   ✅ Completely gasless - user only signed off-chain!");

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
      console.error("Error in gasless deposit:", err);
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

