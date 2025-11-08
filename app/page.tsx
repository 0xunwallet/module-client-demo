"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import type { ModuleName } from "unwallet";
import { useWalletClient, usePublicClient, useAccount } from "wagmi";
import { useModuleSelection } from "@/hooks/useModuleSelection";
import { useOrchestrationCreation } from "@/hooks/useOrchestrationCreation";
import { useGaslessDeposit } from "@/hooks/useGaslessDeposit";
import { useUSDCBalance } from "@/hooks/useUSDCBalance";
import { getUserFriendlyError } from "@/lib/error-utils";
import { Check, ArrowRight, Loader2 } from "lucide-react";
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
  AAVE: "/aave.svg",
  USDC: "/usdc.png",
  ARBITRUM: "/arbitrum.png",
  BASE: "/base-chain.svg",
};

export default function InvestmentFlow() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { isConnected } = useAccount();
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

  // Orchestration Creation Hook
  const {
    loading: orchestrationLoading,
    error: orchestrationError,
    orchestrationData,
    createOrchestration,
  } = useOrchestrationCreation({
    currentState,
    ownerAddress: walletClient?.account?.address || "",
  });

  // Gasless Deposit Hook
  const {
    loading: depositLoading,
    error: depositError,
    deposit: performGaslessDeposit,
  } = useGaslessDeposit({
    orchestrationData,
    currentState,
    walletClient: walletClient ?? undefined,
    publicClient: publicClient ?? null,
  });

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
      await selectModule(moduleName);
      // Move to next step after successful selection
      setStep(2);
    } catch (error) {
      // Error is handled by the hook
      console.error("Error selecting module:", error);
    }
  };

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

      // Perform gasless deposit with the orchestration data directly
      await performGaslessDeposit(orchestration, {
        onStatusUpdate: (status) => {
          setOrchestrationStatus(status);
        },
        onComplete: (status) => {
          setOrchestrationStatus(status);
        },
      });
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

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Image src="/unwallet.svg" alt="UnWallet" width={24} height={24} />
            Unwallet
          </div>
          <ConnectButton />
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
                    <Image src={LOGOS.AAVE} alt="AAVE" width={32} height={32} />
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
              <button
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
                Choose where to deploy your investment
              </p>
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
                        5% APY on USDC
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
                    <Image src={LOGOS.BASE} alt="Base" width={32} height={32} />
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
                        4% APY on USDC
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
                Choose which chain to deploy funds from
              </p>
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
            <div className="space-y-3">
              <button
                onClick={() => setSourceChain("arbitrum")}
                className={`w-full p-5 rounded-lg border text-left transition-all ${
                  sourceChain === "arbitrum"
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
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className="text-sm font-medium">
                      {formatBalance(arbitrumBalance)}
                    </div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setSourceChain("base")}
                className={`w-full p-5 rounded-lg border text-left transition-all ${
                  sourceChain === "base"
                    ? "border-foreground bg-accent"
                    : "border-border hover:border-foreground/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Image src={LOGOS.BASE} alt="Base" width={32} height={32} />
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
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className="text-sm font-medium">
                      {formatBalance(baseBalance)}
                    </div>
                  </div>
                </div>
              </button>
            </div>
            {sourceChain && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center">
                    <Image src={LOGOS.USDC} alt="USDC" width={16} height={16} />
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
                <span className="text-sm text-muted-foreground">Strategy</span>
                <div className="flex items-center gap-2">
                  <Image
                    src={
                      module === "AUTOSWAP"
                        ? LOGOS.AAVE
                        : LOGOS.VERIFIABLE_AGENT
                    }
                    alt="Strategy"
                    width={20}
                    height={20}
                  />
                  <span className="text-sm font-medium">
                    {module === "AUTOSWAP"
                      ? "AAVE Lending"
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
                  {destinationChain === "arbitrum" ? "5%" : "4%"}
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
                  <ConnectButton />
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

              {/* Loading Indicator */}
              {(!orchestrationStatus ||
                orchestrationStatus.status === "PENDING") && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {/* Success Message with Account Address */}
              {orchestrationStatus?.status === "COMPLETED" &&
                destinationAccountAddress && (
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
                      <a
                        href={`https://sepolia.arbiscan.io/address/${destinationAccountAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        View on Arbiscan
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
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
  );
}
