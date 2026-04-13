import { useState, useEffect } from 'react';
import type { ToolType } from '../../types';
import { TOOLS, TOOL_GROUPS } from '../../types';
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
  Send,
  ChevronDown,
  FileType,
  Lock,
  Database,
  Palette,
  BookOpen,
  Terminal,
  FileCog,
  Radar,
  Globe,
  ShieldCheck,
  Plug,
  Container,
  FileText,
  Cylinder,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './sidebar.module.css';

const ICON_MAP: Record<string, LucideIcon> = {
  'key-round': KeyRound,
  'git-compare': GitCompare,
  'file-code': FileCode,
  'file-type': FileType,
  'file-cog': FileCog,
  'file-text': FileText,
  'book-open': BookOpen,
  'shield-check': ShieldCheck,
  hash: Hash,
  shield: Shield,
  link: Link,
  timer: Timer,
  regex: Regex,
  braces: Braces,
  send: Send,
  lock: Lock,
  database: Database,
  palette: Palette,
  terminal: Terminal,
  radar: Radar,
  globe: Globe,
  plug: Plug,
  container: Container,
  cylinder: Cylinder,
};

interface SidebarProps {
  activeTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
}

export function Sidebar({ activeTool, onToolSelect }: SidebarProps) {
  const activeGroup = TOOLS.find((t) => t.id === activeTool)?.group;

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const group of TOOL_GROUPS) {
      if (group.id !== activeGroup) {
        initial.add(group.id);
      }
    }
    return initial;
  });

  // Auto-expand the group that contains the active tool
  useEffect(() => {
    if (activeGroup && collapsed.has(activeGroup)) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(activeGroup);
        return next;
      });
    }
  }, [activeGroup, collapsed]);

  const toggleGroup = (groupId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.top}>
        {/* Logo */}
        <div className={styles.logo}>
          <svg className={styles.logoMark} viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0,1024) scale(0.1,-0.1)" fill="currentColor">
              <path d="M6335 7846 c246 -68 449 -248 545 -485 36 -88 48 -155 60 -324 20 -284 115 -493 312 -683 128 -124 275 -206 448 -251 76 -19 137 -26 305 -33 283 -12 391 -40 541 -135 129 -83 217 -179 284 -311 57 -113 80 -213 80 -348 -1 -238 -68 -403 -231 -567 -125 -126 -260 -199 -444 -239 -27 -7 -142 -13 -255 -15 -128 -2 -234 -9 -282 -19 -515 -101 -866 -488 -918 -1013 -22 -219 -73 -356 -191 -513 -117 -155 -293 -272 -494 -327 -90 -25 -115 -27 -255 -27 -132 1 -169 5 -251 27 -320 84 -562 319 -650 632 -27 97 -35 268 -16 370 61 335 316 607 645 691 139 35 243 40 392 19 308 -44 568 9 799 162 228 152 393 386 447 636 22 98 21 290 -1 391 -82 384 -389 676 -800 761 -44 9 -165 20 -270 25 -221 11 -271 22 -410 90 -165 82 -279 191 -363 348 -160 302 -102 671 146 919 111 110 233 180 396 224 59 16 96 18 221 15 97 -2 171 -10 210 -20z"/>
              <path d="M8560 7826 c574 -82 1081 -339 1482 -752 255 -263 438 -552 568 -899 179 -477 213 -1026 93 -1530 -110 -465 -356 -906 -703 -1255 -437 -442 -941 -694 -1570 -786 -93 -14 -219 -18 -668 -21 l-553 -5 36 64 c69 120 143 284 179 396 47 146 61 210 80 355 18 136 38 187 96 251 70 76 112 86 353 86 306 0 486 30 705 116 366 142 650 402 822 749 121 246 166 452 157 720 -8 238 -44 392 -138 594 -178 379 -508 667 -900 785 -155 47 -233 58 -474 65 -218 6 -233 8 -285 32 -74 35 -110 67 -144 130 -25 46 -30 67 -37 176 -17 267 -57 418 -165 635 -30 59 -54 110 -54 114 0 3 226 4 503 1 394 -3 527 -8 617 -21z"/>
            </g>
          </svg>
          <span className={styles.logoText}>DEXT</span>
        </div>

        {/* Grouped Navigation */}
        <nav className={styles.nav}>
          {TOOL_GROUPS.map((group) => {
            const groupTools = TOOLS.filter((t) => t.group === group.id);
            const isCollapsed = collapsed.has(group.id);

            return (
              <div key={group.id} className={styles.navGroup}>
                <button
                  className={styles.navGroupHeader}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className={styles.navGroupLabel}>{group.label}</span>
                  <ChevronDown
                    size={12}
                    className={`${styles.navGroupChevron} ${isCollapsed ? styles.navGroupChevronCollapsed : ''}`}
                  />
                </button>

                {!isCollapsed && (
                  <div className={styles.navGroupItems}>
                    {groupTools.map((tool) => {
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
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className={styles.bottom}>
        <div className={styles.localMode}>
          <span className={styles.sectionLabel}>// LOCAL_MODE</span>
          <p className={styles.localDesc}>
            No external backend. All data stays on your machine.
          </p>
          <span className={styles.version}>v2.2.1</span>
        </div>
      </div>
    </aside>
  );
}
