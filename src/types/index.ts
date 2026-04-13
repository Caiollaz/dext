export type ToolType =
  | 'jwt-decoder'
  | 'base64'
  | 'hash-generator'
  | 'url-encoder'
  | 'json-formatter'
  | 'json-diff'
  | 'json-to-typescript'
  | 'uuid-generator'
  | 'secret-generator'
  | 'mock-generator'
  | 'timestamp-converter'
  | 'color-converter'
  | 'curl-converter'
  | 'regex-tester'
  | 'markdown-preview'
  | 'http-runner'
  | 'env-manager'
  | 'port-scanner'
  | 'dns-lookup'
  | 'ssl-inspector'
  | 'websocket-tester'
  | 'docker-dashboard'
  | 'log-tail-viewer'
  | 'database-manager';

export type ToolGroupId =
  | 'encode-decode'
  | 'json'
  | 'generators'
  | 'converters'
  | 'text'
  | 'network'
  | 'devops';

export interface ToolGroup {
  id: ToolGroupId;
  label: string;
}

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
  group: ToolGroupId;
}

export const TOOL_GROUPS: ToolGroup[] = [
  { id: 'encode-decode', label: 'ENCODE / DECODE' },
  { id: 'json', label: 'JSON' },
  { id: 'generators', label: 'GENERATORS' },
  { id: 'converters', label: 'CONVERTERS' },
  { id: 'text', label: 'TEXT' },
  { id: 'network', label: 'NETWORK' },
  { id: 'devops', label: 'DEVOPS' },
];

export const TOOLS: ToolConfig[] = [
  // ENCODE / DECODE
  {
    id: 'jwt-decoder',
    label: 'JWT DECODER',
    icon: 'key-round',
    description: 'Decode and validate JWT tokens',
    group: 'encode-decode',
  },
  {
    id: 'base64',
    label: 'BASE64',
    icon: 'file-code',
    description: 'Encode and decode Base64 strings',
    group: 'encode-decode',
  },
  {
    id: 'hash-generator',
    label: 'HASH GENERATOR',
    icon: 'shield',
    description: 'Generate MD5, SHA-1, SHA-256, SHA-512 hashes',
    group: 'encode-decode',
  },
  {
    id: 'url-encoder',
    label: 'URL ENCODER',
    icon: 'link',
    description: 'Encode and decode URL components',
    group: 'encode-decode',
  },
  // JSON
  {
    id: 'json-formatter',
    label: 'JSON FORMAT',
    icon: 'braces',
    description: 'Beautify, minify and validate JSON data',
    group: 'json',
  },
  {
    id: 'json-diff',
    label: 'JSON DIFF',
    icon: 'git-compare',
    description: 'Compare two JSON objects',
    group: 'json',
  },
  {
    id: 'json-to-typescript',
    label: 'JSON → TS',
    icon: 'file-type',
    description: 'Convert JSON to TypeScript interfaces',
    group: 'json',
  },
  // GENERATORS
  {
    id: 'uuid-generator',
    label: 'UUID GENERATOR',
    icon: 'hash',
    description: 'Generate UUID v4 identifiers',
    group: 'generators',
  },
  {
    id: 'secret-generator',
    label: 'SECRET GEN',
    icon: 'lock',
    description: 'Generate secure tokens, API keys and passwords',
    group: 'generators',
  },
  {
    id: 'mock-generator',
    label: 'MOCK GEN',
    icon: 'database',
    description: 'Generate mock data from interface definitions',
    group: 'generators',
  },
  // CONVERTERS
  {
    id: 'timestamp-converter',
    label: 'TIMESTAMP',
    icon: 'timer',
    description: 'Convert between Unix timestamps and readable dates',
    group: 'converters',
  },
  {
    id: 'color-converter',
    label: 'COLOR CONVERT',
    icon: 'palette',
    description: 'Convert colors between HEX, RGB, HSL and more',
    group: 'converters',
  },
  {
    id: 'curl-converter',
    label: 'CURL CONVERT',
    icon: 'terminal',
    description: 'Convert cURL commands to code in multiple languages',
    group: 'converters',
  },
  // TEXT
  {
    id: 'regex-tester',
    label: 'REGEX TESTER',
    icon: 'regex',
    description: 'Test regular expressions with real-time matching',
    group: 'text',
  },
  {
    id: 'markdown-preview',
    label: 'MARKDOWN',
    icon: 'book-open',
    description: 'Preview and convert Markdown to HTML',
    group: 'text',
  },
  // DEVOPS
  {
    id: 'http-runner',
    label: 'HTTP RUNNER',
    icon: 'send',
    description: 'Send HTTP requests with full control (desktop only)',
    group: 'devops',
  },
  {
    id: 'env-manager',
    label: 'ENV MANAGER',
    icon: 'file-cog',
    description: 'Compare and manage .env files',
    group: 'devops',
  },
  {
    id: 'docker-dashboard',
    label: 'DOCKER',
    icon: 'container',
    description: 'Manage Docker containers — start, stop, restart and view logs (desktop only)',
    group: 'devops',
  },
  {
    id: 'log-tail-viewer',
    label: 'LOG TAIL',
    icon: 'file-text',
    description: 'Watch log files in real-time with filtering and level highlighting (desktop only)',
    group: 'devops',
  },
  // NETWORK
  {
    id: 'port-scanner',
    label: 'PORT SCANNER',
    icon: 'radar',
    description: 'Scan local ports to find running services (desktop only)',
    group: 'network',
  },
  {
    id: 'dns-lookup',
    label: 'DNS LOOKUP',
    icon: 'globe',
    description: 'Resolve domains and inspect DNS records (desktop only)',
    group: 'network',
  },
  {
    id: 'ssl-inspector',
    label: 'SSL INSPECTOR',
    icon: 'shield-check',
    description: 'Inspect TLS certificates, chain and expiry details (desktop only)',
    group: 'network',
  },
  {
    id: 'websocket-tester',
    label: 'WEBSOCKET',
    icon: 'plug',
    description: 'Connect to WebSocket servers, send and receive messages in real-time',
    group: 'network',
  },
  {
    id: 'database-manager',
    label: 'DATABASE',
    icon: 'cylinder',
    description: 'Connect to PostgreSQL, MySQL and SQLite databases, run queries and browse schemas (desktop only)',
    group: 'devops',
  },
];
