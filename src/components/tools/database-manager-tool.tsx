import { useState, useEffect, useCallback } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
  Database, Play, RefreshCw, ChevronDown, ChevronRight,
  Table, KeyRound, Type, Plug, Zap, X, Copy,
  Bookmark, Trash2,
} from 'lucide-react';
import {
  isTauriEnvironment,
  dbTestConnection, dbConnect, dbDisconnect,
  dbExecuteQuery, dbListTables, dbDescribeTable,
  loadSavedConnections, saveConnection, deleteSavedConnection,
  getDefaultPort,
} from '../../services/database-manager.service';
import type {
  DbType, DbConfig, SavedConnection,
  DbQueryResult, DbTableInfo, DbColumnInfo,
} from '../../services/database-manager.service';
import styles from './database-manager-tool.module.css';

const DB_TYPE_LABELS: Record<DbType, string> = {
  postgresql: 'PG',
  mysql: 'MY',
  sqlite: 'SL',
};

export function DatabaseManagerTool() {
  // Desktop guard
  const [isTauri] = useState(() => isTauriEnvironment());

  // Connection form
  const [dbType, setDbType] = useState<DbType>('postgresql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Connection state
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Schema
  const [tables, setTables] = useState<DbTableInfo[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [tableColumns, setTableColumns] = useState<Record<string, DbColumnInfo[]>>({});

  // Query
  const [query, setQuery] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);

  // Results
  const [results, setResults] = useState<DbQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Saved connections
  const [savedConns, setSavedConns] = useState<SavedConnection[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [activeConnId, setActiveConnId] = useState<string | null>(null);

  useEffect(() => {
    setSavedConns(loadSavedConnections());
  }, []);

  const getConfig = useCallback((): DbConfig => ({
    db_type: dbType,
    host,
    port,
    database,
    username,
    password,
  }), [dbType, host, port, database, username, password]);

  const handleDbTypeChange = (type: DbType) => {
    setDbType(type);
    setPort(getDefaultPort(type));
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setConnectionError(null);
    try {
      const msg = await dbTestConnection(getConfig());
      setTestResult(msg);
    } catch (err) {
      setConnectionError(String(err));
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionError(null);
    setTestResult(null);
    try {
      const id = await dbConnect(getConfig());
      setConnectionId(id);
      const tbls = await dbListTables(id);
      setTables(tbls);
    } catch (err) {
      setConnectionError(String(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connectionId) return;
    try {
      await dbDisconnect(connectionId);
    } catch {
      // ignore
    }
    setConnectionId(null);
    setActiveConnId(null);
    setTables([]);
    setExpandedTables(new Set());
    setTableColumns({});
    setResults(null);
    setQueryError(null);
  };

  const handleRefreshSchema = async () => {
    if (!connectionId) return;
    try {
      const tbls = await dbListTables(connectionId);
      setTables(tbls);
      setExpandedTables(new Set());
      setTableColumns({});
    } catch (err) {
      setConnectionError(String(err));
    }
  };

  const handleToggleTable = async (tableName: string) => {
    const next = new Set(expandedTables);
    if (next.has(tableName)) {
      next.delete(tableName);
    } else {
      next.add(tableName);
      if (!tableColumns[tableName] && connectionId) {
        try {
          const cols = await dbDescribeTable(connectionId, tableName);
          setTableColumns(prev => ({ ...prev, [tableName]: cols }));
        } catch {
          // ignore
        }
      }
    }
    setExpandedTables(next);
  };

  const handleExecute = async () => {
    if (!connectionId || !query.trim()) return;
    setIsExecuting(true);
    setQueryError(null);
    setResults(null);
    try {
      const res = await dbExecuteQuery(connectionId, query);
      setResults(res);
    } catch (err) {
      setQueryError(String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveConnection = () => {
    const defaultName = `${dbType}://${host}:${port}/${database}`;
    const name = prompt('Connection name:', defaultName);
    if (!name) return;
    const conn: SavedConnection = {
      id: Date.now().toString(),
      name,
      config: getConfig(),
    };
    saveConnection(conn);
    setSavedConns(loadSavedConnections());
    setShowSaved(true);
  };

  const handleLoadSaved = (conn: SavedConnection) => {
    setDbType(conn.config.db_type);
    setHost(conn.config.host);
    setPort(conn.config.port);
    setDatabase(conn.config.database);
    setUsername(conn.config.username);
    setPassword(conn.config.password);
    setActiveConnId(conn.id);
  };

  const handleDeleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSavedConnection(id);
    setSavedConns(loadSavedConnections());
    if (activeConnId === id) setActiveConnId(null);
  };

  const handleCopyResults = () => {
    if (!results) return;
    const header = results.columns.join('\t');
    const rows = results.rows.map(r => r.map(v => v ?? 'NULL').join('\t')).join('\n');
    navigator.clipboard.writeText(`${header}\n${rows}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const formatConnString = (config: DbConfig): string => {
    if (config.db_type === 'sqlite') return config.database;
    return `${config.host}:${config.port}/${config.database}`;
  };

  if (!isTauri) {
    return (
      <div className={styles.desktopOnly}>
        <Database size={48} />
        <span>Database Manager requires the desktop app</span>
      </div>
    );
  }

  const isConnected = !!connectionId;

  return (
    <div className={styles.container}>
      {/* Connection Bar */}
      <div className={styles.connectionBar}>
        <div className={styles.dbTypeSelector}>
          <Database size={14} />
          <select
            className={styles.dbTypeSelect}
            value={dbType}
            onChange={e => handleDbTypeChange(e.target.value as DbType)}
            disabled={isConnected}
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
          </select>
          <ChevronDown size={12} className={styles.dbTypeChevron} />
        </div>

        <div className={styles.connectionFields}>
          {dbType !== 'sqlite' ? (
            <>
              <input
                className={styles.fieldHost}
                placeholder="host"
                value={host}
                onChange={e => setHost(e.target.value)}
                disabled={isConnected}
              />
              <input
                className={styles.fieldPort}
                placeholder="port"
                type="number"
                value={port}
                onChange={e => setPort(parseInt(e.target.value) || 0)}
                disabled={isConnected}
              />
              <input
                className={styles.fieldDb}
                placeholder="database"
                value={database}
                onChange={e => setDatabase(e.target.value)}
                disabled={isConnected}
              />
              <input
                className={styles.fieldUser}
                placeholder="user"
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={isConnected}
              />
              <input
                className={styles.fieldPass}
                placeholder="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isConnected}
              />
            </>
          ) : (
            <input
              className={styles.fieldHost}
              placeholder="/path/to/database.db"
              value={database}
              onChange={e => setDatabase(e.target.value)}
              disabled={isConnected}
              style={{ flex: 1 }}
            />
          )}
        </div>

        <div className={styles.connActions}>
          {!isConnected ? (
            <>
              <button className={styles.btnTest} onClick={handleTest} disabled={isTesting}>
                <Plug size={14} />
                {isTesting ? 'TESTING...' : 'TEST'}
              </button>
              <button
                className={styles.btnSave}
                onClick={handleSaveConnection}
                title="Save connection"
              >
                <Bookmark size={14} />
                SAVE
              </button>
              <button className={styles.btnConnect} onClick={handleConnect} disabled={isConnecting}>
                <Zap size={14} />
                {isConnecting ? 'CONNECTING...' : 'CONNECT'}
              </button>
            </>
          ) : (
            <button className={styles.btnDisconnect} onClick={handleDisconnect}>
              <X size={14} />
              DISCONNECT
            </button>
          )}
        </div>
      </div>

      {/* Saved Sessions */}
      <div className={styles.savedSessions}>
        <button
          className={styles.savedSessionsToggle}
          onClick={() => setShowSaved(!showSaved)}
        >
          <span className={styles.savedSessionsLabel}>// SAVED_SESSIONS</span>
          <span className={styles.savedSessionsBadge}>
            {savedConns.length} saved
          </span>
          <ChevronDown
            size={12}
            className={`${styles.savedSessionsChevron} ${showSaved ? '' : styles.savedSessionsChevronCollapsed}`}
          />
        </button>

        {showSaved && (
          <div className={styles.savedCards}>
            {savedConns.length === 0 ? (
              <div className={styles.emptyText}>No saved connections yet — use SAVE to add one</div>
            ) : (
              savedConns.map(conn => (
                <button
                  key={conn.id}
                  className={`${styles.savedCard} ${activeConnId === conn.id ? styles.savedCardActive : ''}`}
                  onClick={() => handleLoadSaved(conn)}
                >
                  <div className={styles.savedCardHeader}>
                    <span className={styles.savedCardName}>{conn.name}</span>
                    <button
                      className={styles.savedCardDelete}
                      onClick={(e) => handleDeleteSaved(conn.id, e)}
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <div className={styles.savedCardMeta}>
                    <span className={`${styles.savedCardBadge} ${styles[`badge_${conn.config.db_type}`]}`}>
                      {DB_TYPE_LABELS[conn.config.db_type]}
                    </span>
                    <span className={styles.savedCardConn}>
                      {formatConnString(conn.config)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Test / Error feedback */}
      {testResult && <div className={styles.successText}>{testResult}</div>}
      {connectionError && <div className={styles.errorText}>{connectionError}</div>}

      {/* Main Area */}
      <div className={styles.mainArea}>
        <PanelGroup orientation="horizontal">
          {/* Schema Panel */}
          <Panel defaultSize={25} minSize={15} maxSize={40}>
            <div className={isConnected ? styles.schemaPanel : styles.schemaPanelEmpty}>
              <div className={styles.schemaHeader}>
                <span className={styles.schemaHeaderLabel}>// SCHEMA</span>
                {isConnected && (
                  <button className={styles.refreshBtn} onClick={handleRefreshSchema} title="Refresh schema">
                    <RefreshCw size={12} />
                  </button>
                )}
              </div>

              {isConnected ? (
                <div className={styles.schemaTree}>
                  <div className={styles.treeNodeDb}>
                    <ChevronDown size={12} className={styles.treeIconAccent} />
                    <Database size={14} className={styles.treeIconAccent} />
                    <span>{database || 'database'}</span>
                  </div>

                  {tables.map(tbl => (
                    <div key={tbl.name}>
                      <div
                        className={styles.treeNodeTable}
                        onClick={() => handleToggleTable(tbl.name)}
                      >
                        {expandedTables.has(tbl.name) ? (
                          <ChevronDown size={12} className={styles.treeIcon} />
                        ) : (
                          <ChevronRight size={12} className={styles.treeIcon} />
                        )}
                        <Table size={14} className={styles.treeIcon} />
                        <span>{tbl.name}</span>
                        {tableColumns[tbl.name] && (
                          <span className={styles.treeMeta}>
                            ({tableColumns[tbl.name].length} cols)
                          </span>
                        )}
                      </div>

                      {expandedTables.has(tbl.name) && tableColumns[tbl.name]?.map(col => (
                        <div key={col.name} className={styles.treeNodeColumn}>
                          {col.is_primary_key ? (
                            <KeyRound size={11} className={styles.treeIconAccent} />
                          ) : (
                            <Type size={11} className={styles.treeIcon} />
                          )}
                          <span>{col.name}</span>
                          <span className={styles.treeMeta}>{col.data_type}</span>
                        </div>
                      ))}
                    </div>
                  ))}

                  {tables.length === 0 && (
                    <div className={styles.emptyText}>No tables found</div>
                  )}
                </div>
              ) : (
                <div className={styles.emptyText}>Connect to browse schema</div>
              )}
            </div>
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className={styles.panelResizeHandle} />

          {/* Right Panel */}
          <Panel defaultSize={75} minSize={40}>
            <div className={styles.rightPanel}>
              {/* Query Editor */}
              <div className={styles.queryPanel}>
                <div className={styles.queryHeader}>
                  <span className={styles.schemaHeaderLabel}>// QUERY</span>
                  <div className={styles.queryActions}>
                    <button
                      className={styles.btnExecute}
                      onClick={handleExecute}
                      disabled={!isConnected || isExecuting || !query.trim()}
                    >
                      <Play size={12} />
                      {isExecuting ? 'RUNNING...' : 'EXECUTE'}
                    </button>
                  </div>
                </div>
                <textarea
                  className={styles.queryEditor}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="SELECT * FROM users LIMIT 100;"
                  spellCheck={false}
                />
              </div>

              {/* Results Panel */}
              <div className={styles.resultsPanel}>
                <div className={styles.resultsHeader}>
                  <div className={styles.resultsLeft}>
                    <span className={styles.schemaHeaderLabel}>// RESULTS</span>
                    {results && (
                      <>
                        <span className={styles.badge}>
                          {results.row_count > 0
                            ? `${results.row_count} row${results.row_count !== 1 ? 's' : ''}`
                            : `${results.affected_rows} affected`}
                        </span>
                        <span className={styles.badgeMuted}>{results.execution_time_ms}ms</span>
                      </>
                    )}
                  </div>
                  <div className={styles.resultsRight}>
                    {results && results.rows.length > 0 && (
                      <button className={styles.btnSecondary} onClick={handleCopyResults}>
                        <Copy size={12} />
                        COPY
                      </button>
                    )}
                  </div>
                </div>

                {queryError && <div className={styles.errorText}>{queryError}</div>}

                {results && results.columns.length > 0 && (
                  <div className={styles.tableWrapper}>
                    <table className={styles.resultsTable}>
                      <thead>
                        <tr>
                          {results.columns.map((col, i) => (
                            <th key={i}>{col.toUpperCase()}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((val, ci) => (
                              <td key={ci} className={ci === 0 ? styles.cellId : val === null ? styles.cellNull : undefined}>
                                {val ?? 'NULL'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {results && results.columns.length === 0 && !queryError && (
                  <div className={styles.successText}>
                    Query executed successfully. {results.affected_rows} row(s) affected.
                  </div>
                )}

                {!results && !queryError && (
                  <div className={styles.emptyText}>
                    Execute a query to see results
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Status Bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <div className={isConnected ? styles.statusDot : styles.statusDotOff} />
          <span className={styles.statusText}>
            {isConnected
              ? `CONNECTED — ${dbType} on ${host}:${port}`
              : 'DISCONNECTED — No active connection'}
          </span>
        </div>
        <span className={styles.statusTag}>DB_MANAGER</span>
      </div>
    </div>
  );
}
