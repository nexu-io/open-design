use std::{
    collections::HashMap,
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::{self, Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};

use base64::{engine::general_purpose, Engine as _};
use chrono::{SecondsFormat, Utc};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use tauri::{Manager, WebviewWindow};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    sync::oneshot,
    time::timeout,
};
use url::Url;

const APP_DESKTOP: &str = "desktop";
const APP_DAEMON: &str = "daemon";
const APP_WEB: &str = "web";
const SIDECAR_SOURCE_TOOLS_DEV: &str = "tools-dev";
const SIDECAR_SOURCE_TOOLS_PACK: &str = "tools-pack";
const SIDECAR_MESSAGE_CLICK: &str = "click";
const SIDECAR_MESSAGE_CONSOLE: &str = "console";
const SIDECAR_MESSAGE_EVAL: &str = "eval";
const SIDECAR_MESSAGE_EXPORT_PDF: &str = "export-pdf";
const SIDECAR_MESSAGE_REGISTER_DESKTOP_AUTH: &str = "register-desktop-auth";
const SIDECAR_MESSAGE_SCREENSHOT: &str = "screenshot";
const SIDECAR_MESSAGE_SHUTDOWN: &str = "shutdown";
const SIDECAR_MESSAGE_STATUS: &str = "status";
const SIDECAR_MESSAGE_UPDATE: &str = "update";
const STAMP_APP_FLAG: &str = "--od-stamp-app";
const STAMP_IPC_FLAG: &str = "--od-stamp-ipc";
const STAMP_MODE_FLAG: &str = "--od-stamp-mode";
const STAMP_NAMESPACE_FLAG: &str = "--od-stamp-namespace";
const STAMP_SOURCE_FLAG: &str = "--od-stamp-source";
const SIDECAR_ENV_BASE: &str = "OD_SIDECAR_BASE";
const SIDECAR_ENV_IPC_PATH: &str = "OD_SIDECAR_IPC_PATH";
const SIDECAR_ENV_NAMESPACE: &str = "OD_SIDECAR_NAMESPACE";
const SIDECAR_ENV_SOURCE: &str = "OD_SIDECAR_SOURCE";
const PACKAGED_CONFIG_PATH_ENV: &str = "OD_PACKAGED_CONFIG_PATH";
const TAURI_RESOURCE_DIR_ENV: &str = "OD_TAURI_RESOURCE_DIR";
const DEFAULT_NAMESPACE: &str = "default";
const DEFAULT_IPC_BASE: &str = "/tmp/open-design/ipc";
const WINDOWS_PIPE_PREFIX: &str = "open-design";
const WINDOWS_VERBATIM_UNC_PREFIX: &str = "\\\\?\\UNC\\";
const WINDOWS_VERBATIM_PREFIX: &str = "\\\\?\\";
const IMPORT_TOKEN_HEADER: &str = "X-OD-Desktop-Import-Token";
const IMPORT_TOKEN_FIELD_SEP: &str = "~";
const IMPORT_TOKEN_TTL_SECONDS: i64 = 60;
const TAURI_OPEN_PATH_DRY_RUN_ENV: &str = "OD_TAURI_OPEN_PATH_DRY_RUN";
const TAURI_PICK_FOLDER_PATH_ENV: &str = "OD_TAURI_PICK_FOLDER_PATH";
const WEB_DISCOVERY_PENDING_MS: u64 = 120;
const WEB_DISCOVERY_RUNNING_MS: u64 = 2_000;
const DESKTOP_AUTH_RETRY_DELAYS_MS: [u64; 5] = [120, 240, 480, 960, 1_500];
const PACKAGED_SIDECAR_HELPER_RELATIVE: [&str; 6] = [
    "app",
    "node_modules",
    "@open-design",
    "packaged",
    "dist",
    "tauri-sidecars.mjs",
];

#[allow(dead_code)]
const SIDECAR_STAMP_FIELDS: [&str; 5] = ["app", "mode", "namespace", "ipc", "source"];

type HmacSha256 = Hmac<Sha256>;
type PendingEvalSender = oneshot::Sender<Value>;

#[allow(dead_code)]
#[derive(Clone, Debug, Serialize)]
struct RuntimeStamp {
    app: String,
    ipc: String,
    mode: String,
    namespace: String,
    source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatusSnapshot {
    pid: u32,
    state: &'static str,
    title: Option<String>,
    updated_at: String,
    url: Option<String>,
    window_visible: bool,
}

#[derive(Debug, Default)]
struct DesktopStatusState {
    title: Option<String>,
    url: Option<String>,
    window_visible: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickAndImportInit {
    name: Option<String>,
    skill_id: Option<String>,
    design_system_id: Option<String>,
}

#[derive(Clone)]
struct AppState {
    auth_secret: Arc<Vec<u8>>,
    daemon_ipc: String,
    eval_pending: Arc<Mutex<HashMap<String, PendingEvalSender>>>,
    http: reqwest::Client,
    packaged_sidecars: Arc<Mutex<Option<Child>>>,
    status: Arc<Mutex<DesktopStatusState>>,
    stamp: RuntimeStamp,
    web_ipc: String,
    eval_callback_url: String,
}

impl AppState {
    fn snapshot(&self) -> DesktopStatusSnapshot {
        let status = self.status.lock().expect("desktop status lock poisoned");
        DesktopStatusSnapshot {
            pid: process::id(),
            state: if status.url.is_some() {
                "running"
            } else {
                "unknown"
            },
            title: status
                .title
                .clone()
                .or_else(|| Some("Open Design".to_string())),
            updated_at: now_rfc3339(),
            url: status.url.clone(),
            window_visible: status.window_visible,
        }
    }

