use bollard::container::{ListContainersOptions, StartContainerOptions, StopContainerOptions, LogsOptions, RemoveContainerOptions};
use bollard::Docker;
use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Serialize, Clone)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerStats {
    pub running: usize,
    pub stopped: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct VolumeInfo {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub created: String,
    pub labels: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImageInfo {
    pub id: String,
    pub repo_tags: Vec<String>,
    pub size: u64,
    pub created: i64,
    pub containers: i64,
}

fn get_docker() -> Result<Docker, String> {
    Docker::connect_with_local_defaults()
        .map_err(|e| format!("Docker connection failed: {}. Is Docker running?", e))
}

// ── Containers ──────────────────────────────────────

#[tauri::command]
pub async fn docker_list() -> Result<(Vec<ContainerInfo>, DockerStats), String> {
    let docker = get_docker()?;

    let mut filters = HashMap::new();
    filters.insert("status", vec!["running", "exited", "paused", "created", "restarting", "dead"]);

    let options = ListContainersOptions {
        all: true,
        filters,
        ..Default::default()
    };

    let containers = docker
        .list_containers(Some(options))
        .await
        .map_err(|e| format!("Failed to list containers: {}", e))?;

    let mut running = 0;
    let mut stopped = 0;

    let infos: Vec<ContainerInfo> = containers
        .iter()
        .map(|c| {
            let state = c.state.as_deref().unwrap_or("unknown").to_string();
            if state == "running" {
                running += 1;
            } else {
                stopped += 1;
            }

            let ports_str = c
                .ports
                .as_ref()
                .map(|ports| {
                    ports
                        .iter()
                        .filter_map(|p| {
                            let public = p.public_port?;
                            let private = p.private_port;
                            Some(format!("{}:{}", public, private))
                        })
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|| "—".into());

            ContainerInfo {
                id: c.id.as_deref().unwrap_or("").chars().take(12).collect(),
                name: c
                    .names
                    .as_ref()
                    .and_then(|n| n.first())
                    .map(|n| n.trim_start_matches('/').to_string())
                    .unwrap_or_default(),
                image: c.image.as_deref().unwrap_or("unknown").to_string(),
                status: c.status.as_deref().unwrap_or("unknown").to_string(),
                state,
                ports: ports_str,
                created: c.created.unwrap_or(0),
            }
        })
        .collect();

    let stats = DockerStats {
        running,
        stopped,
        total: infos.len(),
    };

    Ok((infos, stats))
}

#[tauri::command]
pub async fn docker_start(container_id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker
        .start_container(&container_id, None::<StartContainerOptions<String>>)
        .await
        .map_err(|e| format!("Failed to start container: {}", e))
}

#[tauri::command]
pub async fn docker_stop(container_id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker
        .stop_container(&container_id, Some(StopContainerOptions { t: 10 }))
        .await
        .map_err(|e| format!("Failed to stop container: {}", e))
}

#[tauri::command]
pub async fn docker_restart(container_id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker
        .restart_container(&container_id, None)
        .await
        .map_err(|e| format!("Failed to restart container: {}", e))
}

#[tauri::command]
pub async fn docker_remove(container_id: String, force: bool) -> Result<(), String> {
    let docker = get_docker()?;
    let options = RemoveContainerOptions {
        force,
        v: true, // also remove anonymous volumes attached to the container
        ..Default::default()
    };
    docker
        .remove_container(&container_id, Some(options))
        .await
        .map_err(|e| format!("Failed to remove container: {}", e))
}

#[tauri::command]
pub async fn docker_logs(container_id: String, lines: u64) -> Result<Vec<String>, String> {
    let docker = get_docker()?;

    let options = LogsOptions::<String> {
        stdout: true,
        stderr: true,
        tail: lines.to_string(),
        ..Default::default()
    };

    let mut stream = docker.logs(&container_id, Some(options));
    let mut log_lines = Vec::new();

    while let Some(msg) = stream.next().await {
        match msg {
            Ok(output) => {
                log_lines.push(output.to_string().trim().to_string());
            }
            Err(e) => {
                return Err(format!("Failed to read logs: {}", e));
            }
        }
    }

    Ok(log_lines)
}

// ── Volumes ─────────────────────────────────────────

#[tauri::command]
pub async fn docker_volume_list() -> Result<Vec<VolumeInfo>, String> {
    let docker = get_docker()?;

    let response = docker
        .list_volumes::<String>(None)
        .await
        .map_err(|e| format!("Failed to list volumes: {}", e))?;

    let volumes = response
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| {
            let labels = v
                .labels
                .iter()
                .map(|(k, val)| format!("{}={}", k, val))
                .collect::<Vec<_>>()
                .join(", ");

            VolumeInfo {
                name: v.name,
                driver: v.driver,
                mountpoint: v.mountpoint,
                created: v.created_at.unwrap_or_default(),
                labels,
            }
        })
        .collect();

    Ok(volumes)
}

#[tauri::command]
pub async fn docker_volume_remove(name: String, force: bool) -> Result<(), String> {
    let docker = get_docker()?;
    docker
        .remove_volume(&name, Some(bollard::volume::RemoveVolumeOptions { force }))
        .await
        .map_err(|e| format!("Failed to remove volume: {}", e))
}

// ── Images ──────────────────────────────────────────

#[tauri::command]
pub async fn docker_image_list() -> Result<Vec<ImageInfo>, String> {
    let docker = get_docker()?;

    let images = docker
        .list_images::<String>(None)
        .await
        .map_err(|e| format!("Failed to list images: {}", e))?;

    let infos: Vec<ImageInfo> = images
        .into_iter()
        .map(|img| {
            ImageInfo {
                id: img.id.chars().skip(7).take(12).collect(), // strip "sha256:" prefix
                repo_tags: img.repo_tags,
                size: img.size as u64,
                created: img.created,
                containers: img.containers,
            }
        })
        .collect();

    Ok(infos)
}

#[tauri::command]
pub async fn docker_image_remove(image_id: String, force: bool) -> Result<(), String> {
    let docker = get_docker()?;
    let options = bollard::image::RemoveImageOptions {
        force,
        noprune: false,
    };
    docker
        .remove_image(&image_id, Some(options), None)
        .await
        .map_err(|e| format!("Failed to remove image: {}", e))?;
    Ok(())
}
