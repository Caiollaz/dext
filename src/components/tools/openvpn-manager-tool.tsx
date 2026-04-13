import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldAlert,
  FolderOpen,
  Bookmark,
  Plug,
  PlugZap,
  User,
  Lock,
  ShieldCheck,
  Trash2,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  isTauriEnvironment,
  ovpnConnect,
  ovpnDisconnect,
  ovpnStatus,
  ovpnGetLogs,
  ovpnWatchStart,
  ovpnWatchStop,
  loadSavedProfiles,
  saveProfile,
  deleteSavedProfile,
} from '../../services/openvpn-manager.service';
import type {
  OvpnConfig,
  OvpnStatus,
  OvpnLogLine,
  SavedProfile,
} from '../../services/openvpn-manager.service';
import styles from './openvpn-manager-tool.module.css';

export function OpenVpnManagerTool() {
  // Connection form state
  const [profilePath, setProfilePath] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  // Connection state
  const [status, setStatus] = useState<OvpnStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  // Logs
  const [logs, setLogs] = useState<OvpnLogLine[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Saved profiles
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [savedOpen, setSavedOpen] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Status polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTauri = isTauriEnvironment();

  // Load saved profiles on mount
  useEffect(() => {
    setSavedProfiles(loadSavedProfiles());
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Listen for streamed log lines
  useEffect(() => {
    if (!isTauri) return;

    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<OvpnLogLine[]>('ovpn-log-lines', (event) => {
          setLogs((prev) => [...prev, ...event.payload]);
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [isTauri]);

  // Status polling
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await ovpnStatus(profilePath);
        setStatus(s);
        if (s.state === 'disconnected') {
          // Service stopped externally
          setConnecting(false);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }, [profilePath]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (isTauri) {
        ovpnWatchStop().catch(() => {});
      }
    };
  }, [stopPolling, isTauri]);

  const handleConnect = async () => {
    if (!profilePath || !username || !password) {
      setError('Profile path, username and password are required');
      return;
    }

    setError('');
    setConnecting(true);
    setLogs([]);

    try {
      // Start log watcher before connecting
      await ovpnWatchStart();

      const config: OvpnConfig = {
        profile_path: profilePath,
        username,
        password,
        otp,
      };

      await ovpnConnect(config);

      // Get initial status
      const s = await ovpnStatus(profilePath);
      setStatus(s);

      // Get initial logs
      const initialLogs = await ovpnGetLogs(100);
      setLogs(initialLogs);

      // Start polling
      startPolling();
    } catch (err) {
      setError(String(err));
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError('');
    try {
      await ovpnDisconnect();
      await ovpnWatchStop();
      stopPolling();
      setStatus({
        state: 'disconnected',
        server: '',
        local_ip: '',
        remote_ip: '',
        uptime: '',
        bytes_sent: '',
        bytes_received: '',
        protocol: '',
      });
      setConnecting(false);
      setActiveProfileId(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleSave = () => {
    if (!profilePath || !username) {
      setError('Profile path and username are required to save');
      return;
    }
    const name = prompt('Profile name:', profilePath.split('/').pop()?.replace('.ovpn', '') || 'VPN Profile');
    if (!name) return;

    const profile: SavedProfile = {
      id: Date.now().toString(36),
      name,
      profile_path: profilePath,
      username,
      password,
    };
    saveProfile(profile);
    setSavedProfiles(loadSavedProfiles());
  };

  const handleLoadProfile = (profile: SavedProfile) => {
    setProfilePath(profile.profile_path);
    setUsername(profile.username);
    setPassword(profile.password);
    setActiveProfileId(profile.id);
    setOtp('');
  };

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSavedProfile(id);
    setSavedProfiles(loadSavedProfiles());
    if (activeProfileId === id) setActiveProfileId(null);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleBrowse = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: 'Select OpenVPN Profile',
        filters: [{ name: 'OpenVPN Config', extensions: ['ovpn', 'conf'] }],
        multiple: false,
        directory: false,
      });
      if (selected) {
        setProfilePath(selected as string);
      }
    } catch {
      // fallback: ignore if dialog unavailable
    }
  };

  const isConnected = status?.state === 'connected';

  // Desktop-only guard
  if (!isTauri) {
    return (
      <div className={styles.desktopOnly}>
        <ShieldAlert size={48} />
        <p>OpenVPN Manager requires the desktop app.</p>
        <p>This tool uses systemctl to manage OpenVPN connections.</p>
      </div>
    );
  }

  return (
    <>
      {/* Connection Bar */}
      <div className={styles.connectionBar}>
        <div className={styles.vpnBadge}>
          <ShieldAlert size={14} />
          OPENVPN
        </div>
        <input
          className={styles.profileInput}
          type="text"
          value={profilePath}
          onChange={(e) => setProfilePath(e.target.value)}
          placeholder="Path to profile.ovpn..."
        />
        <div className={styles.actions}>
          <button className={styles.btnAction} onClick={handleBrowse} title="Browse">
            <FolderOpen size={14} />
            BROWSE
          </button>
          <button className={styles.btnAction} onClick={handleSave} title="Save profile">
            <Bookmark size={14} />
            SAVE
          </button>
          {isConnected ? (
            <button
              className={`${styles.btnAction} ${styles.btnDisconnect}`}
              onClick={handleDisconnect}
            >
              <PlugZap size={14} />
              DISCONNECT
            </button>
          ) : (
            <button
              className={`${styles.btnAction} ${styles.btnConnect}`}
              onClick={handleConnect}
              disabled={connecting}
            >
              <Plug size={14} />
              {connecting ? 'CONNECTING...' : 'CONNECT'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--color-error, #FF4444)', fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <X size={14} />
          {error}
        </div>
      )}

      {/* Credential Fields */}
      <div className={styles.fieldsRow}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>// USERNAME</span>
          <div className={styles.fieldInput}>
            <User size={14} />
            <input
              className={styles.fieldInputText}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>// PASSWORD</span>
          <div className={styles.fieldInput}>
            <Lock size={14} />
            <input
              className={styles.fieldInputText}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>// SECURITY CODE</span>
          <div className={styles.fieldInput}>
            <ShieldCheck size={14} />
            <input
              className={styles.fieldInputText}
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="OTP / 2FA code"
            />
          </div>
        </div>
      </div>

      {/* Main Area: Status + Logs */}
      <div className={styles.mainArea}>
        {/* Status Panel */}
        <div className={styles.statusPanel}>
          <div className={styles.statusHeader}>
            <span className={styles.statusLabel}>// STATUS</span>
            <div className={styles.statusDot}>
              <span
                className={`${styles.dot} ${
                  isConnected
                    ? styles.dotConnected
                    : connecting
                    ? styles.dotConnecting
                    : ''
                }`}
              />
              <span className={styles.statusDotText}>
                {isConnected ? 'CONNECTED' : connecting ? 'CONNECTING' : 'DISCONNECTED'}
              </span>
            </div>
          </div>
          <div className={styles.statusBody}>
            <div className={styles.statusRow}>
              <span className={styles.statusKey}>Server</span>
              <span className={styles.statusValue}>{status?.server || '—'}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusKey}>Local IP</span>
              <span className={`${styles.statusValue} ${isConnected ? styles.statusValueAccent : ''}`}>
                {status?.local_ip || '—'}
              </span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusKey}>Remote IP</span>
              <span className={styles.statusValue}>{status?.remote_ip || '—'}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusKey}>Uptime</span>
              <span className={styles.statusValue}>{status?.uptime || '—'}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusKey}>Bytes Sent</span>
              <span className={styles.statusValue}>{status?.bytes_sent || '—'}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusKey}>Bytes Received</span>
              <span className={styles.statusValue}>{status?.bytes_received || '—'}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusKey}>Protocol</span>
              <span className={styles.statusValue}>{status?.protocol || '—'}</span>
            </div>
          </div>
        </div>

        {/* Logs Panel */}
        <div className={styles.logsPanel}>
          <div className={styles.logsHeader}>
            <span className={styles.logsHeaderLeft}>// LOGS</span>
            <div className={styles.logsHeaderRight}>
              {isConnected && <span className={styles.liveBadge}>LIVE</span>}
              <button className={styles.btnClear} onClick={handleClearLogs}>
                <Trash2 size={12} />
                CLEAR
              </button>
            </div>
          </div>
          <div
            className={styles.logsBody}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              setAutoScroll(atBottom);
            }}
          >
            {logs.length === 0 ? (
              <div className={styles.logsEmpty}>
                Logs will appear here when connected...
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`${styles.logLine} ${
                    log.level === 'success'
                      ? styles.logLineSuccess
                      : log.level === 'error'
                      ? styles.logLineError
                      : log.level === 'warn'
                      ? styles.logLineWarn
                      : ''
                  }`}
                >
                  {log.content}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {/* Saved Profiles */}
      <div className={styles.savedSection}>
        <div className={styles.savedHeader} onClick={() => setSavedOpen(!savedOpen)}>
          <div className={`${styles.savedHeaderLeft} ${savedOpen ? styles.savedChevronOpen : styles.savedChevronClosed}`}>
            <ChevronDown size={14} />
            <span className={styles.savedLabel}>// SAVED_PROFILES</span>
          </div>
          <span className={styles.savedBadge}>{savedProfiles.length}</span>
        </div>
        {savedOpen && savedProfiles.length > 0 && (
          <div className={styles.cardsRow}>
            {savedProfiles.map((profile) => (
              <div
                key={profile.id}
                className={`${styles.profileCard} ${activeProfileId === profile.id ? styles.profileCardActive : ''}`}
                onClick={() => handleLoadProfile(profile)}
              >
                <span className={styles.profileCardName}>{profile.name}</span>
                <span className={styles.profileCardPath}>{profile.profile_path}</span>
                <span className={styles.profileCardUser}>{profile.username}</span>
                <button
                  className={styles.profileCardDelete}
                  onClick={(e) => handleDeleteProfile(profile.id, e)}
                  title="Delete profile"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusBarLeft}>
          <span
            className={`${styles.dot} ${isConnected ? styles.dotConnected : ''}`}
          />
          <span className={styles.statusBarText}>
            {isConnected
              ? `CONNECTED — ${status?.local_ip || ''} via ${status?.server || ''}`
              : 'DISCONNECTED'}
          </span>
        </div>
        <span className={styles.statusBarTag}>OPENVPN_MGR</span>
      </div>
    </>
  );
}