    fn current_api_url(&self) -> Option<String> {
        self.status
            .lock()
            .expect("desktop status lock poisoned")
            .url
            .clone()
    }
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn read_flag(args: &[String], flag: &str) -> Option<String> {
    let inline_prefix = format!("{flag}=");
    args.iter().enumerate().find_map(|(index, argument)| {
        if argument == flag {
            return args.get(index + 1).cloned();
        }
        argument
            .strip_prefix(&inline_prefix)
            .map(|value| value.to_string())
    })
}

fn read_stamp() -> Result<RuntimeStamp, String> {
    let args = env::args().collect::<Vec<_>>();
    let app = read_flag(&args, STAMP_APP_FLAG).unwrap_or_else(|| APP_DESKTOP.to_string());
    let ipc = read_flag(&args, STAMP_IPC_FLAG)
        .or_else(|| env::var(SIDECAR_ENV_IPC_PATH).ok())
        .ok_or_else(|| "missing desktop sidecar ipc stamp".to_string())?;
    let mode = read_flag(&args, STAMP_MODE_FLAG).unwrap_or_else(|| "dev".to_string());
    let namespace = read_flag(&args, STAMP_NAMESPACE_FLAG)
        .or_else(|| env::var(SIDECAR_ENV_NAMESPACE).ok())
        .unwrap_or_else(|| DEFAULT_NAMESPACE.to_string());
    let source = read_flag(&args, STAMP_SOURCE_FLAG)
        .or_else(|| env::var(SIDECAR_ENV_SOURCE).ok())
        .unwrap_or_else(|| SIDECAR_SOURCE_TOOLS_DEV.to_string());

    if app != APP_DESKTOP {
        return Err(format!(
            "sidecar stamp app mismatch: expected {APP_DESKTOP}, received {app}"
        ));
    }
    if ipc.trim().is_empty() {
        return Err("desktop sidecar ipc stamp must not be empty".to_string());
    }
    Ok(RuntimeStamp {
        app,
        ipc,
        mode,
        namespace,
        source,
    })
}

fn sibling_ipc_path(desktop_ipc: &str, namespace: &str, app: &str) -> String {
    if cfg!(windows) {
        return format!(r"\\.\pipe\{WINDOWS_PIPE_PREFIX}-{namespace}-{app}");
    }
    let path = Path::new(desktop_ipc);
    path.parent()
        .unwrap_or_else(|| Path::new(DEFAULT_IPC_BASE))
        .join(format!("{app}.sock"))
        .to_string_lossy()
        .into_owned()
}

fn stamp_args(stamp: &RuntimeStamp) -> Vec<String> {
    vec![
        STAMP_APP_FLAG.to_string(),
        stamp.app.clone(),
        STAMP_MODE_FLAG.to_string(),
        stamp.mode.clone(),
        STAMP_NAMESPACE_FLAG.to_string(),
        stamp.namespace.clone(),
        STAMP_IPC_FLAG.to_string(),
        stamp.ipc.clone(),
        STAMP_SOURCE_FLAG.to_string(),
        stamp.source.clone(),
    ]
}

fn packaged_helper_path(resource_dir: &Path) -> PathBuf {
    PACKAGED_SIDECAR_HELPER_RELATIVE
        .iter()
        .fold(resource_dir.to_path_buf(), |path, segment| {
            path.join(segment)
        })
}

fn packaged_node_path(resource_dir: &Path) -> PathBuf {
    resource_dir
        .join("open-design")
        .join("bin")
        .join(if cfg!(windows) { "node.exe" } else { "node" })
}

fn node_compatible_path(path: &Path) -> PathBuf {
    let raw = path.as_os_str().to_string_lossy();
    if let Some(rest) = raw.strip_prefix(WINDOWS_VERBATIM_UNC_PREFIX) {
        return PathBuf::from(format!("\\\\{rest}"));
    }
    if let Some(rest) = raw.strip_prefix(WINDOWS_VERBATIM_PREFIX) {
        return PathBuf::from(rest.to_string());
    }
    path.to_path_buf()
}

fn resource_dir_from_current_exe() -> Result<PathBuf, String> {
    let exe = env::current_exe()
        .map_err(|error| format!("current executable path could not be resolved: {error}"))?;
    #[cfg(target_os = "macos")]
    {
        let contents = exe.parent().and_then(Path::parent).ok_or_else(|| {
            format!(
                "macOS bundled executable did not have a Contents parent: {}",
                exe.display()
            )
        })?;
        Ok(contents.join("Resources"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        exe.parent().map(Path::to_path_buf).ok_or_else(|| {
            format!(
                "executable did not have a parent directory: {}",
                exe.display()
            )
        })
    }
}

fn resolve_resource_dir(app: &tauri::App) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .or_else(|_| resource_dir_from_current_exe())
        .map_err(|error| format!("Tauri resource directory could not be resolved: {error}"))
}

fn start_packaged_sidecars(app: &tauri::App, state: &AppState) -> Result<Option<Child>, String> {
    if state.stamp.source == SIDECAR_SOURCE_TOOLS_DEV {
        return Ok(None);
    }
    if state.stamp.source != SIDECAR_SOURCE_TOOLS_PACK && state.stamp.source != "packaged" {
        return Ok(None);
    }

    let resource_dir = resolve_resource_dir(app)?;
    let node_path = packaged_node_path(&resource_dir);
    let helper_path = packaged_helper_path(&resource_dir);
    if !node_path.exists() {
        return Err(format!(
            "packaged Tauri node runtime missing at {}",
            node_path.display()
        ));
    }
    if !helper_path.exists() {
        return Err(format!(
            "packaged Tauri sidecar helper missing at {}",
            helper_path.display()
        ));
    }
    let node_path_for_command = node_compatible_path(&node_path);
    let helper_path_for_node = node_compatible_path(&helper_path);
    let resource_dir_for_node = node_compatible_path(&resource_dir);
    let runtime_root = env::var(SIDECAR_ENV_BASE)
        .map(PathBuf::from)
        .map_err(|_| format!("missing {SIDECAR_ENV_BASE} for packaged Tauri sidecar helper"))?;
    let namespace_root = runtime_root.parent().ok_or_else(|| {
        format!(
            "packaged Tauri runtime root did not have a namespace parent: {}",
            runtime_root.display()
        )
    })?;
    let desktop_log_path = namespace_root
        .join("logs")
        .join(APP_DESKTOP)
        .join("latest.log");
    if let Some(parent) = desktop_log_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("packaged Tauri desktop log directory could not be created: {error}")
        })?;
    }
    let mut helper_log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&desktop_log_path)
        .map_err(|error| format!("packaged Tauri desktop log could not be opened: {error}"))?;
    writeln!(
        helper_log,
        "[open-design tauri] starting sidecar helper {}",
        helper_path_for_node.display()
    )
    .map_err(|error| format!("packaged Tauri sidecar helper log write failed: {error}"))?;
    let helper_err_log = helper_log
        .try_clone()
        .map_err(|error| format!("packaged Tauri sidecar helper log clone failed: {error}"))?;
    let config_path = env::var(PACKAGED_CONFIG_PATH_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(|_| resource_dir.join("open-design-config.json"));
    let config_path_for_node = node_compatible_path(&config_path);
    let mut command = Command::new(node_path_for_command);
    command
        .arg(helper_path_for_node)
        .args(stamp_args(&state.stamp))
        .env(TAURI_RESOURCE_DIR_ENV, resource_dir_for_node)
        .env(PACKAGED_CONFIG_PATH_ENV, config_path_for_node)
        .stdin(Stdio::null())
        .stdout(Stdio::from(helper_log))
        .stderr(Stdio::from(helper_err_log));
    command
        .spawn()
        .map(Some)
        .map_err(|error| format!("packaged Tauri sidecar helper failed to start: {error}"))
}

fn write_packaged_desktop_identity_marker(
    app: &tauri::App,
    state: &AppState,
) -> Result<(), String> {
    if state.stamp.source == SIDECAR_SOURCE_TOOLS_DEV {
        return Ok(());
    }
    if state.stamp.source != SIDECAR_SOURCE_TOOLS_PACK && state.stamp.source != "packaged" {
        return Ok(());
    }

    let runtime_root = env::var(SIDECAR_ENV_BASE)
        .map(PathBuf::from)
        .map_err(|_| format!("missing {SIDECAR_ENV_BASE} for packaged Tauri desktop identity"))?;
    let namespace_root = runtime_root.parent().ok_or_else(|| {
        format!(
            "packaged Tauri runtime root did not have a namespace parent: {}",
            runtime_root.display()
        )
    })?;
    let logs_root = namespace_root.join("logs").join(APP_DESKTOP);
    fs::create_dir_all(&runtime_root).map_err(|error| {
        format!("packaged Tauri runtime directory could not be created: {error}")
    })?;
    fs::create_dir_all(&logs_root).map_err(|error| {
        format!("packaged Tauri desktop log directory could not be created: {error}")
    })?;

    let executable_path = env::current_exe()
        .map_err(|error| format!("current executable path could not be resolved: {error}"))?;
    let app_path = resolve_resource_dir(app).unwrap_or_else(|_| {
        executable_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(""))
    });
    let now = now_rfc3339();
    let identity = json!({
        "appPath": app_path.to_string_lossy(),
        "executablePath": executable_path.to_string_lossy(),
        "logPath": logs_root.join("latest.log").to_string_lossy(),
        "namespaceRoot": namespace_root.to_string_lossy(),
        "pid": process::id(),
        "ppid": 0,
        "stamp": &state.stamp,
        "startedAt": now,
        "updatedAt": now,
        "version": 1,
    });
    let identity_path = runtime_root.join("desktop-root.json");
    let payload = serde_json::to_vec_pretty(&identity).map_err(|error| {
        format!("packaged Tauri desktop identity could not be encoded: {error}")
    })?;
    fs::write(&identity_path, payload).map_err(|error| {
        format!(
            "packaged Tauri desktop identity could not be written at {}: {error}",
            identity_path.display()
        )
    })
}

