import { useState } from 'react';
import { InputArea } from '../shared/input-area';
import { ActionButton } from '../shared/action-button';
import { CopyButton } from '../shared/copy-button';
import { generateHashes } from '../../services/hash.service';
import { useClipboard } from '../../hooks/use-clipboard';
import { useHistory } from '../../hooks/use-history';
import type { HashResult } from '../../services/hash.service';
import styles from './hash-generator-tool.module.css';

export function HashGeneratorTool() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<HashResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { copy, copied } = useClipboard();
  const { addEntry } = useHistory('hash-generator');

  const handleGenerate = async () => {
    try {
      setError(null);
      const hashes = await generateHashes(input);
      setResults(hashes);
      addEntry(input, hashes.map((h) => `${h.algorithm}: ${h.hash}`).join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hash generation failed');
      setResults([]);
    }
  };

  return (
    <>
      <InputArea
        label="INPUT"
        value={input}
        onChange={setInput}
        placeholder="Enter text to generate hashes..."
        rows={3}
      />

      <div className={styles.actions}>
        <ActionButton onClick={handleGenerate}>GENERATE</ActionButton>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorDot} />
          <span>{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((result) => (
            <div key={result.algorithm} className={styles.hashRow}>
              <div className={styles.hashHeader}>
                <span className={styles.hashLabel}>// {result.algorithm}</span>
                <CopyButton onClick={() => copy(result.hash)} copied={copied} />
              </div>
              <div className={styles.hashBox}>
                <span className={styles.hashValue}>{result.hash}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>
            {results.length > 0
              ? 'READY — Hashes generated successfully'
              : 'READY — Waiting for input'}
          </span>
        </div>
        <span className={styles.statusRight}>HASH_SHA256</span>
      </div>
    </>
  );
}
