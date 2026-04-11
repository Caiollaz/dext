export function encodeUrl(input: string): string {
  try {
    return encodeURIComponent(input);
  } catch {
    throw new Error('Failed to encode: invalid input');
  }
}

export function decodeUrl(input: string): string {
  try {
    return decodeURIComponent(input.trim());
  } catch {
    throw new Error('Failed to decode: invalid encoded string');
  }
}

export function encodeFullUrl(input: string): string {
  try {
    return encodeURI(input);
  } catch {
    throw new Error('Failed to encode: invalid URL');
  }
}

export function decodeFullUrl(input: string): string {
  try {
    return decodeURI(input.trim());
  } catch {
    throw new Error('Failed to decode: invalid encoded URL');
  }
}