fn terminate_child_process(child: &mut Child) {
    if child.try_wait().ok().flatten().is_some() {
        let _ = child.wait();
        return;
    }

    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(child.id().to_string())
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .arg("/PID")
            .arg(child.id().to_string())
            .arg("/T")
            .status();
    }

    std::thread::sleep(Duration::from_millis(1_200));
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn stop_packaged_sidecars(state: &AppState) {
    let child = state
        .packaged_sidecars
        .lock()
        .expect("packaged sidecar lock poisoned")
        .take();
    if let Some(mut child) = child {
        terminate_child_process(&mut child);
    }
}

fn is_http_url(url: &str) -> bool {
    Url::parse(url)
        .map(|parsed| parsed.scheme() == "http" || parsed.scheme() == "https")
        .unwrap_or(false)
}

fn is_safe_project_id(project_id: &str) -> bool {
    !project_id.is_empty()
        && project_id.len() <= 128
        && project_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-')
}

fn json_error(message: impl Into<String>) -> Value {
    json!({ "ok": false, "error": { "message": message.into() } })
}

fn json_ok(result: Value) -> Value {
    json!({ "ok": true, "result": result })
}

async fn request_json_ipc(
    socket_path: &str,
    payload: Value,
    timeout_ms: u64,
) -> Result<Value, String> {
    #[cfg(unix)]
    {
        use tokio::{
            io::{AsyncReadExt, AsyncWriteExt},
            net::UnixStream,
        };

        let request = async {
            let mut stream = UnixStream::connect(socket_path)
                .await
                .map_err(|error| format!("IPC connect failed: {error}"))?;
            stream
                .write_all(format!("{payload}\n").as_bytes())
                .await
                .map_err(|error| format!("IPC write failed: {error}"))?;
            let mut buffer = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                let read = stream
                    .read(&mut chunk)
                    .await
                    .map_err(|error| format!("IPC read failed: {error}"))?;
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.contains(&b'\n') {
                    break;
                }
            }
            let newline = buffer
                .iter()
                .position(|b| *b == b'\n')
                .unwrap_or(buffer.len());
            let response: Value = serde_json::from_slice(&buffer[..newline])
                .map_err(|error| format!("IPC response was not JSON: {error}"))?;
            if response.get("ok").and_then(Value::as_bool) == Some(true) {
                Ok(response.get("result").cloned().unwrap_or(Value::Null))
            } else {
                let message = response
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("IPC request failed");
                Err(message.to_string())
            }
        };

        timeout(Duration::from_millis(timeout_ms), request)
            .await
            .map_err(|_| format!("IPC request timed out: {socket_path}"))?
    }

    #[cfg(windows)]
    {
        use tokio::{
            io::{AsyncReadExt, AsyncWriteExt},
            net::windows::named_pipe::ClientOptions,
        };

        let request = async {
            let mut stream = ClientOptions::new()
                .open(socket_path)
                .map_err(|error| format!("IPC connect failed: {error}"))?;
            stream
                .write_all(format!("{payload}\n").as_bytes())
                .await
                .map_err(|error| format!("IPC write failed: {error}"))?;
            let mut buffer = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                let read = stream
                    .read(&mut chunk)
                    .await
                    .map_err(|error| format!("IPC read failed: {error}"))?;
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.contains(&b'\n') {
                    break;
                }
            }
            let newline = buffer
                .iter()
                .position(|b| *b == b'\n')
                .unwrap_or(buffer.len());
            let response: Value = serde_json::from_slice(&buffer[..newline])
                .map_err(|error| format!("IPC response was not JSON: {error}"))?;
            if response.get("ok").and_then(Value::as_bool) == Some(true) {
                Ok(response.get("result").cloned().unwrap_or(Value::Null))
            } else {
                let message = response
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("IPC request failed");
                Err(message.to_string())
            }
        };

        timeout(Duration::from_millis(timeout_ms), request)
            .await
            .map_err(|_| format!("IPC request timed out: {socket_path}"))?
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = (socket_path, payload, timeout_ms);
        Err("Tauri desktop IPC is not implemented for this platform yet".to_string())
    }
}

