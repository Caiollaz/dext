import type { ToolType } from '../../types';
import { TOOLS } from '../../types';
import {
  KeyRound,
  GitCompare,
  FileCode,
  Hash,
  Shield,
  Link,
  Timer,
  Regex,
  Braces,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './sidebar.module.css';

const ICON_MAP: Record<string, LucideIcon> = {
  'key-round': KeyRound,
  'git-compare': GitCompare,
  'file-code': FileCode,
  hash: Hash,
  shield: Shield,
  link: Link,
  timer: Timer,
  regex: Regex,
  braces: Braces,
};

interface SidebarProps {
  activeTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
}

export function Sidebar({ activeTool, onToolSelect }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.top}>
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoMark}>D</div>
          <span className={styles.logoText}>DEV-TOOLSBOX</span>
        </div>

        {/* System Info */}
        <div className={styles.sysInfo}>
          <span className={styles.sysLabel}>// SYSTEM_STATUS</span>
          <div className={styles.sysRow}>
            <span className={styles.sysKey}>PLATFORM:</span>
            <span className={styles.sysValueAccent}>TAURI</span>
          </div>
          <div className={styles.sysRow}>
            <span className={styles.sysKey}>RUNTIME:</span>
            <span className={styles.sysValue}>LOCAL</span>
          </div>
          <div className={styles.sysRow}>
            <span className={styles.sysKey}>VERSION:</span>
            <span className={styles.sysValue}>v1.0.0</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {TOOLS.map((tool) => {
            const IconComponent = ICON_MAP[tool.icon];
            return (
              <button
                key={tool.id}
                className={`${styles.navItem} ${activeTool === tool.id ? styles.navItemActive : ''}`}
                onClick={() => onToolSelect(tool.id)}
              >
                <span className={styles.navIcon}>
                  {IconComponent ? <IconComponent size={16} /> : tool.icon}
                </span>
                <span className={styles.navText}>{tool.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className={styles.bottom}>
        <div className={styles.localMode}>
          <span className={styles.sysLabel}>// LOCAL_MODE</span>
          <p className={styles.localDesc}>
            No external backend. All data stays on your machine.
          </p>
        </div>
      </div>
    </aside>
  );
}
