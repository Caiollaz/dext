import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LockKeyhole,
  Lock,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Upload,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import {
  pmVaultExists,
  pmIsUnlocked,
  pmCreateVault,
  pmUnlock,
  pmLock,
  pmListItems,
  pmSaveItem,
  pmDeleteItem,
  pmGenerateTotp,
  pmGeneratePassword,
  pmImportBitwarden,
  copyWithAutoClear,
  emptyItem,
  type VaultItem,
} from '../../services/password-manager.service';
import styles from './password-manager-tool.module.css';

const isTauri =
  typeof window !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  '__TAURI_INTERNALS__' in (window as any);

type Mode = 'loading' | 'create' | 'locked' | 'unlocked';

export function PasswordManagerTool() {
  const [mode, setMode] = useState<Mode>('loading');
  const [master, setMaster] = useState('');
  const [master2, setMaster2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const [items, setItems] = useState<VaultItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VaultItem | null>(null);
  const [showPw, setShowPw] = useState(false);

  // generator
  const [showGen, setShowGen] = useState(false);
  const [genLength, setGenLength] = useState(20);
  const [genUpper, setGenUpper] = useState(true);
  const [genLower, setGenLower] = useState(true);
  const [genDigits, setGenDigits] = useState(true);
  const [genSymbols, setGenSymbols] = useState(true);

  // totp (selected item)
  const [totpCode, setTotpCode] = useState('');
  const [totpRemaining, setTotpRemaining] = useState(30);

  const fileRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2500);
  }, []);

  // --- Initial load ---
  useEffect(() => {
    if (!isTauri) {
      setMode('locked');
      return;
    }
    (async () => {
      try {
        if (await pmIsUnlocked()) {
          setItems(await pmListItems());
          setMode('unlocked');
          return;
        }
        const exists = await pmVaultExists();
        setMode(exists ? 'locked' : 'create');
      } catch (e) {
        setError(String(e));
        setMode('locked');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    setItems(await pmListItems());
  }, []);

  // --- TOTP ticker for selected item ---
  const selected = items.find((i) => i.id === selectedId) || null;
  useEffect(() => {
    if (mode !== 'unlocked' || !selected?.totp_secret) {
      setTotpCode('');
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const code = await pmGenerateTotp(selected.totp_secret);
        if (!cancelled) setTotpCode(code);
      } catch {
        if (!cancelled) setTotpCode('erro');
      }
    };
    tick();
    const id = window.setInterval(() => {
      const rem = 30 - (Math.floor(Date.now() / 1000) % 30);
      setTotpRemaining(rem);
      if (rem === 30) tick();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [mode, selected?.id, selected?.totp_secret]);

  // --- Actions ---
  const handleCreate = async () => {
    setError('');
    if (master.length < 8) return setError('Senha-mestra: mínimo 8 caracteres');
    if (master !== master2) return setError('As senhas não conferem');
    setBusy(true);
    try {
      await pmCreateVault(master);
      setMaster('');
      setMaster2('');
      setItems([]);
      setMode('unlocked');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setError('');
    setBusy(true);
    try {
      const list = await pmUnlock(master);
      setMaster('');
      setItems(list);
      setMode('unlocked');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleLock = async () => {
    try {
      await pmLock();
    } catch {
      /* ignore */
    }
    setItems([]);
    setSelectedId(null);
    setDraft(null);
    setMode('locked');
  };

  const selectItem = (it: VaultItem) => {
    setSelectedId(it.id);
    setDraft({ ...it });
    setShowPw(false);
  };

  const newItem = () => {
    setSelectedId(null);
    setDraft(emptyItem());
    setShowPw(true);
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return flash('Dê um nome ao item');
    setBusy(true);
    try {
      const saved = await pmSaveItem(draft);
      await refresh();
      setSelectedId(saved.id);
      setDraft({ ...saved });
      flash('Salvo');
    } catch (e) {
      flash(String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async () => {
    if (!draft?.id) {
      setDraft(null);
      setSelectedId(null);
      return;
    }
    if (!confirm(`Excluir "${draft.name}"?`)) return;
    setBusy(true);
    try {
      await pmDeleteItem(draft.id);
      await refresh();
      setSelectedId(null);
      setDraft(null);
      flash('Excluído');
    } catch (e) {
      flash(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    if (!text) return;
    try {
      await copyWithAutoClear(text);
      flash(`${label} copiado (limpa em 15s)`);
    } catch {
      flash('Falha ao copiar');
    }
  };

  const generateInto = async () => {
    try {
      const pw = await pmGeneratePassword({
        length: genLength,
        upper: genUpper,
        lower: genLower,
        digits: genDigits,
        symbols: genSymbols,
      });
      if (draft) setDraft({ ...draft, password: pw });
      setShowPw(true);
      setShowGen(false);
      flash('Senha gerada');
    } catch (e) {
      flash(String(e));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const n = await pmImportBitwarden(text);
      await refresh();
      flash(`${n} itens importados`);
    } catch (err) {
      flash(String(err));
    } finally {
      setBusy(false);
    }
  };

  const filtered = items
    .filter((i) => {
      const q = query.toLowerCase();
      return (
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.username.toLowerCase().includes(q) ||
        i.url.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // --- Render ---
  if (!isTauri) {
    return (
      <div className={styles.fallback}>
        <LockKeyhole size={40} />
        <p>O gerenciador de senhas requer o app desktop.</p>
      </div>
    );
  }

  if (mode === 'loading') {
    return <div className={styles.fallback}>Carregando cofre…</div>;
  }

  if (mode === 'create' || mode === 'locked') {
    const creating = mode === 'create';
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard}>
          <LockKeyhole size={32} className={styles.gateIcon} />
          <h2 className={styles.gateTitle}>{creating ? 'CRIAR COFRE' : 'DESTRANCAR COFRE'}</h2>
          <p className={styles.gateDesc}>
            {creating
              ? 'Defina a senha-mestra. Ela deriva a chave (Argon2id) que cifra o cofre. Não há recuperação — se esquecer, perde tudo.'
              : 'Digite a senha-mestra para abrir o cofre.'}
          </p>
          <span className={styles.fieldLabel}>// SENHA_MESTRA</span>
          <input
            className={styles.input}
            type="password"
            value={master}
            autoFocus
            onChange={(e) => setMaster(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !creating) handleUnlock();
            }}
            placeholder="••••••••"
          />
          {creating && (
            <>
              <span className={styles.fieldLabel}>// CONFIRMAR</span>
              <input
                className={styles.input}
                type="password"
                value={master2}
                onChange={(e) => setMaster2(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                placeholder="••••••••"
              />
            </>
          )}
          {error && <div className={styles.error}>{error}</div>}
          <button
            className={styles.primaryBtn}
            disabled={busy}
            onClick={creating ? handleCreate : handleUnlock}
          >
            {busy ? '…' : creating ? 'Criar cofre' : 'Destrancar'}
          </button>
        </div>
      </div>
    );
  }

  // unlocked
  return (
    <div className={styles.vault}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
          />
        </div>
        <button className={styles.iconBtn} onClick={newItem} title="Novo item">
          <Plus size={16} />
        </button>
        <button
          className={styles.iconBtn}
          onClick={() => fileRef.current?.click()}
          title="Importar export JSON do Bitwarden"
        >
          <Upload size={16} />
        </button>
        <button className={styles.iconBtn} onClick={handleLock} title="Trancar cofre">
          <Lock size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
      </div>

      <div className={styles.body}>
        {/* List */}
        <div className={styles.list}>
          {filtered.length === 0 && (
            <div className={styles.empty}>{items.length === 0 ? 'Cofre vazio' : 'Nada encontrado'}</div>
          )}
          {filtered.map((it) => (
            <button
              key={it.id}
              className={`${styles.listItem} ${selectedId === it.id ? styles.listItemActive : ''}`}
              onClick={() => selectItem(it)}
            >
              <span className={styles.itemName}>{it.name || '(sem nome)'}</span>
              <span className={styles.itemUser}>{it.username}</span>
              {it.totp_secret && <KeyRound size={12} className={styles.totpBadge} />}
            </button>
          ))}
        </div>

        {/* Detail / edit */}
        <div className={styles.detail}>
          {!draft ? (
            <div className={styles.detailEmpty}>Selecione ou crie um item</div>
          ) : (
            <>
              <span className={styles.fieldLabel}>// NOME</span>
              <input
                className={styles.input}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex: GitHub"
              />

              <span className={styles.fieldLabel}>// USUÁRIO</span>
              <div className={styles.fieldRow}>
                <input
                  className={styles.input}
                  value={draft.username}
                  onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                  placeholder="usuário / email"
                />
                <button className={styles.miniBtn} onClick={() => copy(draft.username, 'Usuário')}>
                  <Copy size={14} />
                </button>
              </div>

              <span className={styles.fieldLabel}>// SENHA</span>
              <div className={styles.fieldRow}>
                <input
                  className={styles.input}
                  type={showPw ? 'text' : 'password'}
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  placeholder="senha"
                />
                <button className={styles.miniBtn} onClick={() => setShowPw((s) => !s)}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button className={styles.miniBtn} onClick={() => setShowGen((s) => !s)} title="Gerar senha">
                  <RefreshCw size={14} />
                </button>
                <button className={styles.miniBtn} onClick={() => copy(draft.password, 'Senha')}>
                  <Copy size={14} />
                </button>
              </div>

              {showGen && (
                <div className={styles.genPanel}>
                  <label className={styles.genRow}>
                    Tamanho: {genLength}
                    <input
                      type="range"
                      min={8}
                      max={64}
                      value={genLength}
                      onChange={(e) => setGenLength(Number(e.target.value))}
                    />
                  </label>
                  <div className={styles.genChecks}>
                    <label><input type="checkbox" checked={genUpper} onChange={(e) => setGenUpper(e.target.checked)} /> A-Z</label>
                    <label><input type="checkbox" checked={genLower} onChange={(e) => setGenLower(e.target.checked)} /> a-z</label>
                    <label><input type="checkbox" checked={genDigits} onChange={(e) => setGenDigits(e.target.checked)} /> 0-9</label>
                    <label><input type="checkbox" checked={genSymbols} onChange={(e) => setGenSymbols(e.target.checked)} /> !@#</label>
                  </div>
                  <button className={styles.primaryBtn} onClick={generateInto}>Gerar e aplicar</button>
                </div>
              )}

              <span className={styles.fieldLabel}>// URL</span>
              <div className={styles.fieldRow}>
                <input
                  className={styles.input}
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://…"
                />
                {draft.url && (
                  <button
                    className={styles.miniBtn}
                    onClick={() => window.open(draft.url, '_blank')}
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>

              <span className={styles.fieldLabel}>// TOTP SECRET (base32)</span>
              <input
                className={styles.input}
                value={draft.totp_secret}
                onChange={(e) => setDraft({ ...draft, totp_secret: e.target.value })}
                placeholder="JBSWY3DP… (opcional, 2FA)"
              />
              {selected?.id === draft.id && draft.totp_secret && totpCode && (
                <div className={styles.totpRow}>
                  <span className={styles.totpCode}>{totpCode}</span>
                  <span className={styles.totpTimer}>{totpRemaining}s</span>
                  <button className={styles.miniBtn} onClick={() => copy(totpCode, 'Código')}>
                    <Copy size={14} />
                  </button>
                </div>
              )}

              <span className={styles.fieldLabel}>// NOTAS</span>
              <textarea
                className={styles.textarea}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="notas…"
                rows={3}
              />

              <div className={styles.detailActions}>
                <button className={styles.primaryBtn} disabled={busy} onClick={saveDraft}>
                  Salvar
                </button>
                <button className={styles.dangerBtn} disabled={busy} onClick={deleteDraft}>
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
