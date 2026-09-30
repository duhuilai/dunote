/// 返回当前正在运行的主程序（exe / 可执行二进制）的绝对路径。
///
/// 用途：Windows 静默更新时，安装程序只能覆盖安装目录里的文件，无法得知该目录；
/// 而新版安装后要自动拉起，必须知道可执行文件的位置。这里由 Rust 侧直接读取
/// `std::env::current_exe()`，比在前端猜测 `%LOCALAPPDATA%\<产品名>` 可靠
/// （用户可能自定义过 NSIS 的安装目录）。
#[tauri::command]
fn app_exe_path() -> String {
  std::env::current_exe()
    .map(|p| p.to_string_lossy().to_string())
    .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // 必须在 fs / dialog 之前注册：启动时恢复上次授权过的目录 scope
    .plugin(tauri_plugin_persisted_scope::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![app_exe_path])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
