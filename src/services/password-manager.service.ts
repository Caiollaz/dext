/**
 * Password Manager service — talks to the Rust backend (desktop only).
 *
 * The encrypted vault and the derived key live entirely in the Rust process.
 * This layer only invokes Tauri commands; no secret material is persisted in JS.
 */

export interface VaultItem {
  id: string;
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  totp_secret: string;
  created: string;
  updated: string;
}

export function emptyItem(): VaultItem {
  return {
    id: '',
    name: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    totp_secret: '',
    created: '',
    updated: '',
  };
}

async function getTauriInvoke(): Promise<typeof import('@tauri-apps/api/core').invoke | null> {
  try {
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke;
  } catch {
    return null;
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('O gerenciador de senhas requer o app desktop');
  return invoke<T>(cmd, args);
}

export const pmVaultExists = () => call<boolean>('pm_vault_exists');
export const pmIsUnlocked = () => call<boolean>('pm_is_unlocked');
export const pmCreateVault = (masterPassword: string) =>
  call<void>('pm_create_vault', { masterPassword });
export const pmUnlock = (masterPassword: string) =>
  call<VaultItem[]>('pm_unlock', { masterPassword });
export const pmLock = () => call<void>('pm_lock');
export const pmListItems = () => call<VaultItem[]>('pm_list_items');
export const pmSaveItem = (item: VaultItem) => call<VaultItem>('pm_save_item', { item });
export const pmDeleteItem = (id: string) => call<void>('pm_delete_item', { id });
export const pmChangeMaster = (newPassword: string) =>
  call<void>('pm_change_master', { newPassword });
export const pmGenerateTotp = (secret: string) =>
  call<string>('pm_generate_totp', { secret });
export const pmImportBitwarden = (json: string) =>
  call<number>('pm_import_bitwarden', { json });

export interface PwGenOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}

export const pmGeneratePassword = (o: PwGenOptions) =>
  call<string>('pm_generate_password', {
    length: o.length,
    upper: o.upper,
    lower: o.lower,
    digits: o.digits,
    symbols: o.symbols,
  });

/** Copy text to clipboard and auto-clear after `clearMs` (default 15s). */
export async function copyWithAutoClear(text: string, clearMs = 15_000): Promise<void> {
  await navigator.clipboard.writeText(text);
  window.setTimeout(() => {
    navigator.clipboard.readText().then(
      (current) => {
        if (current === text) navigator.clipboard.writeText('').catch(() => {});
      },
      () => {
        // readText may be blocked; best-effort clear
        navigator.clipboard.writeText('').catch(() => {});
      },
    );
  }, clearMs);
}
