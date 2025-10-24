"use client";
import { AuthWrapper } from "@/components/AuthWrapper";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useState } from "react";
import { getRequiredState, createOrchestrationData } from "unwallet";
import type {
  ModuleName,
  RequiredStateData,
  CurrentState,
  RequiredState,
} from "unwallet";
import { BASE_CHAIN } from "@/lib/chain-constants";
import { Input } from "@/components/ui/input";
import { useWalletClient } from "wagmi";

export default function Home() {
  const { data: walletClient } = useWalletClient();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;
  const [selectedModule, setSelectedModule] = useState<ModuleName | null>(null);
  const [requiredState, setRequiredState] = useState<RequiredStateData | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [arbitrumAmount, setArbitrumAmount] = useState<string>("");
  const [baseAmount, setBaseAmount] = useState<string>("");
  const [selectedInvestment, setSelectedInvestment] = useState<string>("");
  const [requiredStateData, setRequiredStateData] = useState<{
    module_address: string;
    chain_id: string;
    abi_encode: {
      chainId: string;
      tokenAddress: string;
      vaultAddress: string;
    };
  } | null>(null);
  const [currentState, setCurrentState] = useState<{
    chainId: string;
    tokenAddress: string;
    amount: string;
  } | null>(null);
  const [orchestrationData, setOrchestrationData] = useState<{
    destinationTokenAddress: string;
    requestId: string;
    sourceChainOwner: string;
    destinationChainOwner: string;
  } | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleModuleSelect = async (moduleName: ModuleName) => {
    setSelectedModule(moduleName);
    setLoading(true);
    try {
      const result = await getRequiredState({
        moduleName,
        sourceChainId: BASE_CHAIN.id,
      });
      setRequiredState(result);
      setCurrentStep(3); // Move to step 3 after getting required state
    } catch (error) {
      console.error("Error getting required state:", error);
    } finally {
      setLoading(false);
    }
  };

  const prepareRequiredStateData = () => {
    if (!requiredState) return null;

    // Required State Data reflects the investment option selected in Step 3
    const isArbitrumInvestment = selectedInvestment === "arbitrum";
    const investmentChainId = isArbitrumInvestment ? "421614" : "84532"; // Arbitrum Sepolia or Base Sepolia
    const investmentTokenAddress = isArbitrumInvestment
      ? "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" // Arbitrum USDC
      : "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base USDC

    const requiredStateData = {
      module_address:
        requiredState.moduleAddress ||
        "0x0000000000000000000000000000000000000000", // From getRequiredState
      chain_id: investmentChainId, // Chain where the investment will be
      abi_encode: {
        chainId: investmentChainId,
        tokenAddress: investmentTokenAddress,
        vaultAddress: "0x0000000000000000000000000000000000000000", // If exists
      },
    };

    setRequiredStateData(requiredStateData);
    console.log("Required State Data:", requiredStateData);
    return requiredStateData;
  };

  const prepareCurrentState = () => {
    // Use the first available amount (arbitrum takes priority if both are filled)
    const hasArbitrumAmount = arbitrumAmount && parseFloat(arbitrumAmount) > 0;
    const hasBaseAmount = baseAmount && parseFloat(baseAmount) > 0;

    // Current State represents which chain you're depositing FROM
    const isDepositingFromArbitrum = hasArbitrumAmount;
    const depositChainId = isDepositingFromArbitrum ? "421614" : "84532"; // Arbitrum Sepolia or Base Sepolia

    const currentStateData = {
      chainId: depositChainId,
      tokenAddress: hasArbitrumAmount
        ? "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
        : "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount: hasArbitrumAmount ? arbitrumAmount : baseAmount,
    };

    setCurrentState(currentStateData);
    console.log("Current State:", currentStateData);
    return currentStateData;
  };

  const handleSignTransaction = async () => {
    if (!walletClient || !requiredStateData || !currentState) {
      console.error("Missing required data for signing");
      return;
    }

    try {
      // Prepare the message to sign
      const messageToSign = {
        requiredStateData,
        currentState,
        userAddress: walletClient.account.address,
        apiKey: "API_KEY_RANDOM",
      };

      // Create a message string for signing
      const messageString = JSON.stringify(messageToSign, null, 2);

      console.log("Signing message:", messageString);

      // Sign the message using walletClient
      const signature = await walletClient.signMessage({
        message: messageString,
      });

      console.log("Signature:", signature);
      console.log("Signed data:", {
        message: messageString,
        signature,
        userAddress: walletClient.account.address,
      });

      // Create orchestration data after signing
      await createOrchestrationDataAfterSigning();

      // Move to next step after successful signing
      nextStep();
    } catch (error) {
      console.error("Error signing transaction:", error);
    }
  };

  const createOrchestrationDataAfterSigning = async () => {
    if (!currentState || !walletClient) return;

    try {
      // Prepare current state for createOrchestrationData
      const currentStateForOrchestration: CurrentState = {
        chainId: parseInt(currentState.chainId) as 84532 | 421614, // Convert string to number and cast to valid chain ID
        tokenAddress: currentState.tokenAddress as `0x${string}`,
        tokenAmount: (parseFloat(currentState.amount) * 1e6).toString(), // Convert to string
        ownerAddress: walletClient.account.address,
      };

      // Prepare required state for createOrchestrationData
      // Use the investment chain ID from requiredStateData (where investment will be)
      const isArbitrumInvestment = selectedInvestment === "arbitrum";
      const investmentChainId = isArbitrumInvestment ? "421614" : "84532"; // Arbitrum Sepolia or Base Sepolia

      const requiredStateForOrchestration: RequiredState = {
        chainId: investmentChainId,
        moduleName: selectedModule || "AUTOSWAP",
        configInputType: "investment",
        requiredFields: [],
        configTemplate: {},
      };

      // Create orchestration data
      const orchestrationData = await createOrchestrationData(
        currentStateForOrchestration,
        requiredStateForOrchestration,
        walletClient.account.address,
        "API_KEY_RANDOM"
      );

      setOrchestrationData(orchestrationData);
      console.log("Orchestration Data:", orchestrationData);
    } catch (error) {
      console.error("Error creating orchestration data:", error);
    }
  };

  const handleTransferFunds = async () => {
    if (!walletClient || !orchestrationData || !currentState) {
      console.error("Missing required data for transfer");
      return;
    }

    setTransferLoading(true);
    try {
      // Get the destination token address from orchestration data
      const destinationTokenAddress = orchestrationData.destinationTokenAddress;
      const amount = BigInt(parseFloat(currentState.amount) * 1e6); // Convert to wei

      console.log("Transferring to:", destinationTokenAddress);
      console.log("Amount:", currentState.amount, "USDC");

      // ERC20 Transfer function signature
      const transferFunctionSignature = "0xa9059cbb";

      // Encode the transfer parameters (to, amount)
      const toAddress = destinationTokenAddress.slice(2).padStart(64, "0");
      const amountHex = amount.toString(16).padStart(64, "0");
      const data = transferFunctionSignature + toAddress + amountHex;

      // Send the transaction
      const hash = await walletClient.sendTransaction({
        to: currentState.tokenAddress as `0x${string}`,
        data: data as `0x${string}`,
        value: BigInt(0),
      });

      console.log("Transfer transaction hash:", hash);
      console.log("Transfer completed successfully!");

      // Move to next step or show success
      nextStep();
    } catch (error) {
      console.error("Error transferring funds:", error);
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <AuthWrapper>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex w-full justify-between items-center mb-8">
            <ThemeToggle />
            <ConnectButton />
          </div>

          {/* Progress Indicator */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="flex items-center justify-between">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map(
                (step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        step <= currentStep
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {step}
                    </div>
                    {step < totalSteps && (
                      <div
                        className={`w-16 h-1 mx-2 ${
                          step < currentStep ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    )}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Step 1: Login Screen */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 1: Login</CardTitle>
                  <CardDescription>
                    Connect your wallet to get started
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <p className="text-muted-foreground mb-4">
                      Please connect your wallet to continue
                    </p>
                    <Button onClick={nextStep} className="w-full">
                      Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Investment Module Selection */}
            {currentStep === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 2: Investment Module Selection</CardTitle>
                  <CardDescription>
                    Choose your investment strategy
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handleModuleSelect("AUTOEARN")}
                    disabled={loading}
                  >
                    Invest in Verifiable Agent
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handleModuleSelect("AUTOSWAP")}
                    disabled={loading}
                  >
                    Invest in AAVE
                  </Button>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      className="flex-1"
                    >
                      Back
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Loading State */}
            {loading && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground">
                      Loading available options...
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Available Investment Options */}
            {currentStep === 3 && requiredState && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 3: Available Investment Options</CardTitle>
                  <CardDescription>
                    Select from available investment opportunities for{" "}
                    {selectedModule}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Required State: chainId, tokenAddress, Vault
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Module: {requiredState.moduleName} | Chain:{" "}
                      {requiredState.chainId}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="investment"
                        value="arbitrum"
                        checked={selectedInvestment === "arbitrum"}
                        onChange={(e) => setSelectedInvestment(e.target.value)}
                      />
                      <span>5% on Arbitrum USDC</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="investment"
                        value="base"
                        checked={selectedInvestment === "base"}
                        onChange={(e) => setSelectedInvestment(e.target.value)}
                      />
                      <span>4% on Base USDC</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => {
                        prepareRequiredStateData();
                        nextStep();
                      }}
                      className="flex-1"
                      disabled={!selectedInvestment}
                    >
                      Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Tokens Available in Wallet */}
            {currentStep === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 4: Tokens Available in Your Wallet</CardTitle>
                  <CardDescription>
                    Select tokens and amounts to invest
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      Current State: chainId, tokenAddress, Amount
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">USDC on Arbitrum</p>
                          <p className="text-sm text-muted-foreground">
                            Available: 5 USDC
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Token: 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Amount to invest (USDC):
                        </label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={arbitrumAmount}
                          onChange={(e) => setArbitrumAmount(e.target.value)}
                          max="5"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">USDC on Base</p>
                          <p className="text-sm text-muted-foreground">
                            Available: 10 USDC
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Token: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Amount to invest (USDC):
                        </label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={baseAmount}
                          onChange={(e) => setBaseAmount(e.target.value)}
                          max="10"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => {
                        prepareCurrentState();
                        nextStep();
                      }}
                      className="flex-1"
                      disabled={
                        !selectedInvestment || (!arbitrumAmount && !baseAmount)
                      }
                    >
                      Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: Sign Transaction Popup */}
            {currentStep === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 5: Sign Transaction</CardTitle>
                  <CardDescription>Approve the transaction</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      You Sign Data: RequiredState, CurrentState, Address,
                      API_KEY
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Send this data to TEE Using createOrchestrationData
                    </p>
                  </div>

                  {/* Display the data that will be signed */}
                  <div className="space-y-3">
                    <div className="p-3 border rounded">
                      <p className="text-sm font-medium mb-2">
                        Required State Data:
                      </p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                        {JSON.stringify(requiredStateData, null, 2)}
                      </pre>
                    </div>

                    <div className="p-3 border rounded">
                      <p className="text-sm font-medium mb-2">Current State:</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                        {JSON.stringify(currentState, null, 2)}
                      </pre>
                    </div>

                    <div className="p-3 border rounded">
                      <p className="text-sm font-medium mb-2">User Address:</p>
                      <p className="text-xs text-muted-foreground">
                        {walletClient?.account?.address || "[Not Connected]"}
                      </p>
                    </div>

                    <div className="p-3 border rounded">
                      <p className="text-sm font-medium mb-2">API Key:</p>
                      <p className="text-xs text-muted-foreground">
                        API_KEY_RANDOM
                      </p>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    variant="default"
                    onClick={handleSignTransaction}
                    disabled={
                      !walletClient || !requiredStateData || !currentState
                    }
                  >
                    Sign Transaction
                  </Button>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      className="flex-1"
                    >
                      Back
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 6: Fund Transfer and Notification */}
            {currentStep === 6 && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 6: Fund Transfer and Notification</CardTitle>
                  <CardDescription>
                    Complete the investment process
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      USDC → od.depositAdd
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Sign message to deposit Funds using Transfer
                    </p>
                    <p className="text-sm text-muted-foreground">
                      After TX is done notify TEE using notif(od.requestId)
                    </p>
                  </div>

                  {/* Display orchestration data */}
                  {orchestrationData && (
                    <div className="p-3 border rounded">
                      <p className="text-sm font-medium mb-2">
                        Orchestration Data:
                      </p>
                      <div className="space-y-2 text-xs">
                        <p>
                          <strong>Destination Token Address:</strong>{" "}
                          {orchestrationData.destinationTokenAddress}
                        </p>
                        <p>
                          <strong>Request ID:</strong>{" "}
                          {orchestrationData.requestId}
                        </p>
                        <p>
                          <strong>Source Chain Owner:</strong>{" "}
                          {orchestrationData.sourceChainOwner}
                        </p>
                        <p>
                          <strong>Destination Chain Owner:</strong>{" "}
                          {orchestrationData.destinationChainOwner}
                        </p>
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    variant="default"
                    onClick={handleTransferFunds}
                    disabled={!orchestrationData || transferLoading}
                  >
                    {transferLoading ? "Transferring..." : "Transfer Funds"}
                  </Button>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => setCurrentStep(1)}
                      className="flex-1"
                    >
                      Start Over
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AuthWrapper>
  );
}
