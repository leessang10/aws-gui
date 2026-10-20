# Extensible AWS workspace

## Navigation

Keep a small sidebar: All services, up to eight favorites, five recent services,
and Settings. Search the entire installed CLI catalog by ID or official name;
filter by curated category and dedicated-screen availability. Four current resource
screens remain fast entry points. Every other modeled service opens an API workbench.
No network request is sent when merely browsing the catalog or operation schema.

## Settings

Language, default region, compact/comfortable table density and clearing resource
cache are durable preferences. Advanced API changes are disabled at process start
and must be enabled for the current session. AWS credential files remain CLI-owned.

## Details and changes

Resource drawers link to a full detail page with structured fields and raw JSON.
EC2 Name tags, non-Aurora RDS backup retention and CloudWatch retention have explicit edit forms. Other service
operations are available through the JSON workbench, with modeled required fields
and an optional CLI input skeleton. Resource edits prepare a concrete payload;
review includes account, profile, region, operation and exact input. Execution
requires typing the displayed confirmation phrase, consumes a one-use review token,
and verifies account identity again. No live writes are performed by development tests.

## Coverage

Discover the installed Windows AWS CLI v2 botocore service models at runtime. Read
models locally and expose service catalogs, operation lists and top-level parameter
schemas. Services without dedicated screens still have the common workbench.
Only operations validated against the local model can run; never expose shell
strings, global endpoint overrides or arbitrary command flags. Streaming/binary
operations and custom commands such as s3 sync require separate adapters and are
explicitly marked unsupported. This is broad API coverage, not a claim that every
AWS CLI customization has a purpose-built GUI.

## Runtime

Use existing bounded subprocess runner. Generic operations use a single API page;
returned service cursors can be supplied explicitly in the next JSON request.
Review tokens expire after five minutes, are invalidated when changing settings,
and never persist to disk. CLI timeout errors for mutations must warn that outcome
is unknown: do not automatically retry. Output and request inputs are in-memory only.

## Validation

Rust tests for model discovery, command naming, path traversal, schema validation,
read/mutation guards, review-token expiry and single consumption. Frontend tests for
catalog filtering, preferences, and context-safe review invalidation. Verify common
schema/skeletons and read-only execution against the installed CLI. Package Windows.

Parameter references: https://docs.aws.amazon.com/cli/latest/reference/rds/modify-db-instance.html and https://docs.aws.amazon.com/cli/latest/reference/logs/put-retention-policy.html
JSON input coverage: https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-skeleton.html
