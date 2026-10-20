#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod topology;
mod workbench;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tokio::{io::AsyncReadExt, process::Command, sync::Semaphore, time::timeout};

struct Runner(Arc<Semaphore>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Query {
    service: String,
    profile: String,
    region: String,
    next_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Page {
    rows: Vec<Value>,
    next_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowseQuery {
    profile: String,
    region: String,
    kind: String,
    resource: String,
    prefix: Option<String>,
    next_token: Option<String>,
    start_time: Option<i64>,
    end_time: Option<i64>,
    pattern: Option<String>,
}

fn browse_args(q: &BrowseQuery) -> Result<Vec<String>, String> {
    let mut args = args_for(&Query {
        service: "s3".into(),
        profile: q.profile.clone(),
        region: q.region.clone(),
        next_token: None,
    })?;
    args.retain(|a| a != "--max-items=100");
    if q.resource.is_empty() || q.resource.len() > 1024 || q.resource.contains('\0') {
        return Err("Invalid resource name.".into());
    }
    if q.next_token.as_ref().is_some_and(|t| t.len() > 16384) {
        return Err("Pagination token is too large.".into());
    }
    let mut input;
    match q.kind.as_str() {
        "objects" => {
            let prefix = q.prefix.as_deref().unwrap_or("");
            if prefix.len() > 1024 {
                return Err("S3 prefix is too long.".into());
            }
            args[0] = "s3api".into();
            args[1] = "list-objects-v2".into();
            input =
                json!({"Bucket": q.resource, "Prefix": prefix, "Delimiter": "/", "MaxKeys": 100});
            if let Some(token) = &q.next_token {
                input["ContinuationToken"] = json!(token);
            }
        }
        "events" => {
            let start = q.start_time.ok_or("A start time is required.")?;
            let end = q.end_time.ok_or("An end time is required.")?;
            if start < 0 || end <= start || end - start > 31 * 86400 * 1000 {
                return Err("Log time range must be valid and no longer than 31 days.".into());
            }
            args[0] = "logs".into();
            args[1] = "filter-log-events".into();
            input = json!({"logGroupName":q.resource,"startTime":start,"endTime":end,"limit":100});
            if let Some(token) = &q.next_token {
                input["nextToken"] = json!(token);
            }
            if let Some(pattern) = &q.pattern {
                if pattern.len() > 1024 {
                    return Err("Log filter pattern is too long.".into());
                }
                if !pattern.is_empty() {
                    input["filterPattern"] = json!(pattern);
                }
            }
        }
        _ => return Err("Unsupported browse operation.".into()),
    }
    // Service-native cursors: one API page, including empty pages with a next token.
    args.push("--no-paginate".into());
    args.push("--cli-input-json".into());
    args.push(input.to_string());
    Ok(args)
}

fn browse_page(kind: &str, value: Value) -> Page {
    let mut rows = Vec::new();
    if kind == "objects" {
        if let Some(prefixes) = value["CommonPrefixes"].as_array() {
            rows.extend(
                prefixes
                    .iter()
                    .map(|p| json!({"kind":"folder","Prefix":p["Prefix"]})),
            );
        }
        if let Some(objects) = value["Contents"].as_array() {
            rows.extend(objects.iter().map(|o| {
                let mut row = o.clone();
                row["kind"] = json!("file");
                row
            }));
        }
    } else {
        rows = value["events"].as_array().cloned().unwrap_or_default();
    }
    let token_key = if kind == "objects" {
        "NextContinuationToken"
    } else {
        "nextToken"
    };
    Page {
        rows,
        next_token: value[token_key].as_str().map(str::to_owned),
    }
}

#[tauri::command]
async fn browse_resources(
    query: BrowseQuery,
    runner: tauri::State<'_, Runner>,
) -> Result<Page, String> {
    let output = execute(browse_args(&query)?, &runner).await?;
    let value =
        serde_json::from_str(&output).map_err(|e| format!("Invalid AWS JSON response: {e}"))?;
    Ok(browse_page(&query.kind, value))
}

fn args_for(query: &Query) -> Result<Vec<String>, String> {
    if query.profile.is_empty()
        || query.profile.len() > 256
        || query.profile.chars().any(char::is_control)
    {
        return Err("Select a valid AWS profile.".into());
    }
    if query.region.is_empty()
        || query.region.len() > 64
        || !query
            .region
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
    {
        return Err("Invalid AWS region format.".into());
    }
    let operation = match query.service.as_str() {
        "ec2" => ["ec2", "describe-instances"],
        "rds" => ["rds", "describe-db-instances"],
        "s3" => ["s3api", "list-buckets"],
        "logs" => ["logs", "describe-log-groups"],
        _ => return Err("Unsupported resource operation.".into()),
    };
    let mut args: Vec<String> = operation.into_iter().map(str::to_owned).collect();
    args.extend([
        format!("--profile={}", query.profile),
        format!("--region={}", query.region),
        "--output=json".into(),
        "--no-cli-pager".into(),
        "--no-cli-auto-prompt".into(),
        "--cli-connect-timeout=10".into(),
        "--cli-read-timeout=20".into(),
        "--max-items=100".into(),
    ]);
    if let Some(token) = &query.next_token {
        if token.len() > 16384 {
            return Err("Pagination token is too large.".into());
        }
        args.push(format!("--starting-token={token}"));
    }
    Ok(args)
}

fn aws_executable() -> Result<std::path::PathBuf, String> {
    #[cfg(windows)]
    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        let installed = std::path::PathBuf::from(program_files).join("Amazon/AWSCLIV2/aws.exe");
        if installed.is_absolute() && installed.is_file() {
            return Ok(installed);
        }
    }
    let name = if cfg!(windows) { "aws.exe" } else { "aws" };
    if let Some(path) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&path).filter(|p| p.is_absolute()) {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    Err("AWS CLI was not found. Install AWS CLI v2 and restart Orbit.".into())
}

async fn execute(args: Vec<String>, runner: &Runner) -> Result<String, String> {
    execute_with_attempts(args, runner, "2").await
}

async fn execute_with_attempts(
    args: Vec<String>,
    runner: &Runner,
    attempts: &str,
) -> Result<String, String> {
    let _permit = timeout(Duration::from_secs(5), runner.0.acquire())
        .await
        .map_err(|_| "Too many pending requests. Try again shortly.")?
        .map_err(|_| "The command runner is closed.")?;
    let mut command = Command::new(aws_executable()?);
    command
        .args(args)
        .env("AWS_PAGER", "")
        .env("AWS_CLI_AUTO_PROMPT", "off")
        // Windows locale output (e.g. CP949) is not UTF-8. Preserve Unicode
        // resource names and log messages at the CLI boundary, without lossy decoding.
        .env("AWS_CLI_OUTPUT_ENCODING", "UTF-8")
        .env("AWS_MAX_ATTEMPTS", attempts)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot launch AWS CLI. Check its installation and PATH. ({e})"))?;
    let stdout = child.stdout.take().ok_or("Cannot open stdout.")?;
    let stderr = child.stderr.take().ok_or("Cannot open stderr.")?;
    // Bounded reads prevent a large response from exhausting desktop memory.
    let work = async {
        let read = |stream: Box<dyn tokio::io::AsyncRead + Send + Unpin>| async move {
            let mut data = Vec::new();
            stream
                .take(8 * 1024 * 1024 + 1)
                .read_to_end(&mut data)
                .await
                .map_err(|e| e.to_string())?;
            if data.len() > 8 * 1024 * 1024 {
                return Err("Response too large. Reduce the query range.".to_string());
            }
            Ok(data)
        };
        let (out, err) = tokio::try_join!(read(Box::new(stdout)), read(Box::new(stderr)))?;
        let status = child.wait().await.map_err(|e| e.to_string())?;
        if !status.success() {
            let message = String::from_utf8_lossy(&err);
            return Err(message.chars().take(2000).collect::<String>());
        }
        String::from_utf8(out).map_err(|e| e.to_string())
    };
    timeout(Duration::from_secs(40), work).await.map_err(|_| {
        "Request exceeded 40 seconds. Check network connectivity and AWS authentication."
            .to_string()
    })?
}

#[tauri::command]
async fn bootstrap(runner: tauri::State<'_, Runner>) -> Result<Value, String> {
    let version = execute(vec!["--version".into()], &runner).await?;
    let profiles = execute(vec!["configure".into(), "list-profiles".into()], &runner).await?;
    Ok(
        json!({"version": version.trim(), "profiles": profiles.lines().filter(|p| !p.trim().is_empty()).collect::<Vec<_>>()}),
    )
}

fn page_from(service: &str, value: Value) -> Page {
    let rows = if service == "ec2" {
        value["Reservations"]
            .as_array()
            .map(|reservations| {
                reservations
                    .iter()
                    .flat_map(|r| r["Instances"].as_array().cloned().unwrap_or_default())
                    .collect()
            })
            .unwrap_or_default()
    } else {
        let key = match service {
            "rds" => "DBInstances",
            "s3" => "Buckets",
            _ => "logGroups",
        };
        value[key].as_array().cloned().unwrap_or_default()
    };
    Page {
        rows,
        next_token: value["NextToken"].as_str().map(str::to_owned),
    }
}

#[tauri::command]
async fn list_resources(query: Query, runner: tauri::State<'_, Runner>) -> Result<Page, String> {
    let output = execute(args_for(&query)?, &runner).await?;
    let value = serde_json::from_str(&output)
        .map_err(|e| format!("Cannot parse AWS JSON response: {e}"))?;
    Ok(page_from(&query.service, value))
}

#[tauri::command]
async fn account_identity(query: Query, runner: tauri::State<'_, Runner>) -> Result<Value, String> {
    let mut args = args_for(&query)?;
    args[0] = "sts".into();
    args[1] = "get-caller-identity".into();
    args.retain(|a| a != "--max-items=100" && !a.starts_with("--starting-token="));
    let raw = execute(args, &runner).await?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(json!({"Account": value["Account"]}))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Runner(Arc::new(Semaphore::new(3))))
        .manage(workbench::Workbench::default())
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            list_resources,
            browse_resources,
            account_identity,
            topology::topology_query,
            topology::save_diagram,
            workbench::service_catalog,
            workbench::service_operations,
            workbench::api_input_schema,
            workbench::set_advanced_enabled,
            workbench::api_skeleton,
            workbench::prepare_api,
            workbench::execute_api
        ])
        .run(tauri::generate_context!())
        .expect("Unable to run Orbit");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn saturated_runner_has_a_bounded_wait() {
        let runner = Runner(Arc::new(Semaphore::new(0)));
        let result = timeout(Duration::from_secs(7), execute(vec![], &runner)).await;
        assert!(result.unwrap().unwrap_err().contains("pending requests"));
    }

    fn query(service: &str) -> Query {
        Query {
            service: service.into(),
            profile: "dev team".into(),
            region: "ap-northeast-2".into(),
            next_token: None,
        }
    }
    #[test]
    fn rejects_unknown_operations_and_invalid_region() {
        assert!(args_for(&query("terminate-instances")).is_err());
        let mut q = query("ec2");
        q.region = "--endpoint-url=http://example.com".into();
        assert!(args_for(&q).is_err());
    }
    #[test]
    fn profile_and_token_are_single_arguments() {
        let mut q = query("ec2");
        q.next_token = Some("token with spaces".into());
        let args = args_for(&q).unwrap();
        assert!(args.contains(&"--profile=dev team".into()));
        assert!(args.contains(&"--starting-token=token with spaces".into()));
    }
    #[test]
    fn flattens_ec2_reservations_and_preserves_pagination() {
        let page = page_from(
            "ec2",
            json!({"Reservations":[{"Instances":[{"InstanceId":"i-1"}]},{"Instances":[{"InstanceId":"i-2"}]}],"NextToken":"next"}),
        );
        assert_eq!(page.rows.len(), 2);
        assert_eq!(page.next_token.as_deref(), Some("next"));
    }

    fn browse(kind: &str) -> BrowseQuery {
        BrowseQuery {
            profile: "default".into(),
            region: "ap-northeast-2".into(),
            kind: kind.into(),
            resource: "test-bucket".into(),
            prefix: Some("한글 /a&b/".into()),
            next_token: Some("opaque/+==".into()),
            start_time: Some(1000),
            end_time: Some(2000),
            pattern: Some("\"error\"".into()),
        }
    }
    #[test]
    fn s3_native_pagination_counts_folders_and_preserves_unicode() {
        let args = browse_args(&browse("objects")).unwrap();
        assert_eq!(args[args.len() - 2], "--cli-input-json");
        let input: Value = serde_json::from_str(args.last().unwrap()).unwrap();
        assert_eq!(input["Prefix"], "한글 /a&b/");
        assert_eq!(input["ContinuationToken"], "opaque/+==");
        assert!(args.contains(&"--no-paginate".into()));
        let page = browse_page(
            "objects",
            json!({"CommonPrefixes":[{"Prefix":"folder/"}],"Contents":[{"Key":"test.txt","Size":1}],"NextContinuationToken":"next"}),
        );
        assert_eq!(page.rows.len(), 2);
        assert_eq!(page.rows[0]["kind"], "folder");
        assert_eq!(page.next_token.as_deref(), Some("next"));
    }

    #[test]
    #[ignore = "requires ORBIT_LIVE_PROFILE, ORBIT_LIVE_REGION and ORBIT_LIVE_BUCKET; read-only"]
    fn live_readonly_s3_unicode_output() {
        let mut q = browse("objects");
        q.profile = std::env::var("ORBIT_LIVE_PROFILE").expect("set ORBIT_LIVE_PROFILE");
        q.region = std::env::var("ORBIT_LIVE_REGION").expect("set ORBIT_LIVE_REGION");
        q.resource = std::env::var("ORBIT_LIVE_BUCKET").expect("set ORBIT_LIVE_BUCKET");
        q.prefix = None;
        q.next_token = None;
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let runner = Runner(Arc::new(Semaphore::new(1)));
                let raw = execute(browse_args(&q).unwrap(), &runner).await.unwrap();
                let page = browse_page("objects", serde_json::from_str(&raw).unwrap());
                assert!(
                    !raw.contains('\u{fffd}'),
                    "response contains replacement characters"
                );
                println!(
                    "S3 root: {} entries, Unicode: {}",
                    page.rows.len(),
                    !raw.is_ascii()
                );
                if let Some(folder) = page
                    .rows
                    .iter()
                    .find(|r| r["Prefix"].as_str().is_some_and(|s| !s.is_ascii()))
                {
                    q.prefix = folder["Prefix"].as_str().map(str::to_owned);
                    let child = execute(browse_args(&q).unwrap(), &runner).await.unwrap();
                    let child_page = browse_page("objects", serde_json::from_str(&child).unwrap());
                    println!("Unicode folder: {} entries", child_page.rows.len());
                }
            });
    }
    #[test]
    fn empty_log_page_can_have_more_results_and_time_range_is_bounded() {
        let page = browse_page("events", json!({"events":[],"nextToken":"more"}));
        assert!(page.rows.is_empty());
        assert_eq!(page.next_token.as_deref(), Some("more"));
        let mut q = browse("events");
        q.end_time = Some(32 * 86400 * 1000);
        assert!(browse_args(&q).is_err());
        assert!(browse_args(&browse("delete")).is_err());
    }

    /// Explicitly opt in with ORBIT_LIVE_PROFILE and ORBIT_LIVE_REGION.
    /// Uses the same command builders, runner and parsers as desktop IPC.
    #[test]
    #[ignore = "requires explicitly selected real AWS credentials; read-only API calls"]
    fn live_readonly_services_and_content() {
        let profile = std::env::var("ORBIT_LIVE_PROFILE").expect("set ORBIT_LIVE_PROFILE");
        let region = std::env::var("ORBIT_LIVE_REGION").expect("set ORBIT_LIVE_REGION");
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let runner = Runner(Arc::new(Semaphore::new(3)));
                let mut buckets = Vec::new();
                let mut groups = Vec::new();
                for service in ["rds", "s3", "logs"] {
                    let q = Query {
                        service: service.into(),
                        profile: profile.clone(),
                        region: region.clone(),
                        next_token: None,
                    };
                    let raw = execute(args_for(&q).unwrap(), &runner).await.unwrap();
                    let page = page_from(service, serde_json::from_str(&raw).unwrap());
                    println!("{service}: {} rows", page.rows.len());
                    if service == "s3" {
                        buckets = page.rows;
                    } else if service == "logs" {
                        groups = page.rows;
                    }
                }
                let bucket = std::env::var("ORBIT_LIVE_BUCKET")
                    .ok()
                    .or_else(|| buckets.first()?.get("Name")?.as_str().map(str::to_owned))
                    .expect("no bucket available");
                let mut q = BrowseQuery {
                    profile: profile.clone(),
                    region: region.clone(),
                    kind: "objects".into(),
                    resource: bucket,
                    prefix: None,
                    next_token: None,
                    start_time: None,
                    end_time: None,
                    pattern: None,
                };
                let raw = execute(browse_args(&q).unwrap(), &runner).await.unwrap();
                let page = browse_page("objects", serde_json::from_str(&raw).unwrap());
                println!(
                    "S3 root: {} entries, has_more={}",
                    page.rows.len(),
                    page.next_token.is_some()
                );
                if let Some(folder) = page.rows.iter().find(|r| r["kind"] == "folder") {
                    q.prefix = folder["Prefix"].as_str().map(str::to_owned);
                    let raw = execute(browse_args(&q).unwrap(), &runner).await.unwrap();
                    let child = browse_page("objects", serde_json::from_str(&raw).unwrap());
                    println!("S3 child folder: {} entries", child.rows.len());
                }
                let group = std::env::var("ORBIT_LIVE_LOG_GROUP")
                    .ok()
                    .or_else(|| {
                        groups
                            .first()?
                            .get("logGroupName")?
                            .as_str()
                            .map(str::to_owned)
                    })
                    .expect("no log group available");
                let end = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as i64;
                q.kind = "events".into();
                q.resource = group;
                q.prefix = None;
                q.start_time = Some(end - 86400 * 1000);
                q.end_time = Some(end);
                let raw = execute(browse_args(&q).unwrap(), &runner).await.unwrap();
                let page = browse_page("events", serde_json::from_str(&raw).unwrap());
                assert!(page.rows.iter().all(|r| r["message"].is_string()));
                println!(
                    "CloudWatch: {} messages, has_more={}",
                    page.rows.len(),
                    page.next_token.is_some()
                );
                if page.next_token.is_some() {
                    q.next_token = page.next_token;
                    let raw = execute(browse_args(&q).unwrap(), &runner).await.unwrap();
                    let next = browse_page("events", serde_json::from_str(&raw).unwrap());
                    println!("CloudWatch next page: {} messages", next.rows.len());
                }
            });
    }
}