async fn register_desktop_auth(state: &AppState) -> bool {
    let message = json!({
        "type": SIDECAR_MESSAGE_REGISTER_DESKTOP_AUTH,
        "input": {
            "secret": general_purpose::STANDARD.encode(state.auth_secret.as_ref())
        }
    });

    for delay_ms in std::iter::once(0).chain(DESKTOP_AUTH_RETRY_DELAYS_MS) {
        if delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }
        if let Ok(result) = request_json_ipc(&state.daemon_ipc, message.clone(), 800).await {
            if result.get("accepted").and_then(Value::as_bool) == Some(true) {
                return true;
            }
        }
    }
    false
}

async fn discover_web_url(web_ipc: &str) -> Option<String> {
    request_json_ipc(web_ipc, json!({ "type": SIDECAR_MESSAGE_STATUS }), 600)
        .await
        .ok()
        .and_then(|status| {
            status
                .get("url")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn set_status_url(state: &AppState, url: Option<String>, window_visible: bool) {
    let mut status = state.status.lock().expect("desktop status lock poisoned");
    status.url = url;
    status.window_visible = window_visible;
}

fn set_status_title(state: &AppState, title: Option<String>) {
    let mut status = state.status.lock().expect("desktop status lock poisoned");
    status.title = title;
}

async fn poll_web_url(state: AppState, window: WebviewWindow) {
    let mut loaded_url: Option<String> = None;
    loop {
        let next_url = discover_web_url(&state.web_ipc).await;
        if let Some(url) = next_url.clone() {
            if loaded_url.as_deref() != Some(url.as_str()) {
                match Url::parse(&url) {
                    Ok(parsed) => {
                        if let Err(error) = window.navigate(parsed) {
                            eprintln!(
                                "[open-design tauri] failed to navigate desktop window: {error}"
                            );
                        } else {
                            loaded_url = Some(url.clone());
                        }
                    }
                    Err(error) => {
                        eprintln!("[open-design tauri] discovered invalid web URL {url}: {error}")
                    }
                }
            }
        }
        set_status_url(
            &state,
            next_url.clone(),
            window.is_visible().unwrap_or(true),
        );
        let delay = if next_url.is_some() {
            WEB_DISCOVERY_RUNNING_MS
        } else {
            WEB_DISCOVERY_PENDING_MS
        };
        tokio::time::sleep(Duration::from_millis(delay)).await;
    }
}

async fn eval_in_window(
    state: &AppState,
    window: &WebviewWindow,
    expression: &str,
    timeout_ms: u64,
) -> Result<Value, String> {
    let mut nonce = [0_u8; 16];
    OsRng.fill_bytes(&mut nonce);
    let id = general_purpose::URL_SAFE_NO_PAD.encode(nonce);
    let (tx, rx) = oneshot::channel();
    state
        .eval_pending
        .lock()
        .expect("desktop eval lock poisoned")
        .insert(id.clone(), tx);

    let id_json = serde_json::to_string(&id).map_err(|error| error.to_string())?;
    let expr_json = serde_json::to_string(expression).map_err(|error| error.to_string())?;
    let callback_url_json =
        serde_json::to_string(&format!("{}/eval/{id}", state.eval_callback_url))
            .map_err(|error| error.to_string())?;
    let script = format!(
        r#"(async () => {{
  const id = {id_json};
  const expression = {expr_json};
  const callbackUrl = {callback_url_json};
  const invoke =
    (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ||
    (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
  const finish = async (payload) => {{
    try {{
      await fetch(callbackUrl, {{
        method: 'POST',
        mode: 'no-cors',
        headers: {{ 'Content-Type': 'text/plain;charset=UTF-8' }},
        body: JSON.stringify(payload)
      }});
    }} catch {{}}
    if (typeof invoke === 'function') {{
      try {{
        await invoke('desktop_inspect_eval_result', {{ id, payload }});
      }} catch {{}}
    }}
  }};
  try {{
    const value = await (0, eval)(expression);
    let safeValue = value;
    try {{
      safeValue = JSON.parse(JSON.stringify(value));
    }} catch {{
      safeValue = String(value);
    }}
    await finish({{ ok: true, value: safeValue }});
  }} catch (error) {{
    await finish({{ ok: false, error: error && error.message ? error.message : String(error) }});
  }}
}})();"#,
    );

    if let Err(error) = window.eval(&script) {
        state
            .eval_pending
            .lock()
            .expect("desktop eval lock poisoned")
            .remove(&id);
        return Err(format!("desktop eval injection failed: {error}"));
    }

    let result = timeout(Duration::from_millis(timeout_ms), rx)
        .await
        .map_err(|_| "desktop eval timed out".to_string())?
        .map_err(|_| "desktop eval callback was dropped".to_string());
    state
        .eval_pending
        .lock()
        .expect("desktop eval lock poisoned")
        .remove(&id);
    result
}

async fn click_selector(
    state: &AppState,
    window: &WebviewWindow,
    selector: &str,
) -> Result<Value, String> {
    let selector_json = serde_json::to_string(selector).map_err(|error| error.to_string())?;
    let expression = format!(
        r#"(() => {{
  const el = document.querySelector({selector_json});
  if (!el) return {{ found: false, clicked: false }};
  el.click();
  return {{ found: true, clicked: true }};
}})()"#,
    );
    let value = eval_in_window(state, window, &expression, 2_000).await?;
    Ok(value.get("value").cloned().unwrap_or(Value::Null))
}

