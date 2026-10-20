# Release readiness

Orbit currently targets Windows x64 with AWS CLI v2 and WebView2. The current
installer is an **unsigned internal evaluation build**, not a signed public release.

## Reproducible checks

```powershell
npm ci
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run tauri build
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. It installs
for the current user and offers English and Korean. GitHub Actions runs the same
checks and retains an unsigned installer artifact for 14 days. CI never requires
AWS credentials or invokes the opt-in live integration test.

## Runtime protections

- Only allowlisted read operations are exposed through IPC; no shell commands.
- On Windows, prefer the standard AWS CLI v2 installation. Otherwise resolve an
  absolute executable through absolute PATH entries; never search the working directory.
- At most three CLI processes, five-second queue admission timeout, 40-second
  execution timeout, bounded stdout and stderr. Dropped CLI children are killed.
- Reconnect clears account context and cached resource data. Stale bootstrap,
  identity and resource responses cannot update a newer context.
- Pagination deduplicates overlapping rows and stops repeated cursors. Each view
  rejects additions beyond 5,000 rows or 8 MiB of serialized text without silently
  truncating results. Narrow S3 prefixes or log time/filter ranges to continue.
- Resource cache has at most 12 contexts. CloudWatch bodies remain in memory.
- Cloud content is HTML-escaped before rendering; CSP disallows remote scripts.

## Required before a public release

- Configure an owned Windows signing identity and verify signatures on executable
  and installer. No signing key or certificate is included in this repository.
- Test install, upgrade and uninstall in a clean Windows VM with and without an
  existing WebView2 runtime and AWS CLI installation.
- Exercise expired SSO, MFA/credential-process profiles, proxy networks, denied
  IAM operations, and bucket regions different from the selected region.
- Measure startup, memory and rendering with realistic large accounts. The display
  cap is a guardrail, not a performance benchmark or table virtualization.
- Add native desktop interaction tests. Current frontend tests simulate IPC in
  jsdom; the opt-in live test exercises Rust CLI calls, not native UI interaction.

Navigation discards obsolete results but does not cancel a running CLI request;
that process completes or times out. Credential-process descendants are not
managed as a Windows Job Object. Automatic updates are intentionally not enabled
until release hosting, signing and rollback are configured. Search filters only
loaded resource rows. No telemetry or crash-upload service is configured.

Packaging reference: https://v2.tauri.app/distribute/windows-installer/
