use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

// --- Data Types ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OvpnConfig {
    pub profile_path: String,
    pub username: String,
    pub password: String,
    pub otp: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OvpnStatus {
    pub state: String,         // "connected", "disconnected", "connecting", "error"
    pub server: String,
    pub local_ip: String,
    pub remote_ip: String,
    pub uptime: String,
    pub bytes_sent: String,
    pub bytes_received: String,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OvpnLogLine {
    pub content: String,
    pub level: String, // "info", "success", "error", "warn"
}

// --- State ---

struct OvpnWatchState {
    _cancel_tx: mpsc::Sender<()>,
}

// --- Helper functions ---

/// Create a temporary auth file with username and password+otp
async fn write_auth_file(username: &str, password: &str, otp: &str) -> Result<String, String> {
    let auth_path = "/tmp/dext-ovpn-auth".to_string();
    let auth_content = format!("{}\n{}{}\n", username, password, otp);
    tokio::fs::write(&auth_path, &auth_content)
        .await
        .map_err(|e| format!("Failed to write auth file: {}", e))?;

    // Restrict permissions to owner only
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&auth_path, perms)
            .map_err(|e| format!("Failed to set auth file permissions: {}", e))?;
    }

    Ok(auth_path)
}

/// Remove the temporary auth file
async fn cleanup_auth_file() {
    let _ = tokio::fs::remove_file("/tmp/dext-ovpn-auth").await;
}

/// Parse the .ovpn profile to extract remote server info
async fn parse_profile_remote(profile_path: &str) -> (String, String) {
    let content = tokio::fs::read_to_string(profile_path).await.unwrap_or_default();
    let mut server = String::new();
    let mut protocol = String::from("UDP");

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("remote ") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                server = parts[1].to_string();
            }
        }
        if trimmed.starts_with("proto ") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                protocol = parts[1].to_uppercase();
            }
        }
    }

    (server, protocol)
}

/// Get the service name used for systemctl
fn service_name() -> &'static str {
    "openvpn-client@dext-vpn"
}

/// Prepare an OpenVPN config file in /etc/openvpn/client/ for systemd
async fn setup_systemd_config(profile_path: &str, auth_path: &str) -> Result<(), String> {
    // Read the original profile
    let original = tokio::fs::read_to_string(profile_path)
        .await
        .map_err(|e| format!("Failed to read profile: {}", e))?;

    // Build modified config: strip any existing auth-user-pass and add ours
    let mut lines: Vec<String> = original
        .lines()
        .filter(|l| !l.trim().starts_with("auth-user-pass"))
        .map(|l| l.to_string())
        .collect();

    lines.push(format!("auth-user-pass {}", auth_path));

    let config_content = lines.join("\n");
    let tmp_config = "/tmp/dext-vpn.conf";

    tokio::fs::write(tmp_config, &config_content)
        .await
        .map_err(|e| format!("Failed to write temp config: {}", e))?;

    // Copy to /etc/openvpn/client/ using sudo
    let output = tokio::process::Command::new("sudo")
        .args(["cp", tmp_config, "/etc/openvpn/client/dext-vpn.conf"])
        .output()
        .await
        .map_err(|e| format!("Failed to copy config: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("sudo cp failed: {}", stderr));
    }

    let _ = tokio::fs::remove_file(tmp_config).await;
    Ok(())
}

/// Get bytes from /proc/net/dev for the tun interface
fn get_tun_bytes() -> (String, String) {
    let content = std::fs::read_to_string("/proc/net/dev").unwrap_or_default();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("tun") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 10 {
                let rx = parts[1].parse::<u64>().unwrap_or(0);
                let tx = parts[9].parse::<u64>().unwrap_or(0);
                return (format_bytes(tx), format_bytes(rx));
            }
        }
    }
    ("0 B".to_string(), "0 B".to_string())
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

/// Get local IP from tun interface
async fn get_tun_ip() -> String {
    let output = tokio::process::Command::new("ip")
        .args(["addr", "show", "dev", "tun0"])
        .output()
        .await;

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("inet ") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    // Remove CIDR suffix like /24
                    return parts[1].split('/').next().unwrap_or("").to_string();
                }
            }
        }
    }
    String::new()
}

// --- openvpn3 integration ---

