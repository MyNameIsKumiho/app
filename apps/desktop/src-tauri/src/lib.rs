//! Aetherfall desktop shell.
//!
//! The game itself is the same Next.js app as the web version. On launch the
//! shell starts that server with a bundled Node.js runtime on a random
//! localhost port, waits until it answers and then shows it in the window.
//! API keys live in a plain config file in the user's app config folder and
//! are passed to the server process only; the window never sees them.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct ServerProcess(Mutex<Option<Child>>);

const CONFIG_TEMPLATE: &str = "# Aetherfall settings. Keys stay on this computer and are read only by the local game server.\n\
# After editing, restart Aetherfall.\n\
\n\
# Claude API key (https://console.anthropic.com)\n\
ANTHROPIC_API_KEY=\n\
\n\
# OpenAI API key (also used for illustrations)\n\
OPENAI_API_KEY=\n\
\n\
# ChatGPT subscription via the official Codex CLI: install it (npm i -g @openai/codex),\n\
# run `codex login` and choose \"Sign in with ChatGPT\". Set CODEX_BIN if it is not on PATH.\n\
CHATGPT_SUBSCRIPTION_ENABLED=true\n\
CODEX_BIN=\n";

fn parse_env_file(path: &Path) -> HashMap<String, String> {
    let mut vars = HashMap::new();
    let Ok(text) = fs::read_to_string(path) else { return vars };
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                vars.insert(key.trim().to_string(), value.to_string());
            }
        }
    }
    vars
}

/// Windows resolves bundle paths to the verbatim form `\\?\C:\...`, which
/// Node.js cannot start a script from. Turn it back into a plain path.
fn plain_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path
}

fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

/// PATH for the server: the bundled `node` first (so the Codex CLI, itself a
/// Node script, can run), then common install folders that GUI apps on macOS
/// and Linux do not inherit from the shell.
fn server_path(exe_dir: &Path) -> String {
    let mut dirs: Vec<PathBuf> = vec![exe_dir.to_path_buf()];
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from) {
        dirs.push(home.join(".npm-global/bin"));
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".volta/bin"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        dirs.push(PathBuf::from(d));
    }
    if let Some(existing) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&existing));
    }
    std::env::join_paths(dirs).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

fn start_server(app: &tauri::AppHandle, port: u16) -> Result<(Child, PathBuf), String> {
    let exe_dir = plain_path(std::env::current_exe().map_err(|e| e.to_string())?.parent().map(Path::to_path_buf).ok_or("no exe dir")?);
    let node = exe_dir.join(if cfg!(windows) { "node.exe" } else { "node" });
    let server_root = plain_path(app.path().resource_dir().map_err(|e| e.to_string())?).join("server");
    let server_dir = server_root.join("apps").join("web");
    let server_js = server_dir.join("server.js");
    if !node.exists() {
        return Err(format!("Не найден встроенный Node.js: {}", node.display()));
    }
    if !server_js.exists() {
        return Err(format!("Не найден сервер приложения: {}", server_js.display()));
    }

    let data_dir = plain_path(app.path().app_data_dir().map_err(|e| e.to_string())?);
    let config_dir = plain_path(app.path().app_config_dir().map_err(|e| e.to_string())?);
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_file = config_dir.join("aetherfall.env");
    if !config_file.exists() {
        fs::write(&config_file, CONFIG_TEMPLATE).map_err(|e| e.to_string())?;
    }
    let log_path = data_dir.join("server.log");
    let log = OpenOptions::new().create(true).write(true).truncate(true).open(&log_path).map_err(|e| e.to_string())?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&node);
    cmd.arg(&server_js)
        .current_dir(&server_dir)
        .envs(parse_env_file(&config_file))
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("DATABASE_PATH", data_dir.join("aetherfall.db"))
        .env("AETHERFALL_DESKTOP", "1")
        .env("AETHERFALL_CONFIG_FILE", &config_file)
        .env("PATH", server_path(&exe_dir))
        // The bundled server is a copied pnpm layout without symlinks, so
        // transitive packages are found through pnpm's flat hoisted folder.
        .env("NODE_PATH", server_root.join("node_modules").join(".pnpm").join("node_modules"))
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let child = cmd.spawn().map_err(|e| format!("Не удалось запустить сервер: {e}"))?;
    Ok((child, log_path))
}

fn show_error(window: &WebviewWindow, message: &str) {
    let js = format!(
        "document.getElementById('status').textContent='Не удалось запустить игру';var e=document.getElementById('error');e.style.display='block';e.textContent={};",
        serde_json::to_string(message).unwrap_or_default()
    );
    let _ = window.eval(&js);
}

fn wait_and_open(app: tauri::AppHandle, window: WebviewWindow, port: u16, log_path: PathBuf) {
    std::thread::spawn(move || {
        let started = Instant::now();
        loop {
            if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                // Give Next.js a moment to finish booting its router.
                std::thread::sleep(Duration::from_millis(300));
                if let Ok(url) = Url::parse(&format!("http://127.0.0.1:{port}/")) {
                    let _ = window.navigate(url);
                }
                return;
            }
            let exited = app
                .state::<ServerProcess>()
                .0
                .lock()
                .ok()
                .and_then(|mut guard| guard.as_mut().and_then(|c| c.try_wait().ok().flatten()));
            if exited.is_some() || started.elapsed() > Duration::from_secs(90) {
                let tail = fs::read_to_string(&log_path).unwrap_or_default();
                let tail: String = tail.lines().rev().take(12).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
                show_error(&window, &format!("Сервер игры не ответил. Журнал: {}\n\n{}", log_path.display(), tail));
                return;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    });
}

fn stop_server(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<ServerProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Aetherfall")
                .inner_size(1400.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .build()?;
            let handle = app.handle().clone();
            match free_port().map_err(|e| e.to_string()).and_then(|port| start_server(&handle, port).map(|r| (port, r))) {
                Ok((port, (child, log_path))) => {
                    *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);
                    wait_and_open(handle, window, port, log_path);
                }
                Err(message) => {
                    // Let the loading page render before writing into it.
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(500));
                        show_error(&window, &message);
                    });
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Aetherfall");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_server(handle);
        }
    });
}
