# Orbit — Local AWS workspace

2026-10-20 · Implementation design

## Product

An uncluttered desktop interface over the locally installed AWS CLI. The user
requested Tauri 2, Rust and TypeScript, with a cleaner, lighter and faster
experience than the AWS web console. Working directory: `aws-gui`, separate
from `woojoo-db`. Orbit is a provisional display name chosen by the builder.

## First usable slice

Windows first. A persistent sidebar offers EC2 instances, RDS databases,
S3 buckets, and CloudWatch log groups. The main workspace contains profile and
region controls, account identity, a searchable table, and a detail drawer.
S3 buckets open a prefix/object explorer; CloudWatch groups open an event viewer.
SSM terminals, SSO login buttons and resource mutations are future increments.
Counts describe loaded rows, not the whole account. S3 buckets are account-wide.

Profiles are discovered through `aws configure list-profiles`. Real resource
queries begin on refresh/context selection. Existing CLI authentication remains
owned by AWS CLI, including role/SSO/credential_process behavior. No credentials
are copied into application storage. An expired SSO session is reported with
instructions to log in externally. STS account identity is queried on connection
and context changes; profiles are not assumed to represent distinct accounts.

## Implementation decisions

Vanilla TypeScript + Vite minimizes framework overhead for this small first
version. Tauri's IPC exposes bootstrap and typed list operations. Rust maps
known service and browse requests to fixed AWS CLI operations and executes argument arrays
without a shell. Arbitrary commands and frontend-supplied CLI switches are not
supported. Windows console windows are hidden.

Each request has a 40-second deadline, bounded output, a maximum of three
concurrent processes, explicit JSON output, and disabled CLI pager/prompts.
AWS CLI pagination returns at most 100 items and an opaque continuation token.
UI data is keyed by mode/profile/region/service in memory, with a 30-second
freshness window. Navigation shows cached rows immediately, then refreshes stale
data. Request generations prevent late results from a previous context replacing
the current view. No background polling. No resource responses persisted to disk.
Profile/region, language (English/Korean) and sidebar preferences are persisted locally.

S3 uses `list-objects-v2` with delimiter `/`, MaxKeys 100 and service-native
continuation tokens. Folders and files share the page size. File selection shows
metadata and an S3 URI; there is no download, upload or object-content preview.
CloudWatch uses `filter-log-events`, a bounded time interval and an optional AWS
filter pattern. Each page has up to 100 events, including possibly zero events
with a continuation token. Paging preserves the original start/end/filter.
Both browse requests use `--no-paginate` and pass `--cli-input-json` as a separate
argument from its JSON value; the installed CLI does not process the equals form
correctly for required parameters. Late responses are ignored after closing or
navigating away from an explorer.

## Performance and limits

Fast navigation and local filtering are the first performance targets.
AWS network latency and CLI startup are still present: do not claim faster AWS
API execution. Use the OS webview instead of bundling Chromium. Large lists load
in pages; search only covers loaded rows. CPU/memory and cold-start benchmarks
must be measured later before making quantitative product claims.

## Failure states and validation

Handle missing CLI, no profiles, access denial, expired SSO, invalid regions,
timeouts, empty lists, and pagination. Preserve older rows on refresh failure and
label them as previous data. Browser preview is explicitly demo-only and must
never silently substitute sample data for a failed real request.

Validate frontend compilation, Rust operation allowlisting/argument boundaries/
EC2 flattening and pagination tests, and native compilation. Inspect browser
preview at desktop sizes. Native authenticated resource checks need an actual
chosen profile and are not performed against the user's account automatically.

## Next increments

1. S3 downloads/content previews and richer log filtering.
2. SSO authentication flow and profile favorites.
3. EC2 start/stop and RDS start/stop with explicit account/resource confirmation.
4. Native packaging/icons, keyboard/focus polish, large-list virtualization,
   measured performance budgets, macOS/Linux validation.

## References

- https://v2.tauri.app/develop/calling-rust/
- https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-pagination.html
- https://docs.aws.amazon.com/cli/latest/reference/s3api/list-objects-v2.html
- https://docs.aws.amazon.com/cli/latest/reference/logs/filter-log-events.html