/// Try to get session info from `openvpn3 sessions-list`
/// Returns Some(OvpnStatus) if an active session is found
async fn get_openvpn3_status() -> Option<OvpnStatus> {
    let output = tokio::process::Command::new("openvpn3")
        .args(["sessions-list"])
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse the sessions-list output:
    //         Path: /net/openvpn/v3/sessions/...
    //      Created: 2026-04-13 13:44:57                       PID: 63766
    //        Owner: ti-17                                  Device: tun0
    //  Config name: /home/ti-17/vpn-profile.ovpn
    // Connected to: udp:15.229.213.158:1592
    //       Status: Connection, Client connected

    let mut session_path = String::new();
    let mut server = String::new();
    let mut protocol = String::new();
    let mut _config_name = String::new();
    let mut device = String::new();
    let mut status_text = String::new();
    let mut created = String::new();

    for line in stdout.lines() {
        let trimmed = line.trim();

        if let Some(val) = trimmed.strip_prefix("Path:") {
            session_path = val.trim().to_string();
        } else if let Some(val) = trimmed.strip_prefix("Created:") {
            // "2026-04-13 13:44:57                       PID: 63766"
            // Take just the timestamp part
            let parts: Vec<&str> = val.split("PID:").collect();
            created = parts[0].trim().to_string();
        } else if trimmed.starts_with("Owner:") {
            // "ti-17                                  Device: tun0"
            if let Some(dev_part) = trimmed.split("Device:").nth(1) {
                device = dev_part.trim().to_string();
            }
        } else if let Some(val) = trimmed.strip_prefix("Config name:") {
            _config_name = val.trim().to_string();
        } else if let Some(val) = trimmed.strip_prefix("Connected to:") {
            // "udp:15.229.213.158:1592"
            let conn = val.trim().to_string();
            // Parse protocol and server
            let parts: Vec<&str> = conn.splitn(2, ':').collect();
            if parts.len() == 2 {
                protocol = parts[0].to_uppercase();
                // server part: "15.229.213.158:1592"
                server = parts[1].to_string();
            } else {
                server = conn;
            }
        } else if let Some(val) = trimmed.strip_prefix("Status:") {
            status_text = val.trim().to_string();
        }
    }

    // No session found
    if session_path.is_empty() {
        return None;
    }

    // Check if status indicates connected
    let is_connected = status_text.contains("Client connected");
    if !is_connected {
        return None;
    }

    // Get device-specific info
    let local_ip = if !device.is_empty() {
        get_device_ip(&device).await
    } else {
        get_tun_ip().await
    };

    let (bytes_sent, bytes_received) = if !device.is_empty() {
        get_device_bytes(&device)
    } else {
        get_tun_bytes()
    };

    // Compute uptime from created timestamp
    let uptime = compute_uptime(&created);

    // Get stats from openvpn3 if session path is available
    let stats = get_openvpn3_stats(&session_path).await;
    let (final_bytes_sent, final_bytes_received) = if stats.is_some() {
        let (s, r) = stats.unwrap();
        if !s.is_empty() { (s, r) } else { (bytes_sent, bytes_received) }
    } else {
        (bytes_sent, bytes_received)
    };

    Some(OvpnStatus {
        state: "connected".to_string(),
        server,
        local_ip,
        remote_ip: String::new(), // openvpn3 doesn't expose remote IP separately
        uptime,
        bytes_sent: final_bytes_sent,
        bytes_received: final_bytes_received,
        protocol,
    })
}

/// Get IP address for a specific network device
async fn get_device_ip(device: &str) -> String {
    let output = tokio::process::Command::new("ip")
        .args(["addr", "show", "dev", device])
        .output()
        .await;

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("inet ") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    return parts[1].split('/').next().unwrap_or("").to_string();
                }
            }
        }
    }
    String::new()
}

/// Get bytes from /proc/net/dev for a specific device
fn get_device_bytes(device: &str) -> (String, String) {
    let content = std::fs::read_to_string("/proc/net/dev").unwrap_or_default();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&format!("{}:", device)) || trimmed.starts_with(device) {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 10 {
                let rx = parts[1].parse::<u64>().unwrap_or(0);
                let tx = parts[9].parse::<u64>().unwrap_or(0);
                return (format_bytes(tx), format_bytes(rx));
            }
        }
    }
    ("0 B".to_string(), "0 B".to_string())
}

