"use client";
import { AuthWrapper } from "@/components/AuthWrapper";
import { BASE_CHAIN } from "@/lib/chain-constants";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getRequiredState, getRequiredAvailableModules } from "unwallet";
import type { ModuleName, RequiredStateData, ConfigField } from "unwallet";
import { useState } from "react";

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
      console.log("Required State:", result);

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
    alert("Object logged to console! Check developer tools.");
  };

  return (
    <AuthWrapper>
      <div className="flex min-h-screen items-center justify-center font-sans">
        <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 sm:items-start">
          <div className="flex w-full justify-between items-center">
            <p></p>
            <ConnectButton />
          </div>

          <div className="w-full space-y-6">
            {/* Step 1: Module Selection */}
            <div>
              <h2 className="text-xl font-bold mb-4">Step 1: Select Module</h2>
              <select
                value={selectedModule || ""}
                onChange={(e) =>
                  handleModuleSelect(e.target.value as ModuleName)
                }
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="">Select a module...</option>
                {availableModules.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="text-center">
                <p>Loading required state...</p>
              </div>
            )}

            {/* Step 2: Required Fields Form */}
            {requiredState && !loading && (
              <div>
                <h2 className="text-xl font-bold mb-4">
                  Step 2: Fill Required Fields
                </h2>
                <div className="mb-4 p-3 rounded">
                  <p>
                    <strong>Module:</strong> {requiredState.moduleName}
                  </p>
                  <p>
                    <strong>Chain ID:</strong> {requiredState.chainId}
                  </p>
                  <p>
                    <strong>Config Input Type:</strong>{" "}
                    {requiredState.configInputType}
                  </p>
                </div>
                <div className="space-y-4">
                  {requiredState.requiredFields.map((field: ConfigField) => (
                    <div key={field.name}>
                      <label className="block text-sm font-medium mb-1">
                        {field.name} ({field.type}):
                      </label>
                      <input
                        type={
                          field.type === "uint256" || field.type === "uint24"
                            ? "number"
                            : "text"
                        }
                        value={formData[field.name] || ""}
                        onChange={(e) => {
                          const value =
                            field.type === "uint256" || field.type === "uint24"
                              ? parseInt(e.target.value) || 0
                              : e.target.value;
                          handleFieldChange(field.name, value);
                        }}
                        placeholder={`Enter ${field.name}`}
                        className="w-full p-2 border border-gray-300 rounded"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSubmit}
                  className="mt-4 px-4 py-2 rounded"
                >
                  Create Object & Log
                </button>
              </div>
            )}

            {/* Debug: Show required state */}
            {requiredState && (
              <div>
                <h3 className="text-lg font-bold mb-2">
                  Required State Response:
                </h3>
                <pre className="p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(requiredState, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthWrapper>
  );
}
