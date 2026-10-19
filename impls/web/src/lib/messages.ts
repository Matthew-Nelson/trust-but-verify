// The one place API error codes map to user-facing text (SPEC "Error messages").
export const GENERIC_ERROR = "Something went wrong. Please try again.";

const MESSAGES: Record<string, string> = {
  invalid_url: "Enter a valid http or https URL.",
  invalid_alias: "Aliases are 3 to 32 letters, numbers, hyphens or underscores.",
  alias_reserved: "That alias is reserved. Try another.",
  alias_taken: "That alias is taken. Try another.",
};

export function messageFor(code: string | undefined): string {
  return (code && MESSAGES[code]) || GENERIC_ERROR;
}
