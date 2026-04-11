import { useState } from 'react';
import { InputArea } from '../shared/input-area';
import { OutputArea } from '../shared/output-area';
import { ActionButton } from '../shared/action-button';
import { beautifyJson, minifyJson, validateJson } from '../../services/json-formatter.service';
import { useHistory } from '../../hooks/use-history';
import styles from './json-formatter-tool.module.css';

export function JsonFormatterTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { addEntry } = useHistory('json-formatter');

  const handleBeautify = () => {
    try {
      setError(null);
      const result = beautifyJson(input);
      setOutput(result.output);
      setStatus(`Beautified (${result.lines} lines, ${result.bytes} bytes)`);
      addEntry(input, result.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Beautify failed');
      setOutput('');
      setStatus('');
    }
  };

  const handleMinify = () => {
    try {
      setError(null);
      const result = minifyJson(input);
      setOutput(result.output);
      setStatus(`Minified (${result.bytes} bytes)`);
      addEntry(input, result.output);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Minify failed');
      setOutput('');
      setStatus('');
    }
  };

  const handleValidate = () => {
    const result = validateJson(input);
    if (result.valid) {
      setError(null);
      setStatus('Valid JSON');
    } else {
      setError(result.error || 'Invalid JSON');
      setStatus('');
    }
  };

  return (
    <>
      <InputArea
        label="INPUT"
        value={input}
        onChange={setInput}
        placeholder='Paste your JSON here... e.g. {"key": "value"}'
        rows={8}
      />

      <div className={styles.actions}>
        <ActionButton onClick={handleBeautify}>BEAUTIFY</ActionButton>
        <ActionButton onClick={handleMinify} variant="secondary">
          MINIFY
        </ActionButton>
        <ActionButton onClick={handleValidate} variant="secondary">
          VALIDATE
        </ActionButton>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorDot} />
          <span>{error}</span>
        </div>
      )}

      <OutputArea label="OUTPUT" value={output} />

      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>
            {status
              ? `READY — ${status}`
              : 'READY — Waiting for input'}
          </span>
        </div>
        <span className={styles.statusRight}>JSON_FMT</span>
      </div>
    </>
  );
}
