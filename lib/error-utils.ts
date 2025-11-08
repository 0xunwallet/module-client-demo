/**
 * Utility functions for error formatting and display
 */

/**
 * Formats error messages - truncates if longer than 150 characters
 * @param error - Error object or string
 * @returns Formatted error message
 */
export function formatError(error: unknown): string {
  let errorMessage: string;

  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else {
    errorMessage = "An unknown error occurred";
  }

  // If error is longer than 150 characters, truncate and add ellipsis
  if (errorMessage.length > 150) {
    return errorMessage.substring(0, 147) + "...";
  }

  return errorMessage;
}

/**
 * Gets a user-friendly error message
 * @param error - Error object or string
 * @returns User-friendly error message
 */
export function getUserFriendlyError(error: unknown): string {
  const formatted = formatError(error);

  // Add common error mappings for better UX
  if (formatted.includes("insufficient funds") || formatted.includes("insufficient balance")) {
    return "Insufficient funds. Please check your balance.";
  }

  if (formatted.includes("user rejected") || formatted.includes("User rejected")) {
    return "Transaction was rejected. Please try again.";
  }

  if (formatted.includes("network") || formatted.includes("Network")) {
    return "Network error. Please check your connection and try again.";
  }

  return formatted;
}

