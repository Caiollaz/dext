import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, Plus, Copy, Loader2 } from 'lucide-react';
import {
  sendRequest,
  buildCurlCommand,
  isTauriEnvironment,
  createDefaultConfig,
  createEmptyPair,
  tryFormatJson,
  getStatusColor,
  formatResponseSize,
  formatResponseTime,
  HTTP_METHODS,
} from '../../services/http-runner.service';
import type {
  RequestConfig,
  HttpResponse,
  HttpMethod,
  AuthType,
  BodyType,
  KeyValuePair,
} from '../../services/http-runner.service';
import { useClipboard } from '../../hooks/use-clipboard';
import styles from './http-runner-tool.module.css';

type RequestTab = 'query' | 'headers' | 'auth' | 'body';
type ResponseTab = 'body' | 'headers' | 'cookies';

export function HttpRunnerTool() {
  const [config, setConfig] = useState<RequestConfig>(createDefaultConfig);
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestTab, setRequestTab] = useState<RequestTab>('query');
  const [responseTab, setResponseTab] = useState<ResponseTab>('body');
  const [isTauri, setIsTauri] = useState<boolean | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { copy, copied } = useClipboard();

  useEffect(() => {
    isTauriEnvironment().then(setIsTauri);
  }, []);

  const updateConfig = useCallback(<K extends keyof RequestConfig>(key: K, value: RequestConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSend = async () => {
    if (loading) {
      // Cancel current request
      abortControllerRef.current?.abort();
      return;
    }

    setError(null);
    setResponse(null);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await sendRequest(config, controller.signal);
      setResponse(result);
      setResponseTab('body');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Request failed');
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCopyCurl = () => {
    copy(buildCurlCommand(config));
  };

  const handleCopyBody = () => {
    if (response?.body) copy(response.body);
  };

  // ── Key-Value Pair helpers ─────────────────────────

  const updatePair = (
    field: 'queryParams' | 'headers' | 'bodyFormData',
    id: string,
    updates: Partial<KeyValuePair>,
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: prev[field].map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  };

  const addPair = (field: 'queryParams' | 'headers' | 'bodyFormData') => {
    setConfig((prev) => ({
      ...prev,
      [field]: [...prev[field], createEmptyPair()],
    }));
  };

  const removePair = (field: 'queryParams' | 'headers' | 'bodyFormData', id: string) => {
    setConfig((prev) => ({
      ...prev,
      [field]: prev[field].length > 1 ? prev[field].filter((p) => p.id !== id) : prev[field],
    }));
  };

  // ── Sub-renders ────────────────────────────────────

  const renderKeyValueEditor = (field: 'queryParams' | 'headers' | 'bodyFormData') => {
    const pairs = config[field];
    return (
      <div className={styles.kvEditor}>
        {pairs.map((pair) => (
          <div key={pair.id} className={styles.kvRow}>
            <input
              type="checkbox"
              checked={pair.enabled}
              onChange={(e) => updatePair(field, pair.id, { enabled: e.target.checked })}
              className={styles.kvCheck}
            />
            <input
              type="text"
              value={pair.key}
              onChange={(e) => updatePair(field, pair.id, { key: e.target.value })}
              placeholder="Key"
              className={styles.kvKey}
            />
            <input
              type="text"
              value={pair.value}
              onChange={(e) => updatePair(field, pair.id, { value: e.target.value })}
              placeholder="Value"
              className={styles.kvValue}
            />
            <button
              className={styles.kvDelete}
              onClick={() => removePair(field, pair.id)}
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button className={styles.kvAdd} onClick={() => addPair(field)}>
          <Plus size={12} />
          <span>Add</span>
        </button>
      </div>
    );
  };

  const renderRequestContent = () => {
    switch (requestTab) {
      case 'query':
        return renderKeyValueEditor('queryParams');
      case 'headers':
        return renderKeyValueEditor('headers');
      case 'auth':
        return (
          <div className={styles.authPanel}>
            <div className={styles.authType}>
              <span className={styles.authLabel}>// AUTH_TYPE</span>
              <div className={styles.authButtons}>
                {(['none', 'bearer', 'basic'] as AuthType[]).map((type) => (
                  <button
                    key={type}
                    className={`${styles.authBtn} ${config.authType === type ? styles.authBtnActive : ''}`}
                    onClick={() => updateConfig('authType', type)}
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {config.authType === 'bearer' && (
              <div className={styles.authField}>
                <span className={styles.fieldLabel}>// TOKEN</span>
                <input
                  type="text"
                  value={config.authToken}
                  onChange={(e) => updateConfig('authToken', e.target.value)}
                  placeholder="Enter bearer token..."
                  className={styles.authInput}
                />
              </div>
            )}
            {config.authType === 'basic' && (
              <>
                <div className={styles.authField}>
                  <span className={styles.fieldLabel}>// USERNAME</span>
                  <input
                    type="text"
                    value={config.authUser}
                    onChange={(e) => updateConfig('authUser', e.target.value)}
                    placeholder="Username"
                    className={styles.authInput}
                  />
                </div>
                <div className={styles.authField}>
                  <span className={styles.fieldLabel}>// PASSWORD</span>
                  <input
                    type="password"
                    value={config.authPass}
                    onChange={(e) => updateConfig('authPass', e.target.value)}
                    placeholder="Password"
                    className={styles.authInput}
                  />
                </div>
              </>
            )}
          </div>
        );
      case 'body':
        return (
          <div className={styles.bodyPanel}>
            <div className={styles.bodyType}>
              <span className={styles.bodyLabel}>// BODY_TYPE</span>
              <div className={styles.bodyButtons}>
                {(['none', 'json', 'form', 'raw'] as BodyType[]).map((type) => (
                  <button
                    key={type}
                    className={`${styles.bodyBtn} ${config.bodyType === type ? styles.bodyBtnActive : ''}`}
                    onClick={() => updateConfig('bodyType', type)}
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {config.bodyType === 'json' && (
              <textarea
                value={config.body}
                onChange={(e) => updateConfig('body', e.target.value)}
                placeholder='{"key": "value"}'
                className={styles.bodyTextarea}
                rows={8}
              />
            )}
            {config.bodyType === 'raw' && (
              <textarea
                value={config.body}
                onChange={(e) => updateConfig('body', e.target.value)}
                placeholder="Enter raw body content..."
                className={styles.bodyTextarea}
                rows={8}
              />
            )}
            {config.bodyType === 'form' && renderKeyValueEditor('bodyFormData')}
          </div>
        );
    }
  };

  const renderResponseContent = () => {
    if (!response) return null;

    switch (responseTab) {
      case 'body':
        return (
          <div className={styles.responseBody}>
            <pre className={styles.responseBodyPre}>{tryFormatJson(response.body)}</pre>
          </div>
        );
      case 'headers':
        return (
          <div className={styles.responseHeaders}>
            {Object.entries(response.headers).map(([key, value]) => (
              <div key={key} className={styles.headerRow}>
                <span className={styles.headerKey}>{key}</span>
                <span className={styles.headerValue}>{value}</span>
              </div>
            ))}
          </div>
        );
      case 'cookies':
        return (
          <div className={styles.responseCookies}>
            {response.cookies.length === 0 ? (
              <span className={styles.emptyState}>No cookies in response</span>
            ) : (
              response.cookies.map((cookie, i) => (
                <div key={i} className={styles.cookieRow}>
                  <span className={styles.cookieName}>{cookie.name}</span>
                  <span className={styles.cookieValue}>{cookie.value}</span>
                  {cookie.domain && (
                    <span className={styles.cookieMeta}>domain={cookie.domain}</span>
                  )}
                  {cookie.path && (
                    <span className={styles.cookieMeta}>path={cookie.path}</span>
                  )}
                </div>
              ))
            )}
          </div>
        );
    }
  };

  // ── Desktop-only guard ─────────────────────────────

  if (isTauri === false) {
    return (
      <div className={styles.desktopOnly}>
        <div className={styles.desktopOnlyIcon}>
          <Send size={32} />
        </div>
        <h3 className={styles.desktopOnlyTitle}>DESKTOP ONLY FEATURE</h3>
        <p className={styles.desktopOnlyDesc}>
          HTTP Runner requires the dev-toolsbox desktop app to make CORS-free HTTP requests.
          Download the app to use this tool.
        </p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────

  return (
    <>
      {/* URL Bar */}
      <div className={styles.urlBar}>
        <select
          className={styles.methodSelect}
          value={config.method}
          onChange={(e) => updateConfig('method', e.target.value as HttpMethod)}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          className={styles.urlInput}
          value={config.url}
          onChange={(e) => updateConfig('url', e.target.value)}
          placeholder="https://api.example.com/endpoint"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
        />
        <button
          className={`${styles.sendBtn} ${loading ? styles.sendBtnLoading : ''}`}
          onClick={handleSend}
        >
          {loading ? (
            <>
              <Loader2 size={14} className={styles.spinner} />
              <span>CANCEL</span>
            </>
          ) : (
            <>
              <Send size={14} />
              <span>SEND</span>
            </>
          )}
        </button>
      </div>

      {/* Request Tabs */}
      <div className={styles.section}>
        <div className={styles.tabBar}>
          {(['query', 'headers', 'auth', 'body'] as RequestTab[]).map((tab) => (
            <button
              key={tab}
              className={`${styles.tab} ${requestTab === tab ? styles.tabActive : ''}`}
              onClick={() => setRequestTab(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
        <div className={styles.tabContent}>{renderRequestContent()}</div>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error}>
          <span className={styles.errorDot} />
          <span>{error}</span>
        </div>
      )}

      {/* Response */}
      {response && (
        <div className={styles.section}>
          {/* Response meta */}
          <div className={styles.responseMeta}>
            <div className={styles.responseMetaLeft}>
              <span
                className={`${styles.statusBadge} ${styles[`status${getStatusColor(response.status)}`]}`}
              >
                {response.status} {response.statusText}
              </span>
              <span className={styles.metaBadge}>{formatResponseTime(response.time)}</span>
              <span className={styles.metaBadge}>{formatResponseSize(response.size)}</span>
            </div>
            <div className={styles.responseMetaRight}>
              <button className={styles.copyBtn} onClick={handleCopyBody} title="Copy response body">
                <Copy size={12} />
                <span>{copied ? 'COPIED' : 'COPY'}</span>
              </button>
              <button className={styles.copyBtn} onClick={handleCopyCurl} title="Copy as cURL">
                <Copy size={12} />
                <span>cURL</span>
              </button>
            </div>
          </div>

          {/* Response tabs */}
          <div className={styles.tabBar}>
            {(['body', 'headers', 'cookies'] as ResponseTab[]).map((tab) => (
              <button
                key={tab}
                className={`${styles.tab} ${responseTab === tab ? styles.tabActive : ''}`}
                onClick={() => setResponseTab(tab)}
              >
                {tab.toUpperCase()}
                {tab === 'headers' && (
                  <span className={styles.tabCount}>{Object.keys(response.headers).length}</span>
                )}
                {tab === 'cookies' && response.cookies.length > 0 && (
                  <span className={styles.tabCount}>{response.cookies.length}</span>
                )}
              </button>
            ))}
          </div>
          <div className={styles.tabContent}>{renderResponseContent()}</div>
        </div>
      )}

      {/* Status bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span
            className={`${styles.statusDot} ${loading ? styles.statusDotLoading : ''}`}
          />
          <span className={styles.statusText}>
            {loading
              ? 'SENDING REQUEST...'
              : response
                ? `READY — ${response.status} ${response.statusText}`
                : error
                  ? 'ERROR — Request failed'
                  : 'READY — Waiting for request'}
          </span>
        </div>
        <span className={styles.statusRight}>HTTP_RUNNER</span>
      </div>
    </>
  );
}
