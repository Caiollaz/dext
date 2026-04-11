/**
 * HTTP Runner Service
 *
 * Uses Tauri's HTTP plugin for CORS-free requests.
 * Falls back to an error message in browser mode (desktop-only feature).
 */

// ── Types ──────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'bearer' | 'basic';

export type BodyType = 'none' | 'json' | 'form' | 'raw';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  queryParams: KeyValuePair[];
  headers: KeyValuePair[];
  authType: AuthType;
  authToken: string;
  authUser: string;
  authPass: string;
  bodyType: BodyType;
  body: string;
  bodyFormData: KeyValuePair[];
  timeout: number; // seconds
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number; // ms
  size: number; // bytes
  cookies: { name: string; value: string; domain?: string; path?: string }[];
}

// ── Constants ──────────────────────────────────────────────

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_TIMEOUT = 30; // seconds

// ── Helpers ────────────────────────────────────────────────

export function createEmptyPair(): KeyValuePair {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true };
}

export function createDefaultConfig(): RequestConfig {
  return {
    method: 'GET',
    url: '',
    queryParams: [createEmptyPair()],
    headers: [createEmptyPair()],
    authType: 'none',
    authToken: '',
    authUser: '',
    authPass: '',
    bodyType: 'none',
    body: '',
    bodyFormData: [createEmptyPair()],
    timeout: DEFAULT_TIMEOUT,
  };
}

function buildUrl(base: string, params: KeyValuePair[]): string {
  const activeParams = params.filter((p) => p.enabled && p.key.trim());
  if (activeParams.length === 0) return base;

  const url = new URL(base);
  activeParams.forEach((p) => {
    url.searchParams.append(p.key.trim(), p.value);
  });
  return url.toString();
}

function buildHeaders(config: RequestConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  // User-defined headers
  config.headers
    .filter((h) => h.enabled && h.key.trim())
    .forEach((h) => {
      headers[h.key.trim()] = h.value;
    });

  // Auth headers
  if (config.authType === 'bearer' && config.authToken.trim()) {
    headers['Authorization'] = `Bearer ${config.authToken.trim()}`;
  } else if (config.authType === 'basic' && config.authUser.trim()) {
    const encoded = btoa(`${config.authUser}:${config.authPass}`);
    headers['Authorization'] = `Basic ${encoded}`;
  }

  // Content-Type for body
  if (config.bodyType === 'json') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  } else if (config.bodyType === 'form') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
  } else if (config.bodyType === 'raw') {
    headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
  }

  return headers;
}

function buildBody(config: RequestConfig): string | undefined {
  if (config.method === 'GET' || config.method === 'HEAD' || config.bodyType === 'none') {
    return undefined;
  }

  if (config.bodyType === 'json' || config.bodyType === 'raw') {
    return config.body || undefined;
  }

  if (config.bodyType === 'form') {
    const params = new URLSearchParams();
    config.bodyFormData
      .filter((p) => p.enabled && p.key.trim())
      .forEach((p) => params.append(p.key.trim(), p.value));
    return params.toString() || undefined;
  }

  return undefined;
}

function parseCookies(headers: Record<string, string>): HttpResponse['cookies'] {
  const cookies: HttpResponse['cookies'] = [];
  const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
  if (!setCookie) return cookies;

  const cookieStrings = setCookie.split(/,(?=\s*\w+=)/);
  cookieStrings.forEach((cookieStr) => {
    const parts = cookieStr.split(';').map((s) => s.trim());
    const [nameValue, ...attrs] = parts;
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx === -1) return;

    const cookie: HttpResponse['cookies'][0] = {
      name: nameValue.substring(0, eqIdx).trim(),
      value: nameValue.substring(eqIdx + 1).trim(),
    };

    attrs.forEach((attr) => {
      const [aKey, aVal] = attr.split('=').map((s) => s.trim());
      const lowerKey = aKey.toLowerCase();
      if (lowerKey === 'domain') cookie.domain = aVal;
      if (lowerKey === 'path') cookie.path = aVal;
    });

    cookies.push(cookie);
  });

  return cookies;
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('URL is required');

  // Block non-http(s) protocols
  if (!/^https?:\/\//i.test(trimmed)) {
    // If no protocol, prepend https://
    if (/^[a-zA-Z0-9]/.test(trimmed) && !trimmed.includes('://')) {
      return `https://${trimmed}`;
    }
    throw new Error('Only HTTP and HTTPS protocols are supported');
  }

  // Validate URL
  try {
    new URL(trimmed);
  } catch {
    throw new Error('Invalid URL format');
  }

  return trimmed;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
    409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return statusTexts[status] || 'Unknown';
}

