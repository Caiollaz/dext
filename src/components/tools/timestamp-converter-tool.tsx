import { useState } from 'react';
import { ActionButton } from '../shared/action-button';
import { CopyButton } from '../shared/copy-button';
import { unixToDate, dateToUnix, getCurrentTimestamp } from '../../services/timestamp.service';
import { useClipboard } from '../../hooks/use-clipboard';
import { useHistory } from '../../hooks/use-history';
import type { TimestampResult } from '../../services/timestamp.service';
import styles from './timestamp-converter-tool.module.css';

export function TimestampConverterTool() {
  const [unixInput, setUnixInput] = useState('');
  const [result, setResult] = useState<TimestampResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copy, copied } = useClipboard();
  const { addEntry } = useHistory('timestamp-converter');

  const handleToDate = () => {
    try {
      setError(null);
      const timestamp = Number(unixInput.trim());
      if (isNaN(timestamp)) throw new Error('Invalid number');
      const res = unixToDate(timestamp);
      setResult(res);
      addEntry(unixInput, res.iso);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setResult(null);
    }
  };

  const handleToUnix = () => {
    try {
      setError(null);
      const res = dateToUnix(unixInput.trim());
      setResult(res);
      addEntry(unixInput, String(res.unix));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setResult(null);
    }
  };

  const handleNow = () => {
    const now = getCurrentTimestamp();
    setUnixInput(String(now));
    const res = unixToDate(now);
    setResult(res);
  };

  return (
    <>
      <div className={styles.inputSection}>
        <span className={styles.label}>// UNIX_TIMESTAMP</span>
        <div className={styles.inputRow}>
          <div className={styles.inputBox}>
            <input
              className={styles.input}
              type="text"
              value={unixInput}
              onChange={(e) => setUnixInput(e.target.value)}
              placeholder="Enter Unix timestamp or date string..."
              spellCheck={false}
            />
          </div>
          <button className={styles.nowButton} onClick={handleNow}>
            NOW
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <ActionButton onClick={handleToDate}>TO DATE</ActionButton>
        <ActionButton onClick={handleToUnix} variant="secondary">
          TO UNIX
        </ActionButton>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorDot} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className={styles.results}>
          <div className={styles.resultRow}>
            <div className={styles.resultHeader}>
              <span className={styles.label}>// ISO_8601</span>
              <CopyButton onClick={() => copy(result.iso)} copied={copied} />
            </div>
            <div className={styles.resultBox}>
              <span className={styles.resultValue}>{result.iso}</span>
            </div>
          </div>

          <div className={styles.resultRow}>
            <div className={styles.resultHeader}>
              <span className={styles.label}>// LOCAL_DATE</span>
              <CopyButton onClick={() => copy(result.local)} copied={copied} />
            </div>
            <div className={styles.resultBox}>
              <span className={styles.resultValue}>{result.local}</span>
            </div>
          </div>

          <div className={styles.resultRow}>
            <div className={styles.resultHeader}>
              <span className={styles.label}>// RELATIVE</span>
              <CopyButton onClick={() => copy(result.relative)} copied={copied} />
            </div>
            <div className={styles.resultBox}>
              <span className={styles.resultValue}>{result.relative}</span>
            </div>
          </div>

          <div className={styles.resultRow}>
            <div className={styles.resultHeader}>
              <span className={styles.label}>// UNIX_SECONDS</span>
              <CopyButton onClick={() => copy(String(result.unix))} copied={copied} />
            </div>
            <div className={styles.resultBox}>
              <span className={styles.resultValue}>{result.unix}</span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>
            {result
              ? 'READY — Converted successfully'
              : 'READY — Waiting for input'}
          </span>
        </div>
        <span className={styles.statusRight}>UNIX_TS</span>
      </div>
    </>
  );
}
