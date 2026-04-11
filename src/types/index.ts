export type ToolType = 'jwt-decoder' | 'json-diff' | 'base64' | 'uuid-generator' | 'hash-generator' | 'url-encoder' | 'timestamp-converter' | 'regex-tester' | 'json-formatter';

export interface HistoryEntry {
  tool: ToolType;
  input: string;
  output: string;
  createdAt: string;
}

export interface ToolConfig {
  id: ToolType;
  label: string;
  icon: string;
  description: string;
}

export const TOOLS: ToolConfig[] = [
  {
    id: 'jwt-decoder',
    label: 'JWT DECODER',
    icon: 'key-round',
    description: 'Decode and validate JWT tokens',
  },
  {
    id: 'json-diff',
    label: 'JSON DIFF',
    icon: 'git-compare',
    description: 'Compare two JSON objects',
  },
  {
    id: 'base64',
    label: 'BASE64',
    icon: 'file-code',
    description: 'Encode and decode Base64 strings',
  },
  {
    id: 'uuid-generator',
    label: 'UUID GENERATOR',
    icon: 'hash',
    description: 'Generate UUID v4 identifiers',
  },
  {
    id: 'hash-generator',
    label: 'HASH GENERATOR',
    icon: 'shield',
    description: 'Generate MD5, SHA-1, SHA-256, SHA-512 hashes',
  },
  {
    id: 'url-encoder',
    label: 'URL ENCODER',
    icon: 'link',
    description: 'Encode and decode URL components',
  },
  {
    id: 'timestamp-converter',
    label: 'TIMESTAMP',
    icon: 'timer',
    description: 'Convert between Unix timestamps and readable dates',
  },
  {
    id: 'regex-tester',
    label: 'REGEX TESTER',
    icon: 'regex',
    description: 'Test regular expressions with real-time matching',
  },
  {
    id: 'json-formatter',
    label: 'JSON FORMAT',
    icon: 'braces',
    description: 'Beautify, minify and validate JSON data',
  },
];
