export interface JsonFormatResult {
  output: string;
  lines: number;
  bytes: number;
}

export function beautifyJson(input: string, indent: number = 2): JsonFormatResult {
  try {
    const parsed = JSON.parse(input);
    const output = JSON.stringify(parsed, null, indent);
    return {
      output,
      lines: output.split('\n').length,
      bytes: new TextEncoder().encode(output).length,
    };
  } catch {
    throw new Error('Invalid JSON: unable to parse input');
  }
}

export function minifyJson(input: string): JsonFormatResult {
  try {
    const parsed = JSON.parse(input);
    const output = JSON.stringify(parsed);
    return {
      output,
      lines: 1,
      bytes: new TextEncoder().encode(output).length,
    };
  } catch {
    throw new Error('Invalid JSON: unable to parse input');
  }
}

export interface JsonValidation {
  valid: boolean;
  error: string | null;
  position?: { line: number; column: number };
}

export function validateJson(input: string): JsonValidation {
  try {
    JSON.parse(input);
    return { valid: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    // Try to extract position from error message
    const posMatch = message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const lines = input.substring(0, pos).split('\n');
      return {
        valid: false,
        error: message,
        position: { line: lines.length, column: lines[lines.length - 1].length + 1 },
      };
    }
    return { valid: false, error: message };
  }
}