fn normalize_output_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("path must be a non-empty string".to_string());
    }
    let raw = Path::new(path);
    if raw.is_absolute() {
        Ok(raw.to_path_buf())
    } else {
        env::current_dir()
            .map(|cwd| cwd.join(raw))
            .map_err(|error| format!("current directory could not be resolved: {error}"))
    }
}

async fn capture_screenshot(
    state: &AppState,
    window: &WebviewWindow,
    path: &str,
) -> Result<Value, String> {
    let output_path = normalize_output_path(path)?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("screenshot directory could not be created: {error}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        let _ = state;
        let _ = window.show();
        let _ = window.set_focus();
        tokio::time::sleep(Duration::from_millis(120)).await;

        let position = window
            .outer_position()
            .map_err(|error| format!("desktop window position could not be read: {error}"))?;
        let size = window
            .outer_size()
            .map_err(|error| format!("desktop window size could not be read: {error}"))?;
        let rect = format!(
            "{},{},{},{}",
            position.x,
            position.y,
            size.width.max(1),
            size.height.max(1)
        );
        let output_path_string = output_path.to_string_lossy().into_owned();
        let output = process::Command::new("screencapture")
            .arg("-x")
            .arg("-R")
            .arg(rect)
            .arg(&output_path_string)
            .output()
            .map_err(|error| format!("screencapture failed to start: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                format!("screencapture exited with {}", output.status)
            } else {
                format!("screencapture exited with {}: {stderr}", output.status)
            });
        }
        Ok(json!({ "path": output_path_string }))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.show();
        let _ = window.set_focus();
        tokio::time::sleep(Duration::from_millis(120)).await;

        // Tauri/WebKitGTK does not expose a cross-platform pixel capture API;
        // use the live renderer to produce a PNG smoke artifact instead.
        let expression = r##"(() => {
  const width = Math.max(1, Math.min(1280, Math.floor(window.innerWidth || 1024)));
  const height = Math.max(1, Math.min(800, Math.floor(window.innerHeight || 768)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const styles = getComputedStyle(document.documentElement);
  ctx.fillStyle = styles.backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = '600 28px sans-serif';
  ctx.fillText(document.title || 'Open Design', 32, 56);
  ctx.font = '18px sans-serif';
  ctx.fillText(window.location.href, 32, 96);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(32, 132, Math.max(96, width - 64), 6);
  ctx.fillStyle = '#374151';
  ctx.font = '16px sans-serif';
  ctx.fillText(`viewport ${width}x${height}`, 32, 168);
  ctx.fillText(`captured ${new Date().toISOString()}`, 32, 196);
  return canvas.toDataURL('image/png');
})()"##;
        let value = eval_in_window(state, window, expression, 5_000).await?;
        let data_url = value
            .get("value")
            .and_then(Value::as_str)
            .ok_or_else(|| "Tauri screenshot eval did not return a data URL".to_string())?;
        let encoded = data_url
            .strip_prefix("data:image/png;base64,")
            .ok_or_else(|| "Tauri screenshot eval returned a non-PNG data URL".to_string())?;
        let bytes = general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| format!("Tauri screenshot PNG could not be decoded: {error}"))?;
        fs::write(&output_path, bytes)
            .map_err(|error| format!("Tauri screenshot PNG could not be written: {error}"))?;
        Ok(json!({ "path": output_path.to_string_lossy() }))
    }
}

