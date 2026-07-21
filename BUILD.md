# Building Thicket for Production

This guide explains how to build production executables for Thicket on different platforms.

## Prerequisites

- Node.js 18+ and npm
- Rust toolchain (see [Tauri Prerequisites](https://tauri.app/start/prerequisites/))
- Platform-specific requirements:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio Build Tools or MSVC
  - **Linux**: GTK 3.0+ development headers

## Building for Your Platform

### Quick Build (Current Platform)

To build for your current platform:

```bash
npm run build:prod
```

The executable will be generated in `src-tauri/target/release/bundle/`.

### macOS Builds

#### Universal Binary (Intel + Apple Silicon)

Builds a single executable that runs natively on both Intel and Apple Silicon Macs:

```bash
npm run build:prod:macos
```

Output: `src-tauri/target/release/bundle/macos/Thicket.app`

#### Intel Only

```bash
npm run build:prod:macos:intel
```

Output: `src-tauri/target/release/bundle/macos/Thicket.app`

#### Apple Silicon Only

```bash
npm run build:prod:macos:arm
```

Output: `src-tauri/target/release/bundle/macos/Thicket.app`

### Windows Build

```bash
npm run build:prod:windows
```

Output: `src-tauri/target/release/bundle/msi/Thicket_0.4.0_x64_en-US.msi`

### Linux Build

```bash
npm run build:prod:linux
```

Output: `src-tauri/target/release/bundle/appimage/thicket_0.4.0_amd64.AppImage`

## Build Output Locations

After a successful build, you'll find:

- **macOS**: `src-tauri/target/release/bundle/macos/Thicket.app`
- **Windows**: `src-tauri/target/release/bundle/msi/` (MSI installer)
- **Linux**: `src-tauri/target/release/bundle/appimage/` (AppImage)

## What's Built

Each production build includes:

1. **Frontend**: Optimized React/TypeScript bundle
2. **Backend**: Compiled Rust/Tauri runtime
3. **Native Bundles**: Platform-specific installers/executables

## Troubleshooting

### macOS Code Signing Issues

If you get signing errors on macOS, the build will still succeed but the app may need to be signed for distribution. For local/development use, you can bypass this:

```bash
# In src-tauri/tauri.conf.json, temporarily disable signing if needed
# (not recommended for production distribution)
```

### Cross-Platform Compilation

Note: Tauri cross-compilation support varies. For best results:

- Build on the platform you're targeting
- Or use cross-compilation toolchains if available for your OS

For example, to build Windows binaries on macOS/Linux typically requires:
- Windows: Build on Windows or with Windows cross-compiler
- Linux: Build on Linux or with Linux cross-compiler
- macOS: Build on macOS (or Linux with osxcross, advanced setup)

## Development vs Production

- **Dev**: `npm run tauri:dev` - Fast iteration with hot reload
- **Prod**: `npm run build:prod` - Optimized, bundled executable

## CI/CD Considerations

For automated builds across platforms, consider:

- GitHub Actions with matrix builds (`.github/workflows/`)
- Each platform built in its native environment
- Artifacts uploaded for distribution

See `.github/` for existing workflow examples.
