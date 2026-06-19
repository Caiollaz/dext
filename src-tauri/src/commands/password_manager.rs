//! Local password manager — encrypted vault.
//!
//! Crypto: master password -> Argon2id -> 256-bit key -> XChaCha20-Poly1305 (AEAD).
//! The derived key lives only in process memory (zeroized on lock/drop) and never
//! reaches the frontend. The on-disk vault is a single encrypted JSON envelope.

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

// --- Data types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultItem {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub notes: String,
    /// Base32 TOTP secret (empty = no 2FA on this item)
    #[serde(default)]
    pub totp_secret: String,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KdfParams {
    alg: String,
    m: u32, // memory cost (KiB)
    t: u32, // time cost (iterations)
    p: u32, // parallelism
}

impl Default for KdfParams {
    fn default() -> Self {
        // OWASP-ish baseline for Argon2id: 19 MiB, 2 iterations, 1 lane.
        KdfParams {
            alg: "argon2id".to_string(),
            m: 19_456,
            t: 2,
            p: 1,
        }
    }
}

/// On-disk encrypted envelope.
#[derive(Debug, Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    kdf: KdfParams,
    salt: String,       // base64
    nonce: String,      // base64 (24 bytes, XChaCha20)
    ciphertext: String, // base64
}

// --- In-memory unlocked state ---

struct UnlockedVault {
    key: Zeroizing<Vec<u8>>,
    salt: Vec<u8>,
    kdf: KdfParams,
    items: Vec<VaultItem>,
}

pub struct PwState(Mutex<Option<UnlockedVault>>);

impl PwState {
    pub fn new() -> Self {
        PwState(Mutex::new(None))
    }
}

// --- Helpers ---

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Falha ao resolver app_data_dir: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Falha ao criar dir: {}", e))?;
    Ok(dir.join("vault.json"))
}

fn derive_key(password: &str, salt: &[u8], p: &KdfParams) -> Result<Zeroizing<Vec<u8>>, String> {
    let params =
        Params::new(p.m, p.t, p.p, Some(32)).map_err(|e| format!("Params Argon2: {}", e))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = Zeroizing::new(vec![0u8; 32]);
    argon
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Argon2: {}", e))?;
    Ok(key)
}

fn encrypt_items(key: &[u8], items: &[VaultItem]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let plaintext = serde_json::to_vec(items).map_err(|e| e.to_string())?;
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce), plaintext.as_ref())
        .map_err(|_| "Falha ao cifrar".to_string())?;
    Ok((nonce.to_vec(), ct))
}

fn write_vault(app: &AppHandle, v: &UnlockedVault) -> Result<(), String> {
    let (nonce, ct) = encrypt_items(&v.key, &v.items)?;
    let file = VaultFile {
        version: 1,
        kdf: v.kdf.clone(),
        salt: B64.encode(&v.salt),
        nonce: B64.encode(&nonce),
        ciphertext: B64.encode(&ct),
    };
    let bytes = serde_json::to_vec_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(vault_path(app)?, bytes).map_err(|e| format!("Falha ao gravar: {}", e))?;
    Ok(())
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn gen_id() -> String {
    let mut b = [0u8; 8];
    OsRng.fill_bytes(&mut b);
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

/// Persist the current in-memory vault. Caller holds the lock.
fn persist(app: &AppHandle, guard: &Option<UnlockedVault>) -> Result<(), String> {
    let v = guard.as_ref().ok_or_else(|| "Cofre trancado".to_string())?;
    write_vault(app, v)
}

// --- Commands ---

#[tauri::command]
pub fn pm_vault_exists(app: AppHandle) -> Result<bool, String> {
    Ok(vault_path(&app)?.exists())
}

#[tauri::command]
pub fn pm_is_unlocked(state: State<PwState>) -> bool {
    state.0.lock().map(|g| g.is_some()).unwrap_or(false)
}

#[tauri::command]
pub fn pm_create_vault(
    app: AppHandle,
    state: State<PwState>,
    master_password: String,
) -> Result<(), String> {
    if master_password.len() < 8 {
        return Err("A senha-mestra precisa ter ao menos 8 caracteres".to_string());
    }
    if vault_path(&app)?.exists() {
        return Err("Cofre já existe".to_string());
    }
    let kdf = KdfParams::default();
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(&master_password, &salt, &kdf)?;
    let vault = UnlockedVault {
        key,
        salt: salt.to_vec(),
        kdf,
        items: Vec::new(),
    };
    write_vault(&app, &vault)?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(vault);
    Ok(())
}

#[tauri::command]
pub fn pm_unlock(
    app: AppHandle,
    state: State<PwState>,
    master_password: String,
) -> Result<Vec<VaultItem>, String> {
    let raw = std::fs::read(vault_path(&app)?).map_err(|_| "Cofre não encontrado".to_string())?;
    let file: VaultFile = serde_json::from_slice(&raw).map_err(|e| format!("Cofre corrompido: {}", e))?;
    let salt = B64.decode(&file.salt).map_err(|e| e.to_string())?;
    let nonce = B64.decode(&file.nonce).map_err(|e| e.to_string())?;
    let ct = B64.decode(&file.ciphertext).map_err(|e| e.to_string())?;

    let key = derive_key(&master_password, &salt, &file.kdf)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let plaintext = cipher
        .decrypt(XNonce::from_slice(&nonce), ct.as_ref())
        .map_err(|_| "Senha-mestra incorreta".to_string())?;
    let items: Vec<VaultItem> =
        serde_json::from_slice(&plaintext).map_err(|e| format!("Dados inválidos: {}", e))?;

    let vault = UnlockedVault {
        key,
        salt,
        kdf: file.kdf,
        items: items.clone(),
    };
    *state.0.lock().map_err(|e| e.to_string())? = Some(vault);
    Ok(items)
}

#[tauri::command]
pub fn pm_lock(state: State<PwState>) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None; // key zeroized on drop
    Ok(())
}

#[tauri::command]
pub fn pm_list_items(state: State<PwState>) -> Result<Vec<VaultItem>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let v = guard.as_ref().ok_or_else(|| "Cofre trancado".to_string())?;
    Ok(v.items.clone())
}