fn validate_directory(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("path must be a non-empty string".to_string());
    }
    let raw = Path::new(path);
    if !raw.is_absolute() {
        return Err("path must be absolute".to_string());
    }
    let resolved = fs::canonicalize(raw).map_err(|_| "path does not exist".to_string())?;
    let metadata = fs::metadata(&resolved).map_err(|_| "path could not be stat'd".to_string())?;
    if !metadata.is_dir() {
        return Err("path is not a directory".to_string());
    }
    if resolved
        .to_string_lossy()
        .to_ascii_lowercase()
        .ends_with(".app")
    {
        return Err("application bundles are not project directories".to_string());
    }
    Ok(resolved)
}

fn is_open_path_allowed(project_body: &Value) -> Result<(), String> {
    let metadata = project_body
        .pointer("/project/metadata")
        .unwrap_or(&Value::Null);
    let has_base_dir = metadata
        .get("baseDir")
        .and_then(Value::as_str)
        .map(|value| !value.is_empty())
        .unwrap_or(false);
    let from_trusted_picker = metadata
        .get("fromTrustedPicker")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if has_base_dir && !from_trusted_picker {
        return Err("project did not come from the trusted picker flow".to_string());
    }
    Ok(())
}

fn sign_import_token(secret: &[u8], base_dir: &str) -> Result<String, String> {
    let mut nonce = [0_u8; 16];
    OsRng.fill_bytes(&mut nonce);
    let nonce = general_purpose::URL_SAFE_NO_PAD.encode(nonce);
    let exp = (Utc::now() + chrono::Duration::seconds(IMPORT_TOKEN_TTL_SECONDS))
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    let mut mac = HmacSha256::new_from_slice(secret).map_err(|error| error.to_string())?;
    mac.update(format!("{base_dir}\n{nonce}\n{exp}").as_bytes());
    let signature = general_purpose::URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    Ok([nonce, exp, signature].join(IMPORT_TOKEN_FIELD_SEP))
}

async fn post_import_once(
    state: &AppState,
    api_url: &str,
    base_dir: &str,
    init: &PickAndImportInit,
) -> Result<reqwest::Response, String> {
    let mut body = json!({ "baseDir": base_dir });
    if let Some(name) = &init.name {
        body["name"] = json!(name);
    }
    if init.skill_id.is_some() {
        body["skillId"] = json!(init.skill_id);
    }
    if init.design_system_id.is_some() {
        body["designSystemId"] = json!(init.design_system_id);
    }
    let token = sign_import_token(state.auth_secret.as_ref(), base_dir)?;
    state
        .http
        .post(format!(
            "{}/api/import/folder",
            api_url.trim_end_matches('/')
        ))
        .header("Content-Type", "application/json")
        .header(IMPORT_TOKEN_HEADER, token)
        .body(body.to_string())
        .send()
        .await
        .map_err(|error| format!("daemon fetch failed: {error}"))
}

async fn import_folder(state: &AppState, base_dir: String, init: PickAndImportInit) -> Value {
    let Some(api_url) = state.current_api_url() else {
        return json!({ "ok": false, "reason": "daemon API URL not available" });
    };
    let mut resp = match post_import_once(state, &api_url, &base_dir, &init).await {
        Ok(resp) => resp,
        Err(reason) => return json!({ "ok": false, "reason": reason }),
    };

    if resp.status().as_u16() == 503 {
        let body = resp.json::<Value>().await.unwrap_or(Value::Null);
        let code = body.pointer("/error/code").and_then(Value::as_str);
        if code == Some("DESKTOP_AUTH_PENDING") && register_desktop_auth(state).await {
            match post_import_once(state, &api_url, &base_dir, &init).await {
                Ok(retry) => resp = retry,
                Err(reason) => return json!({ "ok": false, "reason": reason }),
            }
        } else {
            return json!({
                "ok": false,
                "reason": "daemon returned HTTP 503",
                "details": body
            });
        }
    }

    let status = resp.status();
    let body = resp.json::<Value>().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return json!({
            "ok": false,
            "reason": format!("daemon returned HTTP {}", status.as_u16()),
            "details": body
        });
    }
    json!({ "ok": true, "response": body })
}

async fn handle_ipc_message(
    state: AppState,
    window: WebviewWindow,
    message: Value,
) -> Result<Value, String> {
    let message_type = message
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "sidecar message type must be a string".to_string())?;
    match message_type {
        SIDECAR_MESSAGE_STATUS => {
            serde_json::to_value(state.snapshot()).map_err(|error| error.to_string())
        }
        SIDECAR_MESSAGE_EVAL => {
            let expression = message
                .pointer("/input/expression")
                .and_then(Value::as_str)
                .ok_or_else(|| "desktop eval expression must be a string".to_string())?;
            eval_in_window(&state, &window, expression, 5_000).await
        }
        SIDECAR_MESSAGE_CLICK => {
            let selector = message
                .pointer("/input/selector")
                .and_then(Value::as_str)
                .ok_or_else(|| "desktop click selector must be a string".to_string())?;
            click_selector(&state, &window, selector).await
        }
        SIDECAR_MESSAGE_CONSOLE => Ok(json!({ "entries": [] })),
        SIDECAR_MESSAGE_SCREENSHOT => {
            let path = message
                .pointer("/input/path")
                .and_then(Value::as_str)
                .ok_or_else(|| "desktop screenshot path must be a string".to_string())?;
            capture_screenshot(&state, &window, path).await
        }
        SIDECAR_MESSAGE_EXPORT_PDF => {
            Err("Tauri native PDF export is not implemented yet".to_string())
        }
        SIDECAR_MESSAGE_UPDATE => Err("Tauri native update is not implemented yet".to_string()),
        SIDECAR_MESSAGE_SHUTDOWN => {
            let handle = window.app_handle().clone();
            let shutdown_state = state.clone();
            tauri::async_runtime::spawn(async move {
                stop_packaged_sidecars(&shutdown_state);
                tokio::time::sleep(Duration::from_millis(20)).await;
                handle.exit(0);
            });
            Ok(json!({ "accepted": true }))
        }
        other => Err(format!("unknown desktop sidecar message: {other}")),
    }
}

