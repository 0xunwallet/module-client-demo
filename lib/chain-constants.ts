import { baseSepolia, arbitrumSepolia } from "viem/chains";
import type { Address } from "viem";

export const BASE_CHAIN = baseSepolia;
export const ARBITRUM_CHAIN = arbitrumSepolia;

// Network configurations matching test file
export const NETWORKS = {
  baseSepolia: {
    name: "Base Sepolia",
    chainId: 84532,
    chain: baseSepolia,
    rpcUrl:
      process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    contracts: {
      autoEarnModule: "0x6e1fAc6e36f01615ef0c0898Bf6c5F260Bf2609a" as Address,
      usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
      aavePool: "0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b" as Address,
    },
  },
  arbitrumSepolia: {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    chain: arbitrumSepolia,
    rpcUrl:
      process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC ||
      "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
    contracts: {
      autoEarnModule: "0x42CF1b746F96D6cc59e84F87d26Ea64D3fbCa3a0" as Address,
      usdcToken: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" as Address,
      aavePool: "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff" as Address,
    },
  },
} as const;

// Helper function to get network by chain ID
export function getNetworkByChainId(chainId: number | string) {
  const id = typeof chainId === "string" ? parseInt(chainId) : chainId;
  return id === 84532 ? NETWORKS.baseSepolia : NETWORKS.arbitrumSepolia;
}

// Helper function to get network by chain name
export function getNetworkByName(chainName: "base" | "arbitrum") {
  return chainName === "base" ? NETWORKS.baseSepolia : NETWORKS.arbitrumSepolia;
}