// ── Tauri Detection ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTauriHttpApi(): Promise<any | null> {
  try {
    const moduleName = '@tauri-apps/plugin-http';
    const http = await (Function('m', 'return import(m)')(moduleName));
    return http;
  } catch {
    return null;
  }
}

let _isTauriChecked = false;
let _isTauri = false;

export async function isTauriEnvironment(): Promise<boolean> {
  if (_isTauriChecked) return _isTauri;
  const http = await getTauriHttpApi();
  _isTauri = http !== null;
  _isTauriChecked = true;
  return _isTauri;
}

// ── Core: Send Request ─────────────────────────────────────

export async function sendRequest(
  config: RequestConfig,
  abortSignal?: AbortSignal,
): Promise<HttpResponse> {
  const http = await getTauriHttpApi();

  if (!http) {
    throw new Error(
      'HTTP Runner requires the desktop app. This feature is not available in the browser.',
    );
  }

  const sanitizedUrl = sanitizeUrl(config.url);
  const fullUrl = buildUrl(sanitizedUrl, config.queryParams);
  const headers = buildHeaders(config);
  const body = buildBody(config);

  const startTime = performance.now();

  const response = await http.fetch(fullUrl, {
    method: config.method,
    headers,
    body: body ? { type: 'Text', payload: body } : undefined,
    connectTimeout: config.timeout * 1000,
    signal: abortSignal,
  });

  const endTime = performance.now();
  const elapsed = Math.round(endTime - startTime);

  // Read response body with size limit
  const responseText = await response.text();
  const responseSize = new Blob([responseText]).size;

  if (responseSize > MAX_RESPONSE_SIZE) {
    throw new Error(
      `Response too large (${formatBytes(responseSize)}). Maximum allowed: ${formatBytes(MAX_RESPONSE_SIZE)}.`,
    );
  }

  // Extract response headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value: string, key: string) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    statusText: getStatusText(response.status),
    headers: responseHeaders,
    body: responseText,
    time: elapsed,
    size: responseSize,
    cookies: parseCookies(responseHeaders),
  };
}

// ── cURL Export ─────────────────────────────────────────────

export function buildCurlCommand(config: RequestConfig): string {
  const parts: string[] = ['curl'];

  // Method
  if (config.method !== 'GET') {
    parts.push(`-X ${config.method}`);
  }

  // URL with query params
  const sanitizedUrl = config.url.trim() || 'https://example.com';
  let fullUrl: string;
  try {
    fullUrl = buildUrl(sanitizedUrl, config.queryParams);
  } catch {
    fullUrl = sanitizedUrl;
  }
  parts.push(`'${fullUrl}'`);

  // Headers
  const headers = buildHeaders(config);
  Object.entries(headers).forEach(([key, value]) => {
    parts.push(`-H '${key}: ${value}'`);
  });

  // Body
  const body = buildBody(config);
  if (body) {
    parts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(' \\\n  ');
}

// ── Utilities ──────────────────────────────────────────────

export function getStatusColor(status: number): 'success' | 'warning' | 'error' {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'warning';
  return 'error';
}

export function formatResponseSize(bytes: number): string {
  return formatBytes(bytes);
}

export function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function tryFormatJson(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}
