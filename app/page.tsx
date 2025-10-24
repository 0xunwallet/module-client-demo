"use client";
import { AuthWrapper } from "@/components/AuthWrapper";
import { BASE_CHAIN } from "@/lib/chain-constants";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getRequiredState, getRequiredAvailableModules } from "unwallet";
import type { ModuleName, RequiredStateData, ConfigField } from "unwallet";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Home() {
  const chainId = BASE_CHAIN.id;
  const [selectedModule, setSelectedModule] = useState<ModuleName | null>(null);
  const [requiredState, setRequiredState] = useState<RequiredStateData | null>(
    null
  );
  const [formData, setFormData] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(false);

  // Derive available modules from ModuleName type
  const availableModules = getRequiredAvailableModules();

  const handleModuleSelect = async (moduleName: ModuleName) => {
    setSelectedModule(moduleName);
    setLoading(true);
    try {
      const result = await getRequiredState({
        moduleName,
        sourceChainId: chainId,
      });
      setRequiredState(result);

      // Initialize form data with configTemplate values
      const initialFormData: Record<string, string | number> = {};
      result.requiredFields.forEach((field) => {
        const templateValue = result.configTemplate[field.name];
        initialFormData[field.name] =
          templateValue !== null
            ? templateValue
            : field.type === "uint256" || field.type === "uint24"
            ? 0
            : "";
      });
      setFormData(initialFormData);
    } catch (error) {
      console.error("Error getting required state:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldName: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSubmit = () => {
    const result = {
      moduleName: selectedModule,
      chainId: chainId,
      config: formData,
    };
    console.log("Generated Object:", result);
  };

  return (
    <AuthWrapper>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex w-full justify-between items-center mb-8">
            <ThemeToggle />
            <ConnectButton />
          </div>

          <div className="max-w-2xl mx-auto space-y-6">
            {/* Step 1: Module Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Select Module</CardTitle>
                <CardDescription>Choose a module to configure</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedModule || ""}
                  onValueChange={(value) =>
                    handleModuleSelect(value as ModuleName)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a module..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModules.map((module) => (
                      <SelectItem key={module} value={module}>
                        {module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Loading state */}
            {loading && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground">
                      Loading required state...
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Required Fields Form */}
            {requiredState && !loading && (
              <Card>
                <CardHeader>
                  <CardTitle>Step 2: Fill Required Fields</CardTitle>
                  <CardDescription>
                    Configure the module parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    {requiredState.requiredFields.map((field: ConfigField) => (
                      <div key={field.name} className="space-y-2">
                        <label className="text-sm font-medium">
                          {field.name} ({field.type})
                        </label>
                        <Input
                          type={
                            field.type === "uint256" || field.type === "uint24"
                              ? "number"
                              : "text"
                          }
                          value={formData[field.name] || ""}
                          onChange={(e) => {
                            const value =
                              field.type === "uint256" ||
                              field.type === "uint24"
                                ? parseInt(e.target.value) || 0
                                : e.target.value;
                            handleFieldChange(field.name, value);
                          }}
                          placeholder={`Enter ${field.name}`}
                        />
                      </div>
                    ))}
                  </div>

                  <Button onClick={handleSubmit} className="w-full">
                    Submit
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AuthWrapper>
  );
}
