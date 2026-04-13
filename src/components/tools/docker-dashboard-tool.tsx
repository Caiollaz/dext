import { useState, useEffect, useCallback } from 'react';
import { Container, RefreshCw, Loader2, Trash2, HardDrive, Box } from 'lucide-react';
import {
  dockerList,
  dockerStart,
  dockerStop,
  dockerRestart,
  dockerRemove,
  dockerLogs,
  dockerVolumeList,
  dockerVolumeRemove,
  dockerImageList,
  dockerImageRemove,
  isTauriEnvironment,
  getStateColor,
  formatBytes,
} from '../../services/docker-dashboard.service';
import type { ContainerInfo, DockerStats, VolumeInfo, ImageInfo } from '../../services/docker-dashboard.service';
import styles from './docker-dashboard-tool.module.css';

type TabType = 'containers' | 'volumes' | 'images';

export function DockerDashboardTool() {
  const [activeTab, setActiveTab] = useState<TabType>('containers');
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [stats, setStats] = useState<DockerStats | null>(null);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logsContainer, setLogsContainer] = useState<string | null>(null);
  const [logsContent, setLogsContent] = useState<string[]>([]);
  const [isTauri, setIsTauri] = useState<boolean | null>(null);

  useEffect(() => {
    setIsTauri(isTauriEnvironment());
  }, []);

  const fetchContainers = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const [containerList, dockerStats] = await dockerList();
      setContainers(containerList);
      setStats(dockerStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list containers');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVolumes = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const volumeList = await dockerVolumeList();
      setVolumes(volumeList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list volumes');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchImages = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const imageList = await dockerImageList();
      setImages(imageList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list images');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCurrentTab = useCallback(() => {
    if (activeTab === 'containers') return fetchContainers();
    if (activeTab === 'volumes') return fetchVolumes();
    return fetchImages();
  }, [activeTab, fetchContainers, fetchVolumes, fetchImages]);

  // Auto-fetch on mount and tab change (only in Tauri)
  useEffect(() => {
    if (isTauri === true) {
      fetchCurrentTab();
    }
  }, [isTauri, activeTab, fetchCurrentTab]);

  const handleAction = async (containerId: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(containerId);
    try {
      if (action === 'start') await dockerStart(containerId);
      else if (action === 'stop') await dockerStop(containerId);
      else if (action === 'restart') await dockerRestart(containerId);

      await fetchContainers();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} container`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveContainer = async (containerId: string, name: string) => {
    if (!confirm(`Remove container "${name}"? This cannot be undone.`)) return;
    setActionLoading(containerId);
    try {
      await dockerRemove(containerId, true);
      await fetchContainers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove container');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveVolume = async (name: string) => {
    if (!confirm(`Remove volume "${name}"? This cannot be undone.`)) return;
    setActionLoading(name);
    try {
      await dockerVolumeRemove(name, false);
      await fetchVolumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove volume');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveImage = async (imageId: string, tag: string) => {
    if (!confirm(`Remove image "${tag}"? This cannot be undone.`)) return;
    setActionLoading(imageId);
    try {
      await dockerImageRemove(imageId, false);
      await fetchImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove image');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewLogs = async (containerId: string) => {
    if (logsContainer === containerId) {
      setLogsContainer(null);
      setLogsContent([]);
      return;
    }

    try {
      const logs = await dockerLogs(containerId, 100);
      setLogsContainer(containerId);
      setLogsContent(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    }
  };

  const getStateBadgeClass = (state: string): string => {
    const color = getStateColor(state);
    switch (color) {
      case 'running': return styles.stateRunning;
      case 'exited': return styles.stateExited;
      case 'paused': return styles.statePaused;
      case 'restarting': return styles.stateRestarting;
      default: return styles.stateUnknown;
    }
  };

  // ── Desktop-only guard ─────────────────────────────

  if (isTauri === false) {
    return (
      <div className={styles.desktopOnly}>
        <div className={styles.desktopOnlyIcon}>
          <Container size={32} />
        </div>
        <h3 className={styles.desktopOnlyTitle}>DESKTOP ONLY FEATURE</h3>
        <p className={styles.desktopOnlyDesc}>
          Docker Dashboard requires the DEXT desktop app to manage Docker containers.
          Download the app to use this tool.
        </p>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────

  return (
    <>
      {/* Stats Cards */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>RUNNING</span>
            <span className={styles.statValue}>{stats.running}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>STOPPED</span>
            <span className={styles.statValue}>{stats.stopped}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>IMAGES</span>
            <span className={styles.statValue}>{images.length || '—'}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>VOLUMES</span>
            <span className={styles.statValue}>{volumes.length || '—'}</span>
          </div>
        </div>
      )}

      {/* Tabs + Refresh */}
      <div className={styles.tabBar}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'containers' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('containers')}
          >
            <Container size={12} />
            <span>CONTAINERS</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'volumes' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('volumes')}
          >
            <HardDrive size={12} />
            <span>VOLUMES</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'images' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('images')}
          >
            <Box size={12} />
            <span>IMAGES</span>
          </button>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={fetchCurrentTab}
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={14} className={styles.spinner} />
          ) : (
            <RefreshCw size={14} />
          )}
          <span>{loading ? 'LOADING...' : 'REFRESH'}</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error}>
          <span className={styles.errorDot} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Containers Tab ──────────────────────────── */}
      {activeTab === 'containers' && (
        <>
          <div className={styles.containersTable}>
            <div className={styles.tableHeader}>
              <span className={styles.tableHeaderCell}>NAME</span>
              <span className={styles.tableHeaderCell}>IMAGE</span>
              <span className={styles.tableHeaderCell}>STATE</span>
              <span className={styles.tableHeaderCell}>PORTS</span>
              <span className={styles.tableHeaderCell}>ACTIONS</span>
            </div>
            {containers.length === 0 ? (
              <div className={styles.emptyTable}>
                {loading ? 'Loading containers...' : 'No containers found'}
              </div>
            ) : (
              containers.map((c) => (
                <div key={c.id} className={styles.tableRow}>
                  <span className={styles.nameCell} title={c.id}>{c.name}</span>
                  <span className={styles.imageCell} title={c.image}>{c.image}</span>
                  <span className={styles.stateCell}>
                    <span className={`${styles.stateBadge} ${getStateBadgeClass(c.state)}`}>
                      {c.state.toUpperCase()}
                    </span>
                  </span>
                  <span className={styles.portsCell} title={c.ports}>{c.ports}</span>
                  <span className={styles.actionsCell}>
                    {c.state === 'running' ? (
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnStop}`}
                        onClick={() => handleAction(c.id, 'stop')}
                        disabled={actionLoading === c.id}
                      >
                        STOP
                      </button>
                    ) : (
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnStart}`}
                        onClick={() => handleAction(c.id, 'start')}
                        disabled={actionLoading === c.id}
                      >
                        START
                      </button>
                    )}
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnRestart}`}
                      onClick={() => handleAction(c.id, 'restart')}
                      disabled={actionLoading === c.id}
                    >
                      RESTART
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnLogs}`}
                      onClick={() => handleViewLogs(c.id)}
                    >
                      LOGS
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => handleRemoveContainer(c.id, c.name)}
                      disabled={actionLoading === c.id}
                      title="Remove container"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Logs Panel */}
          {logsContainer && (
            <div className={styles.logsPanel}>
              <div className={styles.logsPanelHeader}>
                <span className={styles.logsPanelLabel}>
                  // LOGS — {containers.find((c) => c.id === logsContainer)?.name || logsContainer}
                </span>
                <button
                  className={styles.logsPanelClose}
                  onClick={() => { setLogsContainer(null); setLogsContent([]); }}
                >
                  CLOSE
                </button>
              </div>
              <div className={styles.logsPanelContent}>
                {logsContent.length === 0 ? (
                  <span className={styles.logLine} style={{ color: 'var(--text-muted)' }}>No logs available</span>
                ) : (
                  logsContent.map((line, i) => (
                    <div key={i} className={styles.logLine}>{line}</div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Volumes Tab ─────────────────────────────── */}
      {activeTab === 'volumes' && (
        <div className={styles.containersTable}>
          <div className={styles.volumeHeader}>
            <span className={styles.tableHeaderCell}>NAME</span>
            <span className={styles.tableHeaderCell}>DRIVER</span>
            <span className={styles.tableHeaderCell}>MOUNTPOINT</span>
            <span className={styles.tableHeaderCell}>ACTIONS</span>
          </div>
          {volumes.length === 0 ? (
            <div className={styles.emptyTable}>
              {loading ? 'Loading volumes...' : 'No volumes found'}
            </div>
          ) : (
            volumes.map((v) => (
              <div key={v.name} className={styles.volumeRow}>
                <span className={styles.nameCell} title={v.name}>{v.name}</span>
                <span className={styles.imageCell}>{v.driver}</span>
                <span className={styles.imageCell} title={v.mountpoint}>{v.mountpoint}</span>
                <span className={styles.actionsCell}>
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    onClick={() => handleRemoveVolume(v.name)}
                    disabled={actionLoading === v.name}
                    title="Remove volume"
                  >
                    <Trash2 size={10} />
                    <span>REMOVE</span>
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Images Tab ──────────────────────────────── */}
      {activeTab === 'images' && (
        <div className={styles.containersTable}>
          <div className={styles.imageHeader}>
            <span className={styles.tableHeaderCell}>REPOSITORY</span>
            <span className={styles.tableHeaderCell}>TAG</span>
            <span className={styles.tableHeaderCell}>ID</span>
            <span className={styles.tableHeaderCell}>SIZE</span>
            <span className={styles.tableHeaderCell}>ACTIONS</span>
          </div>
          {images.length === 0 ? (
            <div className={styles.emptyTable}>
              {loading ? 'Loading images...' : 'No images found'}
            </div>
          ) : (
            images.map((img) => {
              const tag = img.repo_tags.length > 0 ? img.repo_tags[0] : '<none>';
              const [repo, tagName] = tag.includes(':') ? tag.split(':') : [tag, 'latest'];
              return (
                <div key={img.id} className={styles.imageRow}>
                  <span className={styles.nameCell} title={repo}>{repo}</span>
                  <span className={styles.imageCell}>{tagName}</span>
                  <span className={styles.imageCell} title={img.id}>{img.id}</span>
                  <span className={styles.imageCell}>{formatBytes(img.size)}</span>
                  <span className={styles.actionsCell}>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={() => handleRemoveImage(img.id, tag)}
                      disabled={actionLoading === img.id}
                      title="Remove image"
                    >
                      <Trash2 size={10} />
                      <span>REMOVE</span>
                    </button>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Status Bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={`${styles.statusDot} ${loading ? styles.statusDotLoading : ''}`} />
          <span className={styles.statusText}>
            {loading
              ? 'LOADING...'
              : activeTab === 'containers' && stats
                ? `READY — ${stats.total} containers (${stats.running} running, ${stats.stopped} stopped)`
                : activeTab === 'volumes'
                  ? `READY — ${volumes.length} volumes`
                  : activeTab === 'images'
                    ? `READY — ${images.length} images`
                    : error
                      ? 'ERROR — Failed to connect to Docker'
                      : 'READY — Connecting to Docker...'}
          </span>
        </div>
        <span className={styles.statusRight}>DOCKER</span>
      </div>
    </>
  );
}