/// Compute uptime from a timestamp string like "2026-04-13 13:44:57"
fn compute_uptime(created: &str) -> String {
    if created.is_empty() {
        return String::new();
    }
    if let Ok(start) = chrono::NaiveDateTime::parse_from_str(created, "%Y-%m-%d %H:%M:%S") {
        let now = chrono::Local::now().naive_local();
        let duration = now.signed_duration_since(start);
        let secs = duration.num_seconds();
        if secs < 0 {
            return String::new();
        }
        let h = secs / 3600;
        let m = (secs % 3600) / 60;
        let s = secs % 60;
        format!("{}h {:02}m {:02}s", h, m, s)
    } else {
        String::new()
    }
}

/// Get byte stats from `openvpn3 session-stats`
async fn get_openvpn3_stats(session_path: &str) -> Option<(String, String)> {
    let output = tokio::process::Command::new("openvpn3")
        .args(["session-stats", "--session-path", session_path])
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut bytes_in: u64 = 0;
    let mut bytes_out: u64 = 0;

    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("BYTES_IN") {
            bytes_in = val.trim().parse().unwrap_or(0);
        } else if let Some(val) = trimmed.strip_prefix("BYTES_OUT") {
            bytes_out = val.trim().parse().unwrap_or(0);
        }
    }

    if bytes_in > 0 || bytes_out > 0 {
        Some((format_bytes(bytes_out), format_bytes(bytes_in)))
    } else {
        None
    }
}

// --- Tauri Commands ---

#[tauri::command]
pub async fn ovpn_connect(config: OvpnConfig) -> Result<String, String> {
    // Validate profile exists
    if !std::path::Path::new(&config.profile_path).exists() {
        return Err(format!("Profile not found: {}", config.profile_path));
    }

    // Create auth file
    let auth_path = write_auth_file(&config.username, &config.password, &config.otp).await?;

    // Setup systemd config
    setup_systemd_config(&config.profile_path, &auth_path).await?;

    // Start the service
    let output = tokio::process::Command::new("sudo")
        .args(["systemctl", "start", service_name()])
        .output()
        .await
        .map_err(|e| format!("Failed to start service: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        cleanup_auth_file().await;
        return Err(format!("systemctl start failed: {}", stderr));
    }

    // Wait a moment for the connection to establish
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    Ok("Connection initiated".to_string())
}

#[tauri::command]
pub async fn ovpn_disconnect() -> Result<String, String> {
    let output = tokio::process::Command::new("sudo")
        .args(["systemctl", "stop", service_name()])
        .output()
        .await
        .map_err(|e| format!("Failed to stop service: {}", e))?;

    cleanup_auth_file().await;

    // Also remove the config from /etc/openvpn/client/
    let _ = tokio::process::Command::new("sudo")
        .args(["rm", "-f", "/etc/openvpn/client/dext-vpn.conf"])
        .output()
        .await;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("systemctl stop failed: {}", stderr));
    }

    Ok("Disconnected".to_string())
}

