export interface RegexMatch {
  index: number;
  match: string;
  groups: string[];
}

export interface RegexResult {
  matches: RegexMatch[];
  isValid: boolean;
  error: string | null;
}

export function parseRegexPattern(pattern: string): { regex: string; flags: string } {
  // Try to parse /pattern/flags format
  const regexLiteral = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexLiteral) {
    return { regex: regexLiteral[1], flags: regexLiteral[2] };
  }
  return { regex: pattern, flags: '' };
}

export function testRegex(pattern: string, flags: string, testString: string): RegexResult {
  if (!pattern) {
    return { matches: [], isValid: true, error: null };
  }

  try {
    const regex = new RegExp(pattern, flags);
    const matches: RegexMatch[] = [];

    if (flags.includes('g')) {
      let match;
      while ((match = regex.exec(testString)) !== null) {
        matches.push({
          index: match.index,
          match: match[0],
          groups: match.slice(1),
        });
        // Prevent infinite loops for zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else {
      const match = regex.exec(testString);
      if (match) {
        matches.push({
          index: match.index,
          match: match[0],
          groups: match.slice(1),
        });
      }
    }

    return { matches, isValid: true, error: null };
  } catch (err) {
    return {
      matches: [],
      isValid: false,
      error: err instanceof Error ? err.message : 'Invalid regex',
    };
  }
}

export function validateRegex(pattern: string, flags: string): { valid: boolean; error: string | null } {
  try {
    new RegExp(pattern, flags);
    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid regex' };
  }
}
