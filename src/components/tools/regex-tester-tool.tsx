import { useState, useEffect } from 'react';
import { ActionButton } from '../shared/action-button';
import { testRegex, parseRegexPattern } from '../../services/regex.service';
import { useHistory } from '../../hooks/use-history';
import type { RegexMatch } from '../../services/regex.service';
import styles from './regex-tester-tool.module.css';

export function RegexTesterTool() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [testString, setTestString] = useState('');
  const [matches, setMatches] = useState<RegexMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { addEntry } = useHistory('regex-tester');

  const handleTest = () => {
    setError(null);
    const parsed = parseRegexPattern(pattern);
    const effectiveFlags = parsed.flags || flags;
    const result = testRegex(parsed.regex, effectiveFlags, testString);

    if (!result.isValid) {
      setError(result.error);
      setMatches([]);
    } else {
      setMatches(result.matches);
      addEntry(
        `/${parsed.regex}/${effectiveFlags}`,
        `${result.matches.length} matches`,
      );
    }
  };

  const handleClear = () => {
    setPattern('');
    setFlags('g');
    setTestString('');
    setMatches([]);
    setError(null);
  };

  // Auto-test on input change
  useEffect(() => {
    if (pattern && testString) {
      const parsed = parseRegexPattern(pattern);
      const effectiveFlags = parsed.flags || flags;
      const result = testRegex(parsed.regex, effectiveFlags, testString);
      if (result.isValid) {
        setMatches(result.matches);
        setError(null);
      } else {
        setError(result.error);
        setMatches([]);
      }
    } else {
      setMatches([]);
      setError(null);
    }
  }, [pattern, flags, testString]);

  return (
    <>
      <div className={styles.patternSection}>
        <span className={styles.label}>// PATTERN</span>
        <div className={styles.patternRow}>
          <div className={styles.patternBox}>
            <input
              className={styles.patternInput}
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="/your-regex-here/flags or just the pattern"
              spellCheck={false}
            />
          </div>
          <div className={styles.flagsBox}>
            <input
              className={styles.flagsInput}
              type="text"
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              placeholder="flags"
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <ActionButton onClick={handleTest}>TEST</ActionButton>
        <ActionButton onClick={handleClear} variant="secondary">
          CLEAR
        </ActionButton>
      </div>

      <div className={styles.testSection}>
        <span className={styles.label}>// TEST_STRING</span>
        <div className={styles.testBox}>
          <textarea
            className={styles.testTextarea}
            value={testString}
            onChange={(e) => setTestString(e.target.value)}
            placeholder="Enter text to test against the regex pattern..."
            rows={4}
            spellCheck={false}
          />
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <span className={styles.errorDot} />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.matchSection}>
        <div className={styles.matchHeader}>
          <span className={styles.label}>// MATCHES ({matches.length})</span>
          {matches.length > 0 && (
            <span className={styles.matchBadge}>{matches.length} MATCHES</span>
          )}
        </div>
        <div className={styles.matchBox}>
          {matches.length === 0 ? (
            <span className={styles.matchEmpty}>
              {pattern ? 'No matches found' : 'Enter a pattern and test string to see matches'}
            </span>
          ) : (
            matches.map((match, i) => (
              <div key={i} className={styles.matchRow}>
                <span className={styles.matchIndex}>[{i}]</span>
                <span className={styles.matchValue}>{match.match}</span>
                {match.groups.length > 0 && (
                  <span className={styles.matchGroups}>
                    → {match.groups.join(', ')}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span className={styles.statusDot} />
          <span className={styles.statusText}>
            {matches.length > 0
              ? `READY — ${matches.length} match${matches.length !== 1 ? 'es' : ''} found`
              : 'READY — Waiting for input'}
          </span>
        </div>
        <span className={styles.statusRight}>REGEX_{flags.toUpperCase() || 'G'}</span>
      </div>
    </>
  );
}
