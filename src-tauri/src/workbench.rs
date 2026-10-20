use crate::{args_for, aws_executable, execute, execute_with_attempts, Query, Runner};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct Workbench {
    enabled: AtomicBool,
    sequence: AtomicU64,
    pending: Mutex<HashMap<String, Pending>>,
}
struct Pending {
    query: ApiQuery,
    account: String,
    created: Instant,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApiQuery {
    pub service: String,
    pub operation: String,
    pub profile: String,
    pub region: String,
    pub input: Value,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    id: String,
    name: String,
    operations: usize,
}
fn valid_id(s: &str) -> bool {
    s.as_bytes().first().is_some_and(u8::is_ascii_lowercase)
        && s.len() < 100
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn model_root() -> Result<PathBuf, String> {
    let exe = aws_executable()?;
    let root = exe
        .parent()
        .ok_or("AWS CLI directory unavailable")?
        .join("awscli/botocore/data");
    if !root.is_dir() {
        return Err("Service catalog requires the standard Windows AWS CLI v2 installation. Existing resource screens remain available.".into());
    }
    Ok(root)
}
fn model(service: &str) -> Result<Value, String> {
    if !valid_id(service) {
        return Err("Invalid service identifier".into());
    }
    let directory = model_root()?.join(if service == "s3api" { "s3" } else { service });
    let mut versions: Vec<_> = std::fs::read_dir(directory)
        .map_err(|_| "Service model not found")?
        .flatten()
        .map(|e| e.path().join("service-2.json"))
        .filter(|p| p.is_file())
        .collect();
    versions.sort();
    let path = versions.last().ok_or("Service model is unavailable")?;
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&data).map_err(|e| e.to_string())
}
// Equivalent CamelCase acronym boundaries to botocore's xform_name.
fn cli_name(name: &str) -> String {
    let c: Vec<char> = name.chars().collect();
    let mut out = String::new();
    for (i, ch) in c.iter().enumerate() {
        if i > 0
            && ch.is_ascii_uppercase()
            && (c[i - 1].is_ascii_lowercase()
                || c[i - 1].is_ascii_digit()
                || (c[i - 1].is_ascii_uppercase()
                    && c.get(i + 1).is_some_and(char::is_ascii_lowercase)))
        {
            out.push('-');
        }
        out.push(ch.to_ascii_lowercase());
    }
    out
}
fn operation<'a>(m: &'a Value, name: &str) -> Result<&'a Value, String> {
    if !valid_id(name) {
        return Err("Invalid operation identifier".into());
    }
    m["operations"]
        .as_object()
        .ok_or("Invalid service model")?
        .iter()
        .find(|(key, _)| cli_name(key) == name)
        .map(|(_, v)| v)
        .ok_or("Operation is not in the installed service model".into())
}
fn binary_shape(m: &Value, name: &str, depth: usize) -> bool {
    if depth > 12 {
        return false;
    }
    let shape = &m["shapes"][name];
    if shape["type"] == "blob" || shape["eventstream"] == true || shape["streaming"] == true {
        return true;
    }
    if let Some(members) = shape["members"].as_object() {
        return members.values().any(|v| {
            v["streaming"] == true
                || v["shape"]
                    .as_str()
                    .is_some_and(|s| binary_shape(m, s, depth + 1))
        });
    }
    ["member", "key", "value"].iter().any(|key| {
        shape[key]["shape"]
            .as_str()
            .is_some_and(|s| binary_shape(m, s, depth + 1))
    })
}
fn supported(m: &Value, op: &Value) -> bool {
    ["input", "output"].iter().all(|key| {
        !op[key]["shape"]
            .as_str()
            .is_some_and(|s| binary_shape(m, s, 0))
    })
}
fn read_only(service: &str, operation: &str) -> bool {
    matches!(
        (service, operation),
        (
            "ec2",
            "describe-instances"
                | "describe-vpcs"
                | "describe-subnets"
                | "describe-security-groups"
        ) | ("rds", "describe-db-instances" | "describe-db-clusters")
            | (
                "s3api",
                "list-buckets" | "list-objects-v2" | "get-bucket-location"
            )
            | (
                "logs",
                "describe-log-groups"
                    | "describe-log-streams"
                    | "filter-log-events"
                    | "get-log-events"
            )
            | ("sts", "get-caller-identity")
            | ("lambda", "list-functions")
            | ("ecs", "list-clusters" | "list-services")
            | ("eks", "list-clusters")
            | ("dynamodb", "list-tables")
            | ("cloudformation", "list-stacks")
            | ("cloudwatch", "list-alarms" | "describe-alarms")
    )
}
fn validate(q: &ApiQuery) -> Result<Vec<String>, String> {
    let m = model(&q.service)?;
    let op = operation(&m, &q.operation)?;
    if !supported(&m, op) {
        return Err("Binary and streaming operations need a dedicated adapter and are not supported in the API Runner.".into());
    }
    let input = q.input.as_object().ok_or("Input must be a JSON object")?;
    if q.input.to_string().len() > 1024 * 1024 {
        return Err("Input exceeds 1 MiB".into());
    }
    let shape = &m["shapes"][op["input"]["shape"].as_str().unwrap_or("")];
    for field in input.keys() {
        if shape["members"].get(field).is_none() {
            return Err(format!("Unknown input field: {field}"));
        }
    }
    if let Some(required) = shape["required"].as_array() {
        for field in required.iter().filter_map(Value::as_str) {
            if !input.contains_key(field) {
                return Err(format!("Required field: {field}"));
            }
        }
    }
    let mut args = args_for(&Query {
        service: "ec2".into(),
        profile: q.profile.clone(),
        region: q.region.clone(),
        next_token: None,
    })?;
    args[0] = q.service.clone();
    args[1] = q.operation.clone();
    args.retain(|a| a != "--max-items=100");
    args.extend([
        "--no-paginate".into(),
        "--cli-input-json".into(),
        q.input.to_string(),
    ]);
    Ok(args)
}
#[tauri::command]
pub async fn service_catalog() -> Result<Vec<Service>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut services = Vec::new();
        for entry in std::fs::read_dir(model_root()?)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if !entry.path().is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            let id = if id == "s3" { "s3api".into() } else { id };
            if let Ok(m) = model(&id) {
                services.push(Service {
                    id,
                    name: m["metadata"]["serviceFullName"]
                        .as_str()
                        .unwrap_or("AWS")
                        .into(),
                    operations: m["operations"].as_object().map_or(0, |v| v.len()),
                });
            }
        }
        services.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(services)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn service_operations(service: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let m = model(&service)?;
        let mut items = Vec::new();
        for (name,op) in m["operations"].as_object().ok_or("Invalid model")? {
            let command = cli_name(name);
            let shape = &m["shapes"][op["input"]["shape"].as_str().unwrap_or("")];
            let fields: Vec<Value> = shape["members"].as_object().map(|fields| fields.iter().map(|(name,v)| json!({"name":name,"type":m["shapes"][v["shape"].as_str().unwrap_or("")]["type"],"required":shape["required"].as_array().is_some_and(|r| r.contains(&json!(name)))})).collect()).unwrap_or_default();
            items.push(json!({"name":command,"readOnly":read_only(&service,&command),"supported":supported(&m,op),"fields":fields}));
        }
        Ok(json!(items))
    }).await.map_err(|e| e.to_string())?
}

