use serde::{Deserialize, Serialize};
use sqlx::any::AnyRow;
use sqlx::{AnyPool, Column, Row, TypeInfo, ValueRef};
use std::collections::HashMap;
use std::sync::Once;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

static INIT_DRIVERS: Once = Once::new();

fn ensure_drivers_installed() {
    INIT_DRIVERS.call_once(|| {
        sqlx::any::install_default_drivers();
    });
}

// --- Types ---

#[derive(Debug, Clone, Deserialize)]
pub struct DbConfig {
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct DbQueryResult {
    pub columns: Vec<String>,
    pub column_types: Vec<String>,
    pub rows: Vec<Vec<Option<String>>>,
    pub row_count: usize,
    pub affected_rows: u64,
    pub execution_time_ms: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct DbTableInfo {
    pub name: String,
    pub table_type: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DbColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
}

// --- State ---

struct DbConnection {
    pool: AnyPool,
    db_type: String,
}

pub struct DbState {
    connections: Mutex<HashMap<String, DbConnection>>,
}

impl DbState {
    pub fn new() -> Self {
        ensure_drivers_installed();
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }
}

// --- Helpers ---

fn url_encode(s: &str) -> String {
    let mut result = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

fn build_url(config: &DbConfig) -> Result<String, String> {
    match config.db_type.as_str() {
        "postgresql" => Ok(format!(
            "postgres://{}:{}@{}:{}/{}",
            url_encode(&config.username),
            url_encode(&config.password),
            config.host,
            config.port,
            url_encode(&config.database)
        )),
        "mysql" => Ok(format!(
            "mysql://{}:{}@{}:{}/{}",
            url_encode(&config.username),
            url_encode(&config.password),
            config.host,
            config.port,
            url_encode(&config.database)
        )),
        "sqlite" => Ok(format!("sqlite:{}", config.database)),
        other => Err(format!("Unsupported database type: {}", other)),
    }
}

fn generate_id() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("conn_{}", ts)
}

fn extract_value(row: &AnyRow, i: usize) -> Option<String> {
    if let Ok(raw) = row.try_get_raw(i) {
        if raw.is_null() {
            return None;
        }
    } else {
        return None;
    }

    row.try_get::<String, _>(i)
        .ok()
        .or_else(|| row.try_get::<i64, _>(i).ok().map(|v| v.to_string()))
        .or_else(|| row.try_get::<i32, _>(i).ok().map(|v| v.to_string()))
        .or_else(|| row.try_get::<i16, _>(i).ok().map(|v| v.to_string()))
        .or_else(|| row.try_get::<f64, _>(i).ok().map(|v| v.to_string()))
        .or_else(|| row.try_get::<f32, _>(i).ok().map(|v| v.to_string()))
        .or_else(|| row.try_get::<bool, _>(i).ok().map(|v| v.to_string()))
        .or_else(|| {
            row.try_get::<Vec<u8>, _>(i)
                .ok()
                .map(|v| format!("0x{}", v.iter().map(|b| format!("{:02x}", b)).collect::<String>()))
        })
}

fn rows_to_result(rows: Vec<AnyRow>, elapsed_ms: u64) -> DbQueryResult {
    let columns: Vec<String> = if !rows.is_empty() {
        rows[0].columns().iter().map(|c| c.name().to_string()).collect()
    } else {
        Vec::new()
    };

    let column_types: Vec<String> = if !rows.is_empty() {
        rows[0]
            .columns()
            .iter()
            .map(|c| c.type_info().name().to_string())
            .collect()
    } else {
        Vec::new()
    };

    let row_count = rows.len();
    let data: Vec<Vec<Option<String>>> = rows
        .iter()
        .take(1000)
        .map(|row| {
            (0..row.columns().len())
                .map(|i| extract_value(row, i))
                .collect()
        })
        .collect();

    DbQueryResult {
        columns,
        column_types,
        rows: data,
        row_count,
        affected_rows: 0,
        execution_time_ms: elapsed_ms,
    }
}

// --- Commands ---

#[tauri::command]
pub async fn db_test_connection(config: DbConfig) -> Result<String, String> {
    ensure_drivers_installed();
    let url = build_url(&config)?;

    let pool = AnyPool::connect(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    pool.close().await;
    Ok("Connection successful".to_string())
}

#[tauri::command]
pub async fn db_connect(
    config: DbConfig,
    state: tauri::State<'_, DbState>,
) -> Result<String, String> {
    ensure_drivers_installed();
    let url = build_url(&config)?;

    let pool = AnyPool::connect(&url)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let id = generate_id();
    let mut conns = state.connections.lock().await;
    conns.insert(
        id.clone(),
        DbConnection {
            pool,
            db_type: config.db_type.clone(),
        },
    );
    Ok(id)
}

#[tauri::command]
pub async fn db_disconnect(
    connection_id: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let mut conns = state.connections.lock().await;
    if let Some(conn) = conns.remove(&connection_id) {
        conn.pool.close().await;
        Ok(())
    } else {
        Err("Connection not found".to_string())
    }
}

#[tauri::command]
pub async fn db_execute_query(
    connection_id: String,
    query: String,
    state: tauri::State<'_, DbState>,
) -> Result<DbQueryResult, String> {
    let pool = {
        let conns = state.connections.lock().await;
        conns
            .get(&connection_id)
            .map(|c| c.pool.clone())
            .ok_or("Connection not found".to_string())?
    };

    let start = Instant::now();

    // Try fetch (SELECT-like queries)
    match sqlx::query(&query).fetch_all(&pool).await {
        Ok(rows) => {
            let elapsed = start.elapsed().as_millis() as u64;
            Ok(rows_to_result(rows, elapsed))
        }
        Err(fetch_err) => {
            // Try execute (INSERT, UPDATE, DELETE, DDL)
            match sqlx::query(&query).execute(&pool).await {
                Ok(result) => {
                    let elapsed = start.elapsed().as_millis() as u64;
                    Ok(DbQueryResult {
                        columns: Vec::new(),
                        column_types: Vec::new(),
                        rows: Vec::new(),
                        row_count: 0,
                        affected_rows: result.rows_affected(),
                        execution_time_ms: elapsed,
                    })
                }
                Err(_) => Err(format!("Query failed: {}", fetch_err)),
            }
        }
    }
}

#[tauri::command]
pub async fn db_list_databases(
    connection_id: String,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<String>, String> {
    let (pool, db_type) = {
        let conns = state.connections.lock().await;
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        (conn.pool.clone(), conn.db_type.clone())
    };

    let query = match db_type.as_str() {
        "postgresql" => {
            "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
        }
        "mysql" => "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME",
        "sqlite" => "SELECT 'main' AS name",
        _ => return Err("Unsupported database type".to_string()),
    };

    let rows = sqlx::query(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list databases: {}", e))?;

    let names: Vec<String> = rows
        .iter()
        .filter_map(|row: &AnyRow| row.try_get::<String, _>(0).ok())
        .collect();

    Ok(names)
}

#[tauri::command]
pub async fn db_list_tables(
    connection_id: String,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<DbTableInfo>, String> {
    let (pool, db_type) = {
        let conns = state.connections.lock().await;
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        (conn.pool.clone(), conn.db_type.clone())
    };

    let query = match db_type.as_str() {
        "postgresql" => {
            "SELECT table_name, table_type FROM information_schema.tables \
             WHERE table_schema = 'public' ORDER BY table_name"
        }
        "mysql" => {
            "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES \
             WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
        }
        "sqlite" => {
            "SELECT name, type FROM sqlite_master \
             WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' \
             ORDER BY name"
        }
        _ => return Err("Unsupported database type".to_string()),
    };

    let rows = sqlx::query(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list tables: {}", e))?;

    let tables: Vec<DbTableInfo> = rows
        .iter()
        .map(|row: &AnyRow| DbTableInfo {
            name: row.try_get::<String, _>(0).unwrap_or_default(),
            table_type: row.try_get::<String, _>(1).unwrap_or_default(),
        })
        .collect();

    Ok(tables)
}

#[tauri::command]
pub async fn db_describe_table(
    connection_id: String,
    table_name: String,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<DbColumnInfo>, String> {
    let (pool, db_type) = {
        let conns = state.connections.lock().await;
        let conn = conns.get(&connection_id).ok_or("Connection not found")?;
        (conn.pool.clone(), conn.db_type.clone())
    };

    match db_type.as_str() {
        "postgresql" => describe_pg(&pool, &table_name).await,
        "mysql" => describe_mysql(&pool, &table_name).await,
        "sqlite" => describe_sqlite(&pool, &table_name).await,
        _ => Err("Unsupported database type".to_string()),
    }
}

async fn describe_pg(pool: &AnyPool, table: &str) -> Result<Vec<DbColumnInfo>, String> {
    let query = r#"
        SELECT
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END as is_pk
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku
                ON tc.constraint_name = ku.constraint_name
                AND tc.table_schema = ku.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_name = $1
                AND tc.table_schema = 'public'
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = $1 AND c.table_schema = 'public'
        ORDER BY c.ordinal_position
    "#;

    let rows = sqlx::query(query)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to describe table: {}", e))?;

    Ok(rows
        .iter()
        .map(|row: &AnyRow| DbColumnInfo {
            name: row.try_get::<String, _>(0).unwrap_or_default(),
            data_type: row.try_get::<String, _>(1).unwrap_or_default(),
            is_nullable: row
                .try_get::<String, _>(2)
                .unwrap_or_default()
                == "YES",
            default_value: row.try_get::<String, _>(3).ok(),
            is_primary_key: row
                .try_get::<String, _>(4)
                .unwrap_or_default()
                == "YES",
        })
        .collect())
}

async fn describe_mysql(pool: &AnyPool, table: &str) -> Result<Vec<DbColumnInfo>, String> {
    let query = r#"
        SELECT
            COLUMN_NAME,
            COLUMN_TYPE,
            IS_NULLABLE,
            COLUMN_DEFAULT,
            COLUMN_KEY
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
        ORDER BY ORDINAL_POSITION
    "#;

    let rows = sqlx::query(query)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to describe table: {}", e))?;

    Ok(rows
        .iter()
        .map(|row: &AnyRow| DbColumnInfo {
            name: row.try_get::<String, _>(0).unwrap_or_default(),
            data_type: row.try_get::<String, _>(1).unwrap_or_default(),
            is_nullable: row
                .try_get::<String, _>(2)
                .unwrap_or_default()
                == "YES",
            default_value: row.try_get::<String, _>(3).ok(),
            is_primary_key: row
                .try_get::<String, _>(4)
                .unwrap_or_default()
                == "PRI",
        })
        .collect())
}

async fn describe_sqlite(pool: &AnyPool, table: &str) -> Result<Vec<DbColumnInfo>, String> {
    // SQLite doesn't support parameterized PRAGMA, use safe string formatting
    let safe_name: String = table.chars().filter(|c| c.is_alphanumeric() || *c == '_').collect();
    let query = format!("PRAGMA table_info({})", safe_name);

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to describe table: {}", e))?;

    Ok(rows
        .iter()
        .map(|row: &AnyRow| {
            let pk_val = row.try_get::<i32, _>(5).unwrap_or(0);
            DbColumnInfo {
                name: row.try_get::<String, _>(1).unwrap_or_default(),
                data_type: row.try_get::<String, _>(2).unwrap_or_default(),
                is_nullable: row.try_get::<i32, _>(3).unwrap_or(0) == 0,
                default_value: row.try_get::<String, _>(4).ok(),
                is_primary_key: pk_val > 0,
            }
        })
        .collect())
}