#[tauri::command]
pub async fn ovpn_status(profile_path: String) -> Result<OvpnStatus, String> {
    // First try openvpn3 sessions-list (detects any active VPN session)
    if let Some(status) = get_openvpn3_status().await {
        return Ok(status);
    }

    // Fallback: check systemctl service
    let output = tokio::process::Command::new("systemctl")
        .args(["is-active", service_name()])
        .output()
        .await
        .map_err(|e| format!("Failed to check service: {}", e))?;

    let is_active = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_string();

    if is_active != "active" {
        return Ok(OvpnStatus {
            state: "disconnected".to_string(),
            server: String::new(),
            local_ip: String::new(),
            remote_ip: String::new(),
            uptime: String::new(),
            bytes_sent: String::new(),
            bytes_received: String::new(),
            protocol: String::new(),
        });
    }

    // Parse profile for server/protocol info
    let (server, protocol) = parse_profile_remote(&profile_path).await;

    // Get tun interface info
    let local_ip = get_tun_ip().await;
    let (bytes_sent, bytes_received) = get_tun_bytes();

    // Get uptime from systemctl show
    let uptime_output = tokio::process::Command::new("systemctl")
        .args(["show", service_name(), "--property=ActiveEnterTimestamp"])
        .output()
        .await;

    let uptime = if let Ok(out) = uptime_output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        if let Some(ts_str) = stdout.trim().strip_prefix("ActiveEnterTimestamp=") {
            if !ts_str.is_empty() {
                // Parse and compute duration
                if let Ok(start) = chrono::DateTime::parse_from_str(
                    ts_str.trim(),
                    "%a %Y-%m-%d %H:%M:%S %Z",
                ) {
                    let now = chrono::Utc::now();
                    let duration = now.signed_duration_since(start);
                    let secs = duration.num_seconds();
                    let h = secs / 3600;
                    let m = (secs % 3600) / 60;
                    let s = secs % 60;
                    format!("{}h {:02}m {:02}s", h, m, s)
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Try to get remote IP from journal
    let remote_ip = get_remote_ip_from_journal().await;

    Ok(OvpnStatus {
        state: "connected".to_string(),
        server,
        local_ip,
        remote_ip,
        uptime,
        bytes_sent,
        bytes_received,
        protocol,
    })
}

async fn get_remote_ip_from_journal() -> String {
    let output = tokio::process::Command::new("journalctl")
        .args(["-u", service_name(), "--no-pager", "-n", "50", "-o", "cat"])
        .output()
        .await;

    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines().rev() {
            // Look for "UDP link remote: [AF_INET]1.2.3.4:1194"
            if line.contains("link remote:") {
                if let Some(addr_part) = line.split(']').nth(1) {
                    return addr_part.split(':').next().unwrap_or("").to_string();
                }
            }
        }
    }
    String::new()
}

#[tauri::command]
pub async fn ovpn_get_logs(lines: u32) -> Result<Vec<OvpnLogLine>, String> {
    let output = tokio::process::Command::new("journalctl")
        .args([
            "-u",
            service_name(),
            "--no-pager",
            "-n",
            &lines.to_string(),
            "-o",
            "cat",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to read logs: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: Vec<OvpnLogLine> = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let level = detect_log_level(line);
            OvpnLogLine {
                content: line.to_string(),
                level: level.to_string(),
            }
        })
        .collect();

    Ok(result)
}

fn detect_log_level(line: &str) -> &'static str {
    let upper = line.to_uppercase();
    if upper.contains("ERROR") || upper.contains("FATAL") || upper.contains("FAIL") {
        "error"
    } else if upper.contains("WARN") {
        "warn"
    } else if upper.contains("VERIFY OK")
        || upper.contains("COMPLETED")
        || upper.contains("CONNECTED")
        || upper.contains("PEER CONNECTION")
    {
        "success"
    } else {
        "info"
    }
}

#[tauri::command]
pub async fn ovpn_watch_start(app: AppHandle) -> Result<(), String> {
    // Stop existing watcher
    let _ = ovpn_watch_stop_inner(&app);

    let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
    let app_handle = app.clone();

    // Track last seen line count
    tokio::spawn(async move {
        let mut last_count: usize = 0;

        loop {
            tokio::select! {
                _ = cancel_rx.recv() => break,
                _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {
                    // Read latest logs
                    let output = tokio::process::Command::new("journalctl")
                        .args(["-u", service_name(), "--no-pager", "-n", "200", "-o", "cat"])
                        .output()
                        .await;

                    if let Ok(out) = output {
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        let all_lines: Vec<&str> = stdout.lines().filter(|l| !l.is_empty()).collect();
                        let current_count = all_lines.len();

                        if current_count > last_count {
                            let new_lines: Vec<OvpnLogLine> = all_lines[last_count..]
                                .iter()
                                .map(|line| OvpnLogLine {
                                    content: line.to_string(),
                                    level: detect_log_level(line).to_string(),
                                })
                                .collect();

                            if !new_lines.is_empty() {
                                let _ = app_handle.emit("ovpn-log-lines", &new_lines);
                            }
                        }
                        last_count = current_count;
                    }
                }
            }
        }
    });

    let state = OvpnWatchState {
        _cancel_tx: cancel_tx,
    };
    app.manage(Mutex::new(Some(state)));

    Ok(())
}

fn ovpn_watch_stop_inner(app: &AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<Mutex<Option<OvpnWatchState>>>() {
        let mut guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn ovpn_watch_stop(app: AppHandle) -> Result<(), String> {
    ovpn_watch_stop_inner(&app)
}