// Keep shape references rather than expanding recursive AWS models into trees.
fn input_schema(m: &Value, op: &Value) -> Result<Value, String> {
    let Some(root) = op["input"]["shape"].as_str() else {
        return Ok(json!({"root":"Empty","shapes":{"Empty":{"type":"structure","members":{}}}}));
    };
    let mut shapes = serde_json::Map::new();
    let mut pending = vec![root.to_owned()];
    while let Some(name) = pending.pop() {
        if shapes.contains_key(&name) {
            continue;
        }
        let source = m["shapes"][&name]
            .as_object()
            .ok_or("Missing input shape")?;
        let mut shape = serde_json::Map::new();
        for key in [
            "type",
            "documentation",
            "enum",
            "min",
            "max",
            "pattern",
            "sensitive",
            "required",
            "members",
            "member",
            "key",
            "value",
        ] {
            if let Some(value) = source.get(key) {
                shape.insert(key.into(), value.clone());
            }
        }
        if let Some(members) = source.get("members").and_then(Value::as_object) {
            pending.extend(
                members
                    .values()
                    .filter_map(|v| v["shape"].as_str().map(str::to_owned)),
            );
        }
        for key in ["member", "key", "value"] {
            if let Some(reference) = source.get(key).and_then(|v| v["shape"].as_str()) {
                pending.push(reference.to_owned());
            }
        }
        shapes.insert(name, Value::Object(shape));
    }
    Ok(json!({"root":root,"shapes":shapes,"documentation":op["documentation"]}))
}