async fn serve_ipc_connection<S>(state: AppState, window: WebviewWindow, stream: S)
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    let response = match reader.read_line(&mut line).await {
        Ok(0) => json_error("empty IPC request"),
        Ok(_) => match serde_json::from_str::<Value>(line.trim_end()) {
            Ok(message) => match handle_ipc_message(state, window, message).await {
                Ok(result) => json_ok(result),
                Err(error) => json_error(error),
            },
            Err(error) => json_error(format!("IPC request was not JSON: {error}")),
        },
        Err(error) => json_error(format!("IPC read failed: {error}")),
    };
    let mut stream = reader.into_inner();
    let _ = stream.write_all(format!("{response}\n").as_bytes()).await;
}

fn start_ipc_server(state: AppState, window: WebviewWindow) {
    #[cfg(unix)]
    {
        use tokio::net::UnixListener;

        let socket_path = state.stamp.ipc.clone();
        tauri::async_runtime::spawn(async move {
            let path = Path::new(&socket_path);
            if let Some(parent) = path.parent() {
                if let Err(error) = tokio::fs::create_dir_all(parent).await {
                    eprintln!("[open-design tauri] failed to create IPC directory: {error}");
                    return;
                }
            }
            if path.exists() {
                let _ = tokio::fs::remove_file(path).await;
            }
            let listener = match UnixListener::bind(path) {
                Ok(listener) => listener,
                Err(error) => {
                    eprintln!("[open-design tauri] failed to bind desktop IPC: {error}");
                    return;
                }
            };

            loop {
                let Ok((stream, _addr)) = listener.accept().await else {
                    continue;
                };
                let state = state.clone();
                let window = window.clone();
                tokio::spawn(serve_ipc_connection(state, window, stream));
            }
        });
    }

    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ServerOptions;

        let pipe_path = state.stamp.ipc.clone();
        tauri::async_runtime::spawn(async move {
            let mut server = match ServerOptions::new()
                .first_pipe_instance(true)
                .create(&pipe_path)
            {
                Ok(server) => server,
                Err(error) => {
                    eprintln!("[open-design tauri] failed to bind desktop IPC: {error}");
                    return;
                }
            };

            loop {
                if let Err(error) = server.connect().await {
                    eprintln!("[open-design tauri] failed to accept desktop IPC client: {error}");
                    match ServerOptions::new().create(&pipe_path) {
                        Ok(next) => server = next,
                        Err(error) => {
                            eprintln!(
                                "[open-design tauri] failed to recreate desktop IPC pipe: {error}"
                            );
                            return;
                        }
                    }
                    continue;
                }

                let connected = server;
                server = match ServerOptions::new().create(&pipe_path) {
                    Ok(next) => next,
                    Err(error) => {
                        eprintln!(
                            "[open-design tauri] failed to create next desktop IPC pipe: {error}"
                        );
                        return;
                    }
                };
                tokio::spawn(serve_ipc_connection(
                    state.clone(),
                    window.clone(),
                    connected,
                ));
            }
        });
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = (state, window);
        eprintln!(
            "[open-design tauri] desktop IPC server is not implemented for this platform yet"
        );
    }
}

fn start_eval_callback_server(state: AppState, listener: std::net::TcpListener) {
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("[open-design tauri] failed to start eval callback listener: {error}");
                return;
            }
        };

        loop {
            let Ok((stream, _addr)) = listener.accept().await else {
                continue;
            };
            let state = state.clone();
            tokio::spawn(async move {
                if let Err(error) = handle_eval_callback_request(state, stream).await {
                    eprintln!("[open-design tauri] eval callback request failed: {error}");
                }
            });
        }
    });
}

