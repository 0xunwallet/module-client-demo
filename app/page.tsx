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
import {
  getRequiredState,
  createOrchestrationData,
  notifyDepositGasless,
  pollOrchestrationStatus,
  depositGasless,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
  TransferType,
} from "unwallet";
import type {
  ModuleName,
  RequiredStateData,
  CurrentState,
  OrchestrationData,
  GaslessDepositResult,
} from "unwallet";
import { Input } from "@/components/ui/input";
import { useWalletClient, usePublicClient } from "wagmi";

export default function Home() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
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
  const [orchestrationData, setOrchestrationData] =
    useState<OrchestrationData | null>(null);
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
      // Match test script: getRequiredState is called with arbitrumSepolia.id (destination chain)
      // This is where the module will execute, not where funds come from
      const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
      const result = await getRequiredState({
        moduleName,
        sourceChainId: ARBITRUM_SEPOLIA_CHAIN_ID, // Match test: arbitrumSepolia.id
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

    // Aave pool address (vault address) - same for both chains in this case
    const aavePoolAddress = "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff"; // Aave pool on Arbitrum Sepolia

    const requiredStateData = {
      module_address:
        requiredState.moduleAddress ||
        "0x0000000000000000000000000000000000000000", // From getRequiredState
      chain_id: investmentChainId, // Chain where the investment will be
      abi_encode: {
        chainId: investmentChainId,
        tokenAddress: investmentTokenAddress,
        vaultAddress: aavePoolAddress, // Aave pool address (vault address)
      },
    };

    setRequiredStateData(requiredStateData);
    console.log("Required State Data:", requiredStateData);
    return requiredStateData;
  };

  const prepareCurrentState = () => {
    // Use the first available amount (arbitrum takes priority if both are filled)
    const hasArbitrumAmount = arbitrumAmount && parseFloat(arbitrumAmount) > 0;

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
      // EXACT MATCH TO TEST FILE - Network configurations
      const NETWORKS = {
        baseSepolia: {
          contracts: {
            usdcToken:
              "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
          },
        },
        arbitrumSepolia: {
          contracts: {
            usdcToken:
              "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" as `0x${string}`,
            aavePool:
              "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff" as `0x${string}`,
          },
        },
      };

      // EXACT MATCH TO TEST FILE - Test configuration
      const TEST_CONFIG = {
        bridgeAmount: parseFloat(currentState.amount) * 1e6, // parseUnits equivalent
        apiUrl:
          process.env.NEXT_PUBLIC_SERVER_URL ||
          process.env.NEXT_PUBLIC_TEST_SERVER_URL ||
          "https://tee.wall8.xyz",
        apiKey:
          process.env.NEXT_PUBLIC_API_KEY || "test-gasless-deposit-eip3009", // Match test file
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

      // EXACT MATCH TO TEST FILE - Encode AutoEarn module data using SDK helper functions
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
        ownerAddress: walletClient.account.address,
      };

      console.log("📝 User Intent:");
      console.log(
        `   Current: ${(TEST_CONFIG.bridgeAmount / 1e6).toFixed(
          6
        )} USDC on Base`
      );
      console.log(`   Target: Invest in Aave on Arbitrum`);
      console.log(`   User: ${walletClient.account.address}`);

      // EXACT MATCH TO TEST FILE - Create orchestration data
      const orchestrationData = await createOrchestrationData(
        currentStateForOrchestration, // currentState
        requiredState, // requiredState
        walletClient.account.address, // userAccount.address
        TEST_CONFIG.apiKey, // TEST_CONFIG.apiKey
        encodedData as `0x${string}` // encodedData as Hex
      );

      setOrchestrationData(orchestrationData);
      console.log("\n✅ Orchestration Created Successfully!");
      console.log("--------------------------------------");
      console.log(`📌 Request ID: ${orchestrationData.requestId}`);
      console.log(`📍 Source Chain: ${orchestrationData.sourceChainId}`);
      console.log(
        `📍 Destination Chain: ${orchestrationData.destinationChainId}`
      );
      console.log(
        `💼 Source Account: ${orchestrationData.accountAddressOnSourceChain}`
      );
      console.log(
        `💼 Destination Account: ${orchestrationData.accountAddressOnDestinationChain}`
      );
      console.log(
        `🔧 Source Modules: ${orchestrationData.sourceChainAccountModules.join(
          ", "
        )}`
      );
      console.log(
        `🔧 Destination Modules: ${orchestrationData.destinationChainAccountModules.join(
          ", "
        )}`
      );
    } catch (error) {
      console.error("Error creating orchestration data:", error);
    }
  };

  const handleTransferFunds = async () => {
    if (!walletClient || !orchestrationData || !currentState || !publicClient) {
      console.error("Missing required data for transfer");
      return;
    }

    setTransferLoading(true);
    try {
      // EXACT MATCH TO TEST FILE - Network configurations
      const NETWORKS = {
        baseSepolia: {
          contracts: {
            usdcToken:
              "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
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
        `Smart Account: ${orchestrationData.accountAddressOnSourceChain}`
      );
      console.log("\nSigning EIP-3009 authorization (GASLESS!)...");
      console.log(
        `   From: ${walletClient.account.address} (main wallet with USDC)`
      );
      console.log(
        `   To: ${orchestrationData.accountAddressOnSourceChain} (smart account)`
      );
      console.log(`   ⚠️  Signing is OFF-CHAIN - NO GAS NEEDED!`);

      // EXACT MATCH TO TEST FILE - Use SDK depositGasless function
      const gaslessResult: GaslessDepositResult = await depositGasless(
        walletClient.account.address, // from - main wallet that owns USDC
        orchestrationData.accountAddressOnSourceChain, // to - smart account address
        NETWORKS.baseSepolia.contracts.usdcToken, // token address
        TEST_CONFIG.bridgeAmount, // amount
        walletClient, // wallet client (signs authorization, NO ETH needed for signing!)
        publicClient // public client
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
      console.log(
        `   Authorization To: ${gaslessResult.signedAuthorization.to}`
      );
      console.log(
        `   Authorization Value: ${(
          Number(gaslessResult.signedAuthorization.value) / 1e6
        ).toFixed(6)} USDC`
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
      console.log(`   Request ID: ${orchestrationData.requestId}`);
      console.log(
        `   ⚠️  Note: No transaction hash needed - signing was off-chain!`
      );

      // EXACT MATCH TO TEST FILE - Use SDK notifyDepositGasless function
      await notifyDepositGasless(
        orchestrationData.requestId,
        "0x" as `0x${string}`, // No transaction hash - signing was off-chain
        "0", // No block number - signing was off-chain
        gaslessResult.signedAuthorization
      );

      console.log("✅ Server notified successfully!");
      console.log(
        "   Server will execute transferWithAuthorization in Multicall3 batch"
      );

      // EXACT MATCH TO TEST FILE - MONITOR ORCHESTRATION STATUS
      console.log("\n===== 5. MONITOR ORCHESTRATION STATUS (using SDK) =====");
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

      try {
        await pollOrchestrationStatus({
          requestId: orchestrationData.requestId,
          interval: 5000, // 5 seconds (match test)
          maxAttempts: 60, // 5 minutes (match test)
          onStatusUpdate: (status) => {
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
          },
          onComplete: (status) => {
            console.log("\n🎉 Orchestration completed successfully!");
            console.log(`   Final Status: ${status.status}`);
          },
          onError: (error) => {
            console.log(`\n❌ Orchestration error: ${error.message}`);
          },
        });
      } catch (error) {
        console.log(`\n⚠️  Status polling completed or timed out`);
        if (error instanceof Error) {
          console.log(`   ${error.message}`);
        }
      }

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
                          <strong>Request ID:</strong>{" "}
                          {orchestrationData.requestId}
                        </p>
                        <p>
                          <strong>Source Chain Account:</strong>{" "}
                          {orchestrationData.accountAddressOnSourceChain}
                        </p>
                        <p>
                          <strong>Destination Chain Account:</strong>{" "}
                          {orchestrationData.accountAddressOnDestinationChain}
                        </p>
                        <p>
                          <strong>Source Chain:</strong>{" "}
                          {orchestrationData.sourceChainId}
                        </p>
                        <p>
                          <strong>Destination Chain:</strong>{" "}
                          {orchestrationData.destinationChainId}
                        </p>
                        <p>
                          <strong>Destination Token Address:</strong>{" "}
                          {orchestrationData.destinationTokenAddress}
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