#[tauri::command]
pub async fn api_input_schema(service: String, operation: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let m = model(&service)?;
        input_schema(&m, self::operation(&m, &operation)?)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn set_advanced_enabled(
    enabled: bool,
    state: tauri::State<'_, Workbench>,
) -> Result<(), String> {
    state.enabled.store(enabled, Ordering::SeqCst);
    state
        .pending
        .lock()
        .map_err(|_| "Review store unavailable")?
        .clear();
    Ok(())
}
#[tauri::command]
pub async fn api_skeleton(
    service: String,
    operation: String,
    runner: tauri::State<'_, Runner>,
) -> Result<String, String> {
    let m = model(&service)?;
    let op = self::operation(&m, &operation)?;
    if !supported(&m, op) {
        return Err("Binary/streaming input is unsupported".into());
    }
    execute(
        vec![
            service,
            operation,
            "--generate-cli-skeleton".into(),
            "input".into(),
            "--no-cli-pager".into(),
            "--no-cli-auto-prompt".into(),
        ],
        &runner,
    )
    .await
}
async fn account(q: &ApiQuery, runner: &Runner) -> Result<String, String> {
    let mut args = args_for(&Query {
        service: "ec2".into(),
        profile: q.profile.clone(),
        region: q.region.clone(),
        next_token: None,
    })?;
    args[0] = "sts".into();
    args[1] = "get-caller-identity".into();
    args.retain(|a| a != "--max-items=100");
    let v: Value =
        serde_json::from_str(&execute(args, runner).await?).map_err(|e| e.to_string())?;
    let id = v["Account"]
        .as_str()
        .filter(|s| s.len() == 12 && s.bytes().all(|c| c.is_ascii_digit()))
        .ok_or("Cannot verify AWS account")?;
    Ok(id.into())
}
#[tauri::command]
pub async fn prepare_api(
    query: ApiQuery,
    state: tauri::State<'_, Workbench>,
    runner: tauri::State<'_, Runner>,
) -> Result<Value, String> {
    prepare(query, &state, &runner).await
}
async fn prepare(query: ApiQuery, state: &Workbench, runner: &Runner) -> Result<Value, String> {
    validate(&query)?;
    if !read_only(&query.service, &query.operation) && !state.enabled.load(Ordering::SeqCst) {
        return Err("Enable advanced API actions in Settings for this session first.".into());
    }
    let account = account(&query, runner).await?;
    let id = state.sequence.fetch_add(1, Ordering::SeqCst).to_string();
    let phrase = format!("{} {} {}", account, query.service, query.operation);
    let mut pending = state
        .pending
        .lock()
        .map_err(|_| "Review store unavailable")?;
    pending.retain(|_, p| p.created.elapsed() < Duration::from_secs(300));
    if pending.len() >= 16 {
        pending.clear();
    }
    pending.insert(
        id.clone(),
        Pending {
            query,
            account: account.clone(),
            created: Instant::now(),
        },
    );
    Ok(json!({"id":id,"account":account,"phrase":phrase}))
}
fn consume(state: &Workbench, id: &str, confirmation: &str) -> Result<Pending, String> {
    let p = state
        .pending
        .lock()
        .map_err(|_| "Review store unavailable")?
        .remove(id)
        .ok_or("Review expired or was already consumed. Review again.")?;
    if p.created.elapsed() >= Duration::from_secs(300) {
        return Err("Review expired. Review again.".into());
    }
    if confirmation != format!("{} {} {}", p.account, p.query.service, p.query.operation) {
        return Err("Confirmation does not match the reviewed request".into());
    }
    if !read_only(&p.query.service, &p.query.operation) && !state.enabled.load(Ordering::SeqCst) {
        return Err("Advanced actions are disabled".into());
    }
    Ok(p)
}
#[tauri::command]
pub async fn execute_api(
    review_id: String,
    confirmation: String,
    state: tauri::State<'_, Workbench>,
    runner: tauri::State<'_, Runner>,
) -> Result<String, String> {
    run_review(&review_id, &confirmation, &state, &runner).await
}
async fn run_review(
    review_id: &str,
    confirmation: &str,
    state: &Workbench,
    runner: &Runner,
) -> Result<String, String> {
    let pending = consume(state, review_id, confirmation)?;
    if account(&pending.query, runner).await? != pending.account {
        return Err("AWS account changed since review. Nothing was executed. Review again.".into());
    }
    if !read_only(&pending.query.service, &pending.query.operation)
        && !state.enabled.load(Ordering::SeqCst)
    {
        return Err("Advanced actions are disabled".into());
    }
    let attempts = if read_only(&pending.query.service, &pending.query.operation) {
        "2"
    } else {
        "1"
    };
    execute_with_attempts(validate(&pending.query)?, runner, attempts)
        .await
        .map_err(|e| format!("{e}\nIf the request reached AWS, changes may already have applied. Verify AWS state before retrying."))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_and_paths() {
        assert_eq!(cli_name("DescribeDBInstances"), "describe-db-instances");
        assert_eq!(cli_name("ListSSHPublicKeys"), "list-ssh-public-keys");
        assert!(!valid_id("../ec2"));
        assert!(!valid_id("--endpoint-url"));
    }
    #[test]
    fn review_is_single_use_and_bound_to_operation() {
        let state = Workbench::default();
        state.pending.lock().unwrap().insert(
            "1".into(),
            Pending {
                query: ApiQuery {
                    service: "sts".into(),
                    operation: "get-caller-identity".into(),
                    profile: "test".into(),
                    region: "us-east-1".into(),
                    input: json!({}),
                },
                account: "123456789012".into(),
                created: Instant::now(),
            },
        );
        assert!(consume(&state, "1", "123456789012 sts get-caller-identity").is_ok());
        assert!(consume(&state, "1", "123456789012 sts get-caller-identity").is_err());
        assert!(!read_only("ec2", "terminate-instances"));
        assert!(!read_only("iam", "get-login-profile"));
    }
    #[test]
    fn binary_operations_are_not_executable() {
        let m = json!({"shapes":{"Request":{"type":"structure","members":{"Body":{"shape":"Blob"}}},"Blob":{"type":"blob"}}});
        assert!(!supported(&m, &json!({"input":{"shape":"Request"}})));
    }
    #[test]
    fn input_schema_preserves_descriptions_constraints_and_recursive_references() {
        let m = json!({"shapes":{
            "Input":{"type":"structure","required":["Name"],"members":{
                "Name":{"shape":"Name","documentation":"<p>Resource name.</p>"},
                "Child":{"shape":"Input"}
            }},
            "Name":{"type":"string","min":1,"max":20,"enum":["one","two"],"sensitive":true},
            "Unrelated":{"type":"string"}
        }});
        let schema = input_schema(&m, &json!({"input":{"shape":"Input"}})).unwrap();
        assert_eq!(schema["shapes"].as_object().unwrap().len(), 2);
        assert_eq!(schema["shapes"]["Input"]["required"][0], "Name");
        assert_eq!(
            schema["shapes"]["Input"]["members"]["Name"]["documentation"],
            "<p>Resource name.</p>"
        );
        assert_eq!(schema["shapes"]["Name"]["min"], 1);
        assert_eq!(schema["shapes"]["Name"]["sensitive"], true);
        assert_eq!(schema["shapes"]["Name"]["enum"][1], "two");
        assert_eq!(input_schema(&m, &json!({})).unwrap()["root"], "Empty");
    }
    fn pending(operation: &str, age: u64) -> Pending {
        Pending {
            query: ApiQuery {
                service: "ec2".into(),
                operation: operation.into(),
                profile: "test".into(),
                region: "us-east-1".into(),
                input: json!({}),
            },
            account: "123456789012".into(),
            created: Instant::now() - Duration::from_secs(age),
        }
    }
    #[test]
    fn expired_wrong_and_disabled_reviews_never_execute() {
        let state = Workbench::default();
        state
            .pending
            .lock()
            .unwrap()
            .insert("expired".into(), pending("describe-instances", 301));
        assert!(
            consume(&state, "expired", "123456789012 ec2 describe-instances")
                .err()
                .unwrap()
                .contains("expired")
        );
        state
            .pending
            .lock()
            .unwrap()
            .insert("wrong".into(), pending("describe-instances", 0));
        assert!(consume(&state, "wrong", "wrong").is_err());
        state
            .pending
            .lock()
            .unwrap()
            .insert("write".into(), pending("terminate-instances", 0));
        assert!(consume(&state, "write", "123456789012 ec2 terminate-instances").is_err());
    }
    #[tokio::test]
    #[ignore = "requires locally installed Windows AWS CLI v2 models; no network"]
    async fn installed_models_and_skeleton() {
        let catalog = service_catalog().await.unwrap();
        assert!(catalog.len() > 100);
        let ops = service_operations("ec2".into()).await.unwrap();
        assert!(ops
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["name"] == "create-tags"));
        for (service, operation) in [
            ("ec2", "create-tags"),
            ("rds", "modify-db-instance"),
            ("s3api", "put-bucket-lifecycle-configuration"),
            ("logs", "filter-log-events"),
        ] {
            let schema = api_input_schema(service.into(), operation.into())
                .await
                .unwrap();
            let root = schema["root"].as_str().unwrap();
            let members = schema["shapes"][root]["members"].as_object().unwrap();
            assert!(!members.is_empty());
            assert!(members.values().any(|field| field["documentation"]
                .as_str()
                .is_some_and(|s| !s.is_empty())));
        }
        let query = ApiQuery {
            service: "ec2".into(),
            operation: "create-tags".into(),
            profile: "unused".into(),
            region: "us-east-1".into(),
            input: json!({}),
        };
        assert!(validate(&query).unwrap_err().contains("Required"));
        let runner = Runner(std::sync::Arc::new(tokio::sync::Semaphore::new(1)));
        let skeleton = execute(
            vec![
                "ec2".into(),
                "create-tags".into(),
                "--generate-cli-skeleton".into(),
                "input".into(),
            ],
            &runner,
        )
        .await
        .unwrap();
        assert!(serde_json::from_str::<Value>(&skeleton).unwrap()["Resources"].is_array());
        println!(
            "Local catalog: {} services; EC2 schema and CLI skeleton verified",
            catalog.len()
        );
    }
    #[tokio::test]
    #[ignore = "requires ORBIT_LIVE_PROFILE; STS read-only reviewed execution"]
    async fn live_reviewed_identity() {
        let profile = std::env::var("ORBIT_LIVE_PROFILE").expect("Set explicit profile");
        let region = std::env::var("ORBIT_LIVE_REGION").expect("Set explicit region");
        let runner = Runner(std::sync::Arc::new(tokio::sync::Semaphore::new(1)));
        let state = Workbench::default();
        let review = prepare(
            ApiQuery {
                service: "sts".into(),
                operation: "get-caller-identity".into(),
                profile,
                region,
                input: json!({}),
            },
            &state,
            &runner,
        )
        .await
        .unwrap();
        let result = run_review(
            review["id"].as_str().unwrap(),
            review["phrase"].as_str().unwrap(),
            &state,
            &runner,
        )
        .await
        .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&result).unwrap()["Account"],
            review["account"]
        );
        assert!(run_review(
            review["id"].as_str().unwrap(),
            review["phrase"].as_str().unwrap(),
            &state,
            &runner
        )
        .await
        .is_err());
    }
}
