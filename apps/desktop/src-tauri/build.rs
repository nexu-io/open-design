const COMMANDS: &[&str] = &[
    "desktop_open_external",
    "desktop_open_project_path",
    "desktop_pick_and_import",
    "desktop_inspect_eval_result",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to build Open Design Tauri app");
}
