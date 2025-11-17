"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useEffect } from "react";
import type { ModuleName } from "unwallet";
import {
  useWalletClient,
  usePublicClient,
  useAccount,
  useSwitchChain,
} from "wagmi";
import { useModuleSelection } from "@/hooks/useModuleSelection";
import { useOrchestrationCreation } from "@/hooks/useOrchestrationCreation";
import { useGaslessDeposit } from "@/hooks/useGaslessDeposit";
import { useNormalDeposit } from "@/hooks/useNormalDeposit";
import { useUSDCBalance } from "@/hooks/useUSDCBalance";
import { getUserFriendlyError } from "@/lib/error-utils";
import {
  BASE_CHAIN,
  ARBITRUM_CHAIN,
  getNetworkByName,
} from "@/lib/chain-constants";
import { Check, ArrowRight, Loader2, Info, X, ChevronDown } from "lucide-react";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrchestrationStatus } from "unwallet";

// Logo Constants
const LOGOS = {
  VERIFIABLE_AGENT: "/verifiable-agent.svg",
  BOND: "/bond.svg",
  AAVE: "/aave.svg",
  USDC: "/usdc.png",
  ARBITRUM: "/arbitrum.png",
  BASE: "/base-chain.svg",
};

export default function InvestmentFlow() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [step, setStep] = useState(1);
  const [module, setModule] = useState<ModuleName | null>(null);
  const [destinationChain, setDestinationChain] = useState<
    "arbitrum" | "base" | null
  >(null);
  const [sourceChain, setSourceChain] = useState<"arbitrum" | "base" | null>(
    null
  );
  const [amount, setAmount] = useState("");
  const [processingDialogOpen, setProcessingDialogOpen] = useState(false);
  const [orchestrationStatus, setOrchestrationStatus] =
    useState<OrchestrationStatus | null>(null);
  const [destinationAccountAddress, setDestinationAccountAddress] = useState<
    string | null
  >(null);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [showSDKInfo, setShowSDKInfo] = useState(true);
  const [showSDKFunctionsInDialog, setShowSDKFunctionsInDialog] =
    useState(false);

  // Module Selection Hook
  const {
    loading: moduleSelectionLoading,
    error: moduleSelectionError,
    selectModule,
  } = useModuleSelection();

  // Prepare current state for orchestration
  const currentState =
    sourceChain && amount
      ? {
          chainId: sourceChain === "arbitrum" ? "421614" : "84532",
          tokenAddress:
            sourceChain === "arbitrum"
              ? "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
              : "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          amount: amount,
        }
      : null;

  // Prepare destination chain ID
  const destinationChainId =
    destinationChain === "arbitrum" ? "421614" : "84532";

  // Orchestration Creation Hook
  const {
    loading: orchestrationLoading,
    error: orchestrationError,
    orchestrationData,
    createOrchestration,
  } = useOrchestrationCreation({
    currentState,
    ownerAddress: walletClient?.account?.address || "",
    destinationChainId, // ✅ Pass destination chain
    moduleName: module || undefined, // ✅ Pass module name
  });

  // Check if same-chain flow
  const isSameChain =
    sourceChain && destinationChain && sourceChain === destinationChain;

  // Check if BondModule (uses normal deposit instead of gasless)
  const isBondModule = module === "BOND";

  // Gasless Deposit Hook (used for AUTOEARN and AUTOSWAP)
  const {
    loading: gaslessDepositLoading,
    error: gaslessDepositError,
    deposit: performGaslessDeposit,
  } = useGaslessDeposit({
    orchestrationData,
    currentState,
    walletClient: walletClient ?? undefined,
    publicClient: publicClient ?? null,
  });

  // Normal Deposit Hook (used for BOND module)
  const {
    loading: normalDepositLoading,
    error: normalDepositError,
    deposit: performNormalDeposit,
  } = useNormalDeposit({
    orchestrationData,
    currentState,
    walletClient: walletClient ?? undefined,
    publicClient: publicClient ?? null,
    moduleName: module || undefined, // Pass module name for BondModule-specific logic
  });

  // Unified deposit loading and error states
  const depositLoading = isBondModule
    ? normalDepositLoading
    : gaslessDepositLoading;
  const depositError = isBondModule ? normalDepositError : gaslessDepositError;

  // USDC Balance Hook
  const {
    baseBalance,
    arbitrumBalance,
    loading: balanceLoading,
    error: balanceError,
  } = useUSDCBalance();

  const handleModuleSelect = async (moduleName: ModuleName) => {
    setModule(moduleName);
    try {
      // If destination chain is already selected, pass it to module selection
      const destChainId =
        destinationChain === "arbitrum"
          ? 421614
          : destinationChain === "base"
          ? 84532
          : undefined;
      await selectModule(moduleName, destChainId);
      // Move to next step after successful selection
      setStep(2);
    } catch (error) {
      // Error is handled by the hook
      console.error("Error selecting module:", error);
    }
  };

  // Handle source chain selection with wallet chain switching
  const handleSourceChainSelect = async (chain: "arbitrum" | "base") => {
    setSourceChain(chain);

    // Switch wallet chain if connected
    if (isConnected && switchChain) {
      const targetChainId =
        chain === "arbitrum" ? ARBITRUM_CHAIN.id : BASE_CHAIN.id;

      // Only switch if not already on the target chain
      if (chainId !== targetChainId) {
        try {
          setSwitchingChain(true);
          await switchChain({ chainId: targetChainId });
        } catch (error) {
          console.error("Error switching chain:", error);
          // Don't block the flow if chain switch fails
        } finally {
          setSwitchingChain(false);
        }
      }
    }
  };

  // Update module selection when destination chain changes (if module is already selected)
  useEffect(() => {
    if (module && destinationChain) {
      const destChainId = destinationChain === "arbitrum" ? 421614 : 84532;
      selectModule(module, destChainId).catch((error) => {
        console.error("Error updating module selection:", error);
      });
    }
  }, [destinationChain, module, selectModule]);

  const handleExecute = async () => {
    if (!walletClient || !currentState) {
      console.error("Missing required data");
      return;
    }

    try {
      // Reset states
      setOrchestrationStatus(null);
      setDestinationAccountAddress(null);
      setProcessingDialogOpen(true);

      // Create orchestration and get the data directly
      const orchestration = await createOrchestration();

      if (!orchestration) {
        console.error("Failed to create orchestration");
        setProcessingDialogOpen(false);
        return;
      }

      // Store destination account address from orchestration
      setDestinationAccountAddress(
        orchestration.accountAddressOnDestinationChain
      );

      // Perform deposit with the orchestration data directly
      // BondModule uses normal deposit, others use gasless deposit
      if (isBondModule) {
        await performNormalDeposit(orchestration, {
          onStatusUpdate: (status) => {
            setOrchestrationStatus(status);
          },
          onComplete: (status) => {
            setOrchestrationStatus(status);
          },
        });
      } else {
        await performGaslessDeposit(orchestration, {
          onStatusUpdate: (status) => {
            setOrchestrationStatus(status);
          },
          onComplete: (status) => {
            setOrchestrationStatus(status);
          },
        });
      }
    } catch (error) {
      console.error("Error executing investment:", error);
      setProcessingDialogOpen(false);
    }
  };

  const formatBalance = (balance: string | null) => {
    if (balanceLoading) return "Loading...";
    if (balance === null) return "0.00";
    return parseFloat(balance).toFixed(2);
  };

  const getMaxAmount = () => {
    if (sourceChain === "arbitrum") {
      return arbitrumBalance || "0";
    }
    return baseBalance || "0";
  };

  // SDK Functions for each step - showing only functions actually called in that step
  const getSDKFunctionsForStep = () => {
    switch (step) {
      case 1:
        // Step 1: No SDK calls, just UI state
        return {
          title: "Step 1: Module Selection",
          functions: [],
          note: "No SDK calls - module selection is UI state only",
        };
      case 2:
        // Step 2: useEffect may call getRequiredState if module was already selected
        return {
          title: "Step 2: Destination Chain Selection",
          functions:
            module && destinationChain
              ? [
                  {
                    name: "getRequiredState",
                    params: `{
  moduleName: "${module}",
  sourceChainId: "${destinationChain === "arbitrum" ? "421614" : "84532"}"
}`,
                    description:
                      "Called via useEffect when destination chain changes (if module already selected)",
                  },
                  ...(module === "BOND"
                    ? [
                        {
                          name: "createBondModuleConfig",
                          params: `{
  tokenAddresses: [NETWORKS.${
    destinationChain === "arbitrum" ? "arbitrumSepolia" : "baseSepolia"
  }.contracts.usdcToken],
  totalAmounts: [parseUnits(amount, 6)]
}`,
                          description:
                            "Create BondModule configuration for destination chain",
                        },
                      ]
                    : [
                        {
                          name: "createAutoEarnConfig",
                          params: `{
  chainId: ${destinationChain === "arbitrum" ? 421614 : 84532},
  usdcToken: NETWORKS.${
    destinationChain === "arbitrum" ? "arbitrumSepolia" : "baseSepolia"
  }.contracts.usdcToken,
  aavePool: NETWORKS.${
    destinationChain === "arbitrum" ? "arbitrumSepolia" : "baseSepolia"
  }.contracts.aavePool
}`,
                          description:
                            "Create AutoEarn configuration for destination chain",
                        },
                      ]),
                ]
              : [],
          note:
            module && destinationChain
              ? undefined
              : "No SDK calls - module or destination chain not selected yet",
        };
      case 3:
        // Step 3: No SDK calls, just preparing state
        return {
          title: "Step 3: Source Chain & Amount Selection",
          functions: [],
          note: "No SDK calls - preparing currentState for orchestration",
        };
      case 4:
        // Step 4: When "Sign & Execute" is clicked, these functions are called in sequence
        return {
          title: "Step 4: Orchestration Creation & Execution",
          functions: [
            {
              name: "createOrchestrationData",
              params: `{
  currentState: {
    chainId: "${sourceChain === "arbitrum" ? "421614" : "84532"}",
    tokenAddress: NETWORKS.${
      sourceChain === "arbitrum" ? "arbitrumSepolia" : "baseSepolia"
    }.contracts.usdcToken,
    tokenAmount: "${amount}",
    ownerAddress: walletClient?.account?.address
  },
  requiredState: requiredState,
  ownerAddress: walletClient?.account?.address,
  apiKey: TEST_CONFIG.apiKey,
  encodedData: encodedData
}`,
              description:
                "Called in createOrchestration() - create orchestration request",
            },
            ...(module === "BOND"
              ? [
                  {
                    name: "deposit",
                    params: `{
  recipient: orchestrationData.accountAddressOnSourceChain,
  token: NETWORKS.${
    sourceChain === "arbitrum" ? "arbitrumSepolia" : "baseSepolia"
  }.contracts.usdcToken,
  amount: ${amount ? `BigInt(parseFloat("${amount}") * 1e6)` : "bridgeAmount"},
  walletClient: walletClient,
  publicClient: publicClient
}`,
                    description: `Called in performNormalDeposit() - transfer USDC to source account (ON-CHAIN). Always sends to source account address.`,
                  },
                  {
                    name: "notifyDeposit",
                    params: `{
  requestId: orchestrationData.requestId,
  transactionHash: receipt.transactionHash,
  blockNumber: receipt.blockNumber.toString()
}`,
                    description: "Notify server of deposit transaction",
                  },
                ]
              : [
                  {
                    name: "depositGasless",
                    params: `{
  from: walletClient.account.address,
  to: ${
    sourceChain === destinationChain
      ? "orchestrationData.accountAddressOnDestinationChain"
      : "orchestrationData.accountAddressOnSourceChain"
  },
  token: NETWORKS.${
    sourceChain === "arbitrum" ? "arbitrumSepolia" : "baseSepolia"
  }.contracts.usdcToken,
  amount: ${amount ? `BigInt(parseFloat("${amount}") * 1e6)` : "bridgeAmount"},
  walletClient: walletClient,
  publicClient: publicClient
}`,
                    description: `Called in performGaslessDeposit() - sign EIP-3009 authorization (OFF-CHAIN). ${
                      sourceChain === destinationChain
                        ? "Same-chain: uses destination account"
                        : "Cross-chain: uses source account"
                    }`,
                  },
                ]),
          ],
        };
      default:
        return { title: "No step selected", functions: [] };
    }
  };

  const sdkInfo = getSDKFunctionsForStep();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {/* Minimal Header */}
        <header className="border-b">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Image
                src="/unwallet.svg"
                alt="UnWallet"
                width={24}
                height={24}
              />
              Unwallet
            </div>
            <div className="flex items-center gap-3">
              <ConnectButton showBalance={false} />
              {!showSDKInfo && (
                <button
                  onClick={() => setShowSDKInfo(!showSDKInfo)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors font-mono"
                  title="Toggle SDK Info Panel"
                >
                  <Info className="w-4 h-4" />
                  sdk info
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-24">
          {/* Step Indicator */}
          <div className="flex items-center gap-2 mb-12">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`h-1.5 w-12 rounded-full transition-all ${
                    step >= s + 1 ? "bg-foreground" : "bg-muted"
                  }`}
                />
                {s < 4 && <div className="w-2" />}
              </div>
            ))}
          </div>

          {/* Step 1: Select Strategy */}
          {step === 1 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Select strategy
                </h2>
                <p className="text-muted-foreground">
                  Choose an investment module
                </p>
              </div>
              {moduleSelectionError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">
                    {getUserFriendlyError(moduleSelectionError)}
                  </p>
                </div>
              )}
              <div className="grid gap-3">
                <button
                  onClick={() => handleModuleSelect("AUTOSWAP")}
                  disabled={moduleSelectionLoading}
                  className={`group relative p-6 rounded-lg border text-left transition-all ${
                    module === "AUTOSWAP"
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg border bg-background flex items-center justify-center">
                      <Image
                        src={LOGOS.AAVE}
                        alt="AAVE"
                        width={32}
                        height={32}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">AAVE Lending</h3>
                        {module === "AUTOSWAP" && <Check className="w-4 h-4" />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Supply liquidity to earn yield on AAVE protocol
                      </p>
                    </div>
                  </div>
                </button>
                {/* <button
                  onClick={() => handleModuleSelect("AUTOEARN")}
                  disabled={moduleSelectionLoading}
                  className={`group relative p-6 rounded-lg border text-left transition-all ${
                    module === "AUTOEARN"
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg border bg-background flex items-center justify-center">
                      <Image
                        src={LOGOS.VERIFIABLE_AGENT}
                        alt="Agent"
                        width={32}
                        height={32}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">Verifiable Agent</h3>
                        {module === "AUTOEARN" && <Check className="w-4 h-4" />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        AI-powered strategy with verifiable execution
                      </p>
                    </div>
                  </div>
                </button> */}
                <button
                  onClick={() => handleModuleSelect("BOND")}
                  disabled={moduleSelectionLoading}
                  className={`group relative p-6 rounded-lg border text-left transition-all ${
                    module === "BOND"
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg border bg-background flex items-center justify-center">
                      <Image
                        src={LOGOS.BOND}
                        alt="Bond"
                        width={32}
                        height={32}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">Verifiable Agent</h3>
                        {module === "BOND" && <Check className="w-4 h-4" />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        AI-powered strategy with verifiable execution
                      </p>
                    </div>
                  </div>
                </button>
              </div>
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <button
                        onClick={() => setStep(3)}
                        disabled={
                          !module || moduleSelectionLoading || !isConnected
                        }
                        className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </span>
                  </TooltipTrigger>
                  {!isConnected && (
                    <TooltipContent>
                      <p>Please connect wallet first</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Step 2: Select Destination Chain */}
          {step === 2 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Select destination
                </h2>
                <p className="text-muted-foreground">
                  Choose where to deploy your investment (same-chain and
                  cross-chain supported)
                </p>
                {sourceChain && (
                  <div className="p-3 bg-muted/50 border border-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {sourceChain === destinationChain
                        ? "✓ Same-chain flow selected (no bridge needed)"
                        : "Cross-chain flow selected (bridge required)"}
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <button
                  onClick={() => setDestinationChain("arbitrum")}
                  className={`w-full p-5 rounded-lg border text-left transition-all ${
                    destinationChain === "arbitrum"
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Image
                        src={LOGOS.ARBITRUM}
                        alt="Arbitrum"
                        width={32}
                        height={32}
                      />
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium mb-0.5">
                          Arbitrum
                          {destinationChain === "arbitrum" && (
                            <Check className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Image
                            src={LOGOS.USDC}
                            alt="USDC"
                            width={16}
                            height={16}
                          />
                          15% APY on USDC
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setDestinationChain("base")}
                  className={`w-full p-5 rounded-lg border text-left transition-all ${
                    destinationChain === "base"
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Image
                        src={LOGOS.BASE}
                        alt="Base"
                        width={32}
                        height={32}
                      />
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium mb-0.5">
                          Base
                          {destinationChain === "base" && (
                            <Check className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Image
                            src={LOGOS.USDC}
                            alt="USDC"
                            width={16}
                            height={16}
                          />
                          10% APY on USDC
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="h-10 px-4 text-sm font-medium rounded-md border hover:bg-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!destinationChain}
                  className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Select Source Chain & Amount */}
          {step === 3 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Select source
                </h2>
                <p className="text-muted-foreground">
                  Choose which chain to deploy funds from (can be same as
                  destination)
                </p>
                {destinationChain && (
                  <div className="p-3 bg-muted/50 border border-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {sourceChain === destinationChain
                        ? "✓ Same-chain flow: Supply and earn on the same chain (no bridge)"
                        : `Cross-chain flow: Bridge from ${sourceChain} to ${destinationChain}`}
                    </p>
                  </div>
                )}
              </div>
              {!isConnected && (
                <div className="p-3 bg-muted/50 border border-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Please connect your wallet to view balances and continue
                  </p>
                </div>
              )}
              {balanceError && isConnected && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">
                    {getUserFriendlyError(balanceError)}
                  </p>
                </div>
              )}
              {switchingChain && (
                <div className="p-3 bg-muted/50 border border-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      Switching wallet chain...
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <button
                  onClick={() => handleSourceChainSelect("arbitrum")}
                  disabled={switchingChain}
                  className={`w-full p-5 rounded-lg border text-left transition-all ${
                    sourceChain === "arbitrum"
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Image
                        src={LOGOS.ARBITRUM}
                        alt="Arbitrum"
                        width={32}
                        height={32}
                      />
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium mb-0.5">
                          Arbitrum
                          {sourceChain === "arbitrum" && (
                            <Check className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Image
                            src={LOGOS.USDC}
                            alt="USDC"
                            width={16}
                            height={16}
                          />
                          USDC
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {!balanceLoading &&
                      (arbitrumBalance === null ||
                        parseFloat(arbitrumBalance || "0") === 0) ? (
                        <a
                          href="https://faucet.circle.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md border hover:bg-accent transition-colors"
                        >
                          Get USDC
                          <ArrowRight className="w-3 h-3" />
                        </a>
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Balance
                          </div>
                          <div className="text-sm font-medium">
                            {formatBalance(arbitrumBalance)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => handleSourceChainSelect("base")}
                  disabled={switchingChain}
                  className={`w-full p-5 rounded-lg border text-left transition-all ${
                    sourceChain === "base"
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Image
                        src={LOGOS.BASE}
                        alt="Base"
                        width={32}
                        height={32}
                      />
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium mb-0.5">
                          Base
                          {sourceChain === "base" && (
                            <Check className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Image
                            src={LOGOS.USDC}
                            alt="USDC"
                            width={16}
                            height={16}
                          />
                          USDC
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {!balanceLoading &&
                      (baseBalance === null ||
                        parseFloat(baseBalance || "0") === 0) ? (
                        <a
                          href="https://faucet.circle.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md border hover:bg-accent transition-colors"
                        >
                          Get USDC
                          <ArrowRight className="w-3 h-3" />
                        </a>
                      ) : (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Balance
                          </div>
                          <div className="text-sm font-medium">
                            {formatBalance(baseBalance)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </div>
              {sourceChain && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                      <Image
                        src={LOGOS.USDC}
                        alt="USDC"
                        width={16}
                        height={16}
                      />
                    </div>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      max={getMaxAmount()}
                      min="0"
                      step="0.01"
                      disabled={balanceLoading}
                      className="w-full h-10 pl-10 pr-16 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    />
                    <button
                      onClick={() =>
                        setAmount(
                          sourceChain === "arbitrum"
                            ? arbitrumBalance || "0"
                            : baseBalance || "0"
                        )
                      }
                      disabled={balanceLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 px-2 text-xs font-medium rounded border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      MAX
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="h-10 px-4 text-sm font-medium rounded-md border hover:bg-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={
                    !sourceChain ||
                    !amount ||
                    parseFloat(amount) <= 0 ||
                    balanceLoading ||
                    !isConnected
                  }
                  className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Review
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Confirm investment
                </h2>
                <p className="text-muted-foreground">
                  Review transaction details
                </p>
              </div>
              <div className="rounded-lg border divide-y">
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Strategy
                  </span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={
                        module === "AUTOSWAP"
                          ? LOGOS.AAVE
                          : module === "BOND"
                          ? LOGOS.BOND
                          : LOGOS.VERIFIABLE_AGENT
                      }
                      alt="Strategy"
                      width={20}
                      height={20}
                    />
                    <span className="text-sm font-medium">
                      {module === "AUTOSWAP"
                        ? "AAVE Lending"
                        : module === "BOND"
                        ? "Verifiable Agent"
                        : "Verifiable Agent"}
                    </span>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Source Chain
                  </span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={
                        sourceChain === "arbitrum" ? LOGOS.ARBITRUM : LOGOS.BASE
                      }
                      alt="Source"
                      width={20}
                      height={20}
                    />
                    <span className="text-sm font-medium capitalize">
                      {sourceChain}
                    </span>
                  </div>
                </div>

                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Destination Chain
                  </span>
                  <div className="flex items-center gap-2">
                    <Image
                      src={
                        destinationChain === "arbitrum"
                          ? LOGOS.ARBITRUM
                          : LOGOS.BASE
                      }
                      alt="Destination"
                      width={20}
                      height={20}
                    />
                    <span className="text-sm font-medium capitalize">
                      {destinationChain}
                    </span>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <div className="flex items-center gap-2">
                    <Image src={LOGOS.USDC} alt="USDC" width={20} height={20} />
                    <span className="text-sm font-medium">{amount} USDC</span>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">APY</span>
                  <span className="text-sm font-medium">
                    {destinationChain === "arbitrum" ? "15%" : "10%"}
                  </span>
                </div>
              </div>
              <div className="p-4 rounded-lg border bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Abstraction layer powered by Unwallet.
                </p>
              </div>
              {(orchestrationError || depositError) && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">
                    {getUserFriendlyError(
                      orchestrationError || depositError || ""
                    )}
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  disabled={orchestrationLoading || depositLoading}
                  className="h-10 px-4 text-sm font-medium rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                {!isConnected ? (
                  <div className="flex-1">
                    <ConnectButton
                      accountStatus="address"
                      chainStatus="name"
                      showBalance={false}
                    />
                  </div>
                ) : (
                  <button
                    onClick={handleExecute}
                    disabled={
                      orchestrationLoading ||
                      depositLoading ||
                      !walletClient ||
                      !currentState
                    }
                    className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {orchestrationLoading || depositLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Sign & Execute
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Processing Dialog */}
          <Dialog
            open={processingDialogOpen}
            onOpenChange={setProcessingDialogOpen}
          >
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Processing Investment</DialogTitle>
                <DialogDescription>
                  Your transaction is being processed. Please wait...
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Status Display */}
                {orchestrationStatus && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Status:</span>
                      <span
                        className={`text-sm font-semibold ${
                          orchestrationStatus.status === "COMPLETED"
                            ? "text-green-600 dark:text-green-400"
                            : orchestrationStatus.status === "PENDING"
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {orchestrationStatus.status}
                      </span>
                    </div>
                    {orchestrationStatus.requestId && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Request ID:
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {orchestrationStatus.requestId.slice(0, 10)}...
                          {orchestrationStatus.requestId.slice(-8)}
                        </span>
                      </div>
                    )}
                    {orchestrationStatus.updated_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Updated:
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(
                            orchestrationStatus.updated_at
                          ).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* SDK Functions Being Called - Accordion */}

                {/* Loading Indicator */}
                {(!orchestrationStatus ||
                  orchestrationStatus.status === "PENDING") && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}

                {/* Success Message with Account Address */}
                {orchestrationStatus?.status === "COMPLETED" &&
                  destinationAccountAddress &&
                  destinationChain && (
                    <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
                      <div className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium">
                          Investment Completed Successfully!
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm text-muted-foreground">
                            Account Created:
                          </span>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs font-mono break-all">
                              {destinationAccountAddress}
                            </span>
                          </div>
                        </div>
                        {(() => {
                          const destNetwork =
                            getNetworkByName(destinationChain);
                          const explorerName =
                            destinationChain === "arbitrum"
                              ? "Arbiscan"
                              : "Basescan";
                          return (
                            <a
                              href={`${destNetwork.explorerUrl}/address/${destinationAccountAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                              View on {explorerName}
                              <ArrowRight className="h-4 w-4" />
                            </a>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                {orchestrationData && (
                  <div className="border-t pt-4">
                    <button
                      onClick={() =>
                        setShowSDKFunctionsInDialog(!showSDKFunctionsInDialog)
                      }
                      className="w-full flex items-center justify-between text-sm font-medium hover:text-foreground transition-colors"
                    >
                      <span>SDK Functions in Progress</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          showSDKFunctionsInDialog ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {showSDKFunctionsInDialog && (
                      <div className="space-y-2 mt-2">
                        {/* Show different functions based on module */}
                        {isBondModule ? (
                          <>
                            {/* deposit */}
                            <div className="border rounded p-2 bg-muted/30">
                              <code className="text-xs font-mono text-primary">
                                deposit
                              </code>
                              <pre className="text-[10px] bg-background p-1.5 rounded overflow-x-auto border mt-1.5 mb-1 max-w-full break-all whitespace-pre-wrap">
                                {`{ recipient, token, amount, walletClient, publicClient }`}
                              </pre>
                              <p className="text-[10px] text-muted-foreground">
                                Transfer USDC to source account (ON-CHAIN)
                              </p>
                            </div>

                            {/* notifyDeposit */}
                            <div className="border rounded p-2 bg-muted/30">
                              <code className="text-xs font-mono text-primary">
                                notifyDeposit
                              </code>
                              <pre className="text-[10px] bg-background p-1.5 rounded overflow-x-auto border mt-1.5 mb-1 max-w-full break-all whitespace-pre-wrap">
                                {`{ requestId, transactionHash, blockNumber }`}
                              </pre>
                              <p className="text-[10px] text-muted-foreground">
                                Notify server of deposit transaction
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* notifyDepositGasless */}
                            <div className="border rounded p-2 bg-muted/30">
                              <code className="text-xs font-mono text-primary">
                                notifyDepositGasless
                              </code>
                              <pre className="text-[10px] bg-background p-1.5 rounded overflow-x-auto border mt-1.5 mb-1 max-w-full break-all whitespace-pre-wrap">
                                {`{ requestId, transactionHash: "0x", blockNumber: "0", signedAuthorization }`}
                              </pre>
                              <p className="text-[10px] text-muted-foreground">
                                Notify server with signed authorization
                                {isSameChain &&
                                  " (Same-chain: no bridge needed)"}
                              </p>
                            </div>
                          </>
                        )}

                        {/* pollOrchestrationStatus */}
                        <div className="border rounded p-2 bg-muted/30">
                          <code className="text-xs font-mono text-primary">
                            pollOrchestrationStatus
                          </code>
                          <pre className="text-[10px] bg-background p-1.5 rounded overflow-x-auto border mt-1.5 mb-1 max-w-full break-all whitespace-pre-wrap">
                            {`{ requestId, interval: 5000, maxAttempts: 60, onStatusUpdate, onComplete, onError }`}
                          </pre>
                          <p className="text-[10px] text-muted-foreground">
                            Monitor orchestration status
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {orchestrationStatus?.error_message && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">
                      {orchestrationStatus.error_message}
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* SDK Info Panel */}
      {showSDKInfo && (
        <div className="w-96 border-l bg-muted/30 h-screen flex flex-col">
          <div className="sticky top-0 bg-background border-b p-4 py-5 flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-sm"> SDK Functions</h3>
            <button
              onClick={() => setShowSDKInfo(false)}
              className="p-1 hover:bg-accent rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div>
              <h4 className="text-sm font-medium mb-2">{sdkInfo.title}</h4>
              {sdkInfo.note && (
                <p className="text-xs text-muted-foreground mb-3">
                  {sdkInfo.note}
                </p>
              )}
            </div>
            {sdkInfo.functions.length > 0 && (
              <div className="space-y-4">
                {sdkInfo.functions.map(
                  (
                    func: { name: string; params: string; description: string },
                    idx: number
                  ) => (
                    <div
                      key={idx}
                      className="border rounded-lg p-3 bg-background"
                    >
                      <div className="mb-2">
                        <code className="text-xs font-mono text-primary">
                          {func.name}
                        </code>
                      </div>
                      <div className="mb-2">
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {func.params}
                        </pre>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {func.description}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}
            {sdkInfo.functions.length === 0 && !sdkInfo.note && (
              <p className="text-xs text-muted-foreground">
                No SDK functions called in this step
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
