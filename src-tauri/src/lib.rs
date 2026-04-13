mod commands;

use commands::database_manager::DbState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(DbState::new())
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
            // Database Manager
            commands::database_manager::db_test_connection,
            commands::database_manager::db_connect,
            commands::database_manager::db_disconnect,
            commands::database_manager::db_execute_query,
            commands::database_manager::db_list_databases,
            commands::database_manager::db_list_tables,
            commands::database_manager::db_describe_table,
            // OpenVPN Manager
            commands::openvpn_manager::ovpn_connect,
            commands::openvpn_manager::ovpn_disconnect,
            commands::openvpn_manager::ovpn_status,
            commands::openvpn_manager::ovpn_get_logs,
            commands::openvpn_manager::ovpn_watch_start,
            commands::openvpn_manager::ovpn_watch_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
