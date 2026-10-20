# Release readiness

Orbit currently targets Windows x64 with AWS CLI v2 and WebView2. The current
v0.1.0 release provides **unsigned public binaries**. Signing and clean-machine qualification remain outstanding.

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

- Resource browsers expose allowlisted reads. The API workbench validates operations
  against installed CLI models, uses JSON input without a shell, and requires
  one-use account-bound review before execution. Advanced actions default off.
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

## Remaining release hardening

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

## Service workbench validation

- 61 frontend regression tests and 13 ordinary Rust tests pass.
- Local integration reads 437 installed service models and verifies EC2 operation
  schema and CLI-generated input skeleton without a network request.
- Opt-in STS integration exercises the same review/execute implementation as IPC,
  verifies account binding, and rejects reuse of the consumed review.
- Browser sample UI verified: catalog search/category filter, full resource detail,
  EC2 edit payload and explicit review. No real mutation was performed.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml installed_models_and_skeleton -- --ignored --nocapture
$env:ORBIT_LIVE_PROFILE = 'YOUR_PROFILE'
$env:ORBIT_LIVE_REGION = 'YOUR_REGION'
cargo test --manifest-path src-tauri/Cargo.toml live_reviewed_identity -- --ignored
```

Advanced workbench coverage is model-driven, not equivalent to testing every AWS
operation. IAM authorization and detailed parameter constraints remain enforced
by AWS CLI/AWS. Application input validation checks modeled top-level fields and
required parameters. No automatic retries are performed by the UI; read-only calls allow two CLI attempts and potentially mutating workbench calls
use one CLI attempt. For an ambiguous write failure, verify
remote state before manually submitting another request.
