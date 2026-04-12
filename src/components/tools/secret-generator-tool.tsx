import { useState } from 'react';
import { ActionButton } from '../shared/action-button';
import { CopyButton } from '../shared/copy-button';
import { generateSecret, getSecretStrength } from '../../services/secret-generator.service';
import type { SecretType } from '../../services/secret-generator.service';
import { useClipboard } from '../../hooks/use-clipboard';
import styles from './secret-generator-tool.module.css';

const SECRET_TYPES: { id: SecretType; label: string }[] = [
  { id: 'token', label: 'TOKEN' },
  { id: 'password', label: 'PASSWORD' },
  { id: 'api-key', label: 'API KEY' },
  { id: 'jwt-secret', label: 'JWT SECRET' },
];

interface HistoryItem {
  type: SecretType;
  value: string;
  length: number;
  createdAt: Date;
}

export function SecretGeneratorTool() {
  const [secretType, setSecretType] = useState<SecretType>('token');
  const [length, setLength] = useState(32);
  const [current, setCurrent] = useState(() => generateSecret('token', 32));
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const { copy, copied } = useClipboard();

  const strength = getSecretStrength(current);

  const handleGenerate = () => {
    // Save current to history
    if (current) {
      setHistory((prev) =>
        [{ type: secretType, value: current, length, createdAt: new Date() }, ...prev].slice(0, 10),
      );
    }
    setCurrent(generateSecret(secretType, length));
  };

  const handleTypeChange = (type: SecretType) => {
    setSecretType(type);
    setCurrent(generateSecret(type, length));
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <>
      <div className={styles.optionsRow}>
        <div className={styles.optionGroup}>
          <span className={styles.label}>// TYPE</span>
          <div className={styles.tabs}>
            {SECRET_TYPES.map((t) => (
              <button
                key={t.id}
                className={`${styles.tab} ${secretType === t.id ? styles.tabActive : ''}`}
                onClick={() => handleTypeChange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {secretType !== 'api-key' && (
          <div className={styles.optionGroup}>
            <span className={styles.label}>// LENGTH</span>
            <input
              type="number"
              className={styles.lengthInput}
              value={length}
              onChange={(e) => {
                const newLength = Math.max(4, Math.min(256, parseInt(e.target.value) || 32));
                setLength(newLength);
                setCurrent(generateSecret(secretType, newLength));
              }}
              min={4}
              max={256}
            />
          </div>
        )}
      </div>

      <div className={styles.secretSection}>
        <div className={styles.secretHeader}>
          <span className={styles.label}>// GENERATED_SECRET</span>
          <div className={styles.strengthBadge} data-strength={strength}>
            {strength.toUpperCase()}
          </div>
        </div>
        <div className={styles.secretBox}>
          <span className={styles.secretValue}>{current}</span>
          <CopyButton onClick={() => copy(current)} copied={copied} />
        </div>
      </div>

      <div className={styles.actions}>
        <ActionButton onClick={handleGenerate}>REGENERATE</ActionButton>
        <ActionButton onClick={() => copy(current)} variant="secondary">
          {copied ? 'COPIED!' : 'COPY'}
        </ActionButton>
      </div>

      {history.length > 0 && (
        <div className={styles.historySection}>
          <span className={styles.label}>// RECENT_HISTORY</span>
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>TYPE</span>
              <span>SECRET</span>
              <span>WHEN</span>
            </div>
            {history.map((entry, i) => (
              <div
                key={`${entry.value}-${i}`}
                className={styles.tableRow}
                onClick={() => copy(entry.value)}
                title="Click to copy"
              >
                <span className={styles.rowType}>{entry.type.toUpperCase()}</span>
                <span className={styles.rowValue}>
                  {entry.value.length > 40 ? entry.value.slice(0, 40) + '...' : entry.value}
                </span>
                <span className={styles.rowTime}>{getTimeAgo(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>
            READY — {secretType.toUpperCase()} generated ({current.length} chars)
          </span>
        </div>
        <span className={styles.statusRight}>SECRET_GEN</span>
      </div>
    </>
  );
}
