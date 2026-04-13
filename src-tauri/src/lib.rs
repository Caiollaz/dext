mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            // Port Scanner
            commands::port_scanner::scan_ports,
            // DNS Lookup
            commands::dns_lookup::dns_resolve,
            // SSL Inspector
            commands::ssl_inspector::inspect_ssl,
            // Docker Dashboard
            commands::docker_manager::docker_list,
            commands::docker_manager::docker_start,
            commands::docker_manager::docker_stop,
            commands::docker_manager::docker_restart,
            commands::docker_manager::docker_remove,
            commands::docker_manager::docker_logs,
            commands::docker_manager::docker_volume_list,
            commands::docker_manager::docker_volume_remove,
            commands::docker_manager::docker_image_list,
            commands::docker_manager::docker_image_remove,
            // Log Tail Viewer
            commands::log_watcher::log_read_file,
            commands::log_watcher::log_watch_start,
            commands::log_watcher::log_watch_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