async fn handle_eval_callback_request(
    state: AppState,
    stream: tokio::net::TcpStream,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

    let mut reader = BufReader::new(stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .await
        .map_err(|error| format!("eval callback request line read failed: {error}"))?;

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();
    let mut content_length = 0_usize;
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|error| format!("eval callback header read failed: {error}"))?;
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }

    let status = if method == "POST" {
        let id = path
            .strip_prefix("/eval/")
            .ok_or_else(|| "eval callback path did not include an id".to_string())?;
        if content_length > 1024 * 1024 {
            return Err("eval callback body was too large".to_string());
        }
        let mut body = vec![0_u8; content_length];
        reader
            .read_exact(&mut body)
            .await
            .map_err(|error| format!("eval callback body read failed: {error}"))?;
        let payload: Value = serde_json::from_slice(&body)
            .map_err(|error| format!("eval callback payload was not JSON: {error}"))?;
        let sender = state
            .eval_pending
            .lock()
            .expect("desktop eval lock poisoned")
            .remove(id);
        if let Some(sender) = sender {
            let _ = sender.send(payload);
            "204 No Content"
        } else {
            "404 Not Found"
        }
    } else if method == "OPTIONS" {
        "204 No Content"
    } else {
        "405 Method Not Allowed"
    };

    let response = format!(
        "HTTP/1.1 {status}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    reader
        .into_inner()
        .write_all(response.as_bytes())
        .await
        .map_err(|error| format!("eval callback response write failed: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn desktop_open_external(url: String) -> Result<bool, String> {
    if !is_http_url(&url) {
        return Ok(false);
    }
    open::that(url)
        .map(|_| true)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn desktop_open_project_path(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<String, String> {
    if !is_safe_project_id(&project_id) {
        return Ok("open-path: project id contains disallowed characters".to_string());
    }
    let Some(api_url) = state.current_api_url() else {
        return Ok("open-path: daemon API URL not available".to_string());
    };
    let response = match state
        .http
        .get(format!(
            "{}/api/projects/{project_id}",
            api_url.trim_end_matches('/')
        ))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => return Ok(format!("open-path: daemon fetch failed: {error}")),
    };
    if !response.status().is_success() {
        return Ok(format!(
            "open-path: daemon returned HTTP {}",
            response.status().as_u16()
        ));
    }
    let body = match response.json::<Value>().await {
        Ok(body) => body,
        Err(_) => return Ok("open-path: daemon response was not JSON".to_string()),
    };
    let Some(resolved_dir) = body.get("resolvedDir").and_then(Value::as_str) else {
        return Ok("open-path: daemon response did not include resolvedDir".to_string());
    };
    if let Err(reason) = is_open_path_allowed(&body) {
        return Ok(format!("open-path: {reason}"));
    }
    let resolved = match validate_directory(resolved_dir) {
        Ok(path) => path,
        Err(reason) => return Ok(format!("open-path: {reason}")),
    };
    if env::var(TAURI_OPEN_PATH_DRY_RUN_ENV).ok().as_deref() == Some("1") {
        return Ok(String::new());
    }
    Ok(open::that(resolved)
        .map(|_| String::new())
        .unwrap_or_else(|error| error.to_string()))
}

#[tauri::command]
async fn desktop_pick_and_import(
    state: tauri::State<'_, AppState>,
    init: Option<PickAndImportInit>,
) -> Result<Value, String> {
    let picked = match env::var(TAURI_PICK_FOLDER_PATH_ENV) {
        Ok(path) => Some(PathBuf::from(path)),
        Err(_) => tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
            .await
            .map_err(|error| format!("folder picker failed: {error}"))?,
    };
    let Some(path) = picked else {
        return Ok(json!({ "ok": false, "canceled": true }));
    };
    let base_dir = path.to_string_lossy().trim().to_string();
    if base_dir.is_empty() {
        return Ok(json!({ "ok": false, "reason": "picker returned an empty path" }));
    }
    Ok(import_folder(
        &state,
        base_dir,
        init.unwrap_or(PickAndImportInit {
            name: None,
            skill_id: None,
            design_system_id: None,
        }),
    )
    .await)
}

#[tauri::command]
async fn desktop_inspect_eval_result(
    state: tauri::State<'_, AppState>,
    id: String,
    payload: Value,
) -> Result<(), String> {
    let sender = state
        .eval_pending
        .lock()
        .expect("desktop eval lock poisoned")
        .remove(&id);
    if let Some(sender) = sender {
        let _ = sender.send(payload);
        Ok(())
    } else {
        Err("unknown desktop eval callback id".to_string())
    }
}

fn main() {
    let stamp = match read_stamp() {
        Ok(stamp) => stamp,
        Err(error) => {
            eprintln!("[open-design tauri] {error}");
            process::exit(1);
        }
    };
    let mut secret = vec![0_u8; 32];
    OsRng.fill_bytes(&mut secret);
    let eval_listener = match std::net::TcpListener::bind("127.0.0.1:0") {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("[open-design tauri] failed to bind eval callback listener: {error}");
            process::exit(1);
        }
    };
    let eval_callback_url = match eval_listener.local_addr() {
        Ok(addr) => format!("http://{addr}"),
        Err(error) => {
            eprintln!("[open-design tauri] failed to read eval callback listener address: {error}");
            process::exit(1);
        }
    };
    if let Err(error) = eval_listener.set_nonblocking(true) {
        eprintln!("[open-design tauri] failed to configure eval callback listener: {error}");
        process::exit(1);
    }
    let web_ipc = sibling_ipc_path(&stamp.ipc, &stamp.namespace, APP_WEB);
    let daemon_ipc = sibling_ipc_path(&stamp.ipc, &stamp.namespace, APP_DAEMON);
    let state = AppState {
        auth_secret: Arc::new(secret),
        daemon_ipc,
        eval_callback_url,
        eval_pending: Arc::new(Mutex::new(HashMap::new())),
        http: reqwest::Client::new(),
        packaged_sidecars: Arc::new(Mutex::new(None)),
        status: Arc::new(Mutex::new(DesktopStatusState {
            title: Some("Open Design".to_string()),
            url: None,
            window_visible: true,
        })),
        stamp,
        web_ipc,
    };

    tauri::Builder::default()
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            desktop_open_external,
            desktop_open_project_path,
            desktop_pick_and_import,
            desktop_inspect_eval_result,
        ])
        .setup(move |app| {
            let window = app
                .get_webview_window("main")
                .ok_or_else(|| "missing main Tauri window".to_string())?;
            write_packaged_desktop_identity_marker(app, &state)?;
            if let Some(child) = start_packaged_sidecars(app, &state)? {
                *state
                    .packaged_sidecars
                    .lock()
                    .expect("packaged sidecar lock poisoned") = Some(child);
            }
            set_status_title(&state, window.title().ok());
            start_eval_callback_server(state.clone(), eval_listener);
            start_ipc_server(state.clone(), window.clone());
            let poll_state = state.clone();
            let poll_window = window.clone();
            tauri::async_runtime::spawn(async move {
                if !register_desktop_auth(&poll_state).await {
                    eprintln!(
                        "[open-design tauri] initial import-token handshake with daemon did not complete; \
                         first folder-import attempt will retry registration before failing"
                    );
                }
                poll_web_url(poll_state, poll_window).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Open Design Tauri desktop");
}