#[tauri::command]
pub fn pm_save_item(
    app: AppHandle,
    state: State<PwState>,
    item: VaultItem,
) -> Result<VaultItem, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let v = guard.as_mut().ok_or_else(|| "Cofre trancado".to_string())?;
    let mut item = item;
    let now = now_iso();
    if item.id.is_empty() {
        item.id = gen_id();
        item.created = now.clone();
        item.updated = now;
        v.items.push(item.clone());
    } else {
        item.updated = now;
        match v.items.iter_mut().find(|i| i.id == item.id) {
            Some(existing) => {
                if item.created.is_empty() {
                    item.created = existing.created.clone();
                }
                *existing = item.clone();
            }
            None => {
                if item.created.is_empty() {
                    item.created = item.updated.clone();
                }
                v.items.push(item.clone());
            }
        }
    }
    persist(&app, &guard)?;
    Ok(item)
}

#[tauri::command]
pub fn pm_delete_item(app: AppHandle, state: State<PwState>, id: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    {
        let v = guard.as_mut().ok_or_else(|| "Cofre trancado".to_string())?;
        v.items.retain(|i| i.id != id);
    }
    persist(&app, &guard)
}

#[tauri::command]
pub fn pm_change_master(
    app: AppHandle,
    state: State<PwState>,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < 8 {
        return Err("A senha-mestra precisa ter ao menos 8 caracteres".to_string());
    }
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let v = guard.as_mut().ok_or_else(|| "Cofre trancado".to_string())?;
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    v.salt = salt.to_vec();
    v.kdf = KdfParams::default();
    v.key = derive_key(&new_password, &v.salt, &v.kdf)?;
    persist(&app, &guard)
}

#[tauri::command]
pub fn pm_generate_totp(secret: String) -> Result<String, String> {
    use totp_rs::{Algorithm as TAlg, Secret, TOTP};
    let bytes = Secret::Encoded(secret.replace(' ', ""))
        .to_bytes()
        .map_err(|_| "Segredo TOTP inválido (base32)".to_string())?;
    let totp = TOTP::new(TAlg::SHA1, 6, 1, 30, bytes, None, "dext".to_string())
        .map_err(|e| e.to_string())?;
    totp.generate_current().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pm_generate_password(
    length: usize,
    upper: bool,
    lower: bool,
    digits: bool,
    symbols: bool,
) -> Result<String, String> {
    let mut charset = String::new();
    if upper {
        charset.push_str("ABCDEFGHJKLMNPQRSTUVWXYZ");
    }
    if lower {
        charset.push_str("abcdefghijkmnpqrstuvwxyz");
    }
    if digits {
        charset.push_str("23456789");
    }
    if symbols {
        charset.push_str("!@#$%^&*()-_=+[]{};:,.?");
    }
    if charset.is_empty() {
        return Err("Selecione ao menos um conjunto de caracteres".to_string());
    }
    let len = length.clamp(4, 256);
    let chars: Vec<char> = charset.chars().collect();
    let mut out = String::with_capacity(len);
    for _ in 0..len {
        let idx = (OsRng.next_u32() as usize) % chars.len();
        out.push(chars[idx]);
    }
    Ok(out)
}

/// Import a Bitwarden unencrypted JSON export. Maps `login` items.
#[tauri::command]
pub fn pm_import_bitwarden(
    app: AppHandle,
    state: State<PwState>,
    json: String,
) -> Result<usize, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("JSON inválido: {}", e))?;
    let items = parsed
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Export do Bitwarden sem campo 'items'".to_string())?;

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let count = {
        let v = guard.as_mut().ok_or_else(|| "Cofre trancado".to_string())?;
        let now = now_iso();
        let mut count = 0usize;
        for it in items {
            let login = it.get("login");
            let username = login
                .and_then(|l| l.get("username"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let password = login
                .and_then(|l| l.get("password"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let totp = login
                .and_then(|l| l.get("totp"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let url = login
                .and_then(|l| l.get("uris"))
                .and_then(|u| u.as_array())
                .and_then(|a| a.first())
                .and_then(|f| f.get("uri"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            // Skip non-login items (cards/notes/identities) for MVP
            if login.is_none() && username.is_empty() && password.is_empty() {
                continue;
            }
            let name = it
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("(sem nome)")
                .to_string();
            let notes = it
                .get("notes")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            v.items.push(VaultItem {
                id: gen_id(),
                name,
                username,
                password,
                url,
                notes,
                totp_secret: totp,
                created: now.clone(),
                updated: now.clone(),
            });
            count += 1;
        }
        if count == 0 {
            return Err("Nenhum item de login encontrado no export".to_string());
        }
        count
    };
    persist(&app, &guard)?;
    Ok(count)
}
