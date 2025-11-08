import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Token addresses
const TOKEN_ADDRESSES = {
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
  arbitrumSepolia:
    "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" as `0x${string}`,
};

interface UseUSDCBalanceReturn {
  baseBalance: string | null;
  arbitrumBalance: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUSDCBalance(): UseUSDCBalanceReturn {
  const { address } = useAccount();
  const [baseBalance, setBaseBalance] = useState<string | null>(null);
  const [arbitrumBalance, setArbitrumBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = async () => {
    if (!address) {
      setBaseBalance(null);
      setArbitrumBalance(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Always fetch both balances by creating separate clients for each chain
      const { createPublicClient, http } = await import("viem");
      const { baseSepolia, arbitrumSepolia } = await import("viem/chains");

      const baseClient = createPublicClient({
        chain: baseSepolia,
        transport: http("https://sepolia.base.org"),
      });

      const arbitrumClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
      });

      // Fetch both balances in parallel
      const [baseBal, arbitrumBal] = await Promise.all([
        baseClient
          .readContract({
            address: TOKEN_ADDRESSES.baseSepolia,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          })
          .catch(() => BigInt(0)),
        arbitrumClient
          .readContract({
            address: TOKEN_ADDRESSES.arbitrumSepolia,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          })
          .catch(() => BigInt(0)),
      ]);

      setBaseBalance(formatUnits(baseBal as bigint, 6));
      setArbitrumBalance(formatUnits(arbitrumBal as bigint, 6));
    } catch (err) {
      console.error("Error fetching USDC balances:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch balances");
      setBaseBalance(null);
      setArbitrumBalance(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return {
    baseBalance,
    arbitrumBalance,
    loading,
    error,
    refetch: fetchBalances,
  };
}
