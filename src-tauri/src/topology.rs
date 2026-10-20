use crate::{args_for, execute, Query, Runner};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyQuery {
    profile: String,
    region: String,
    kind: String,
    resource: Option<String>,
    next_token: Option<String>,
}

fn arguments(q: &TopologyQuery) -> Result<Vec<String>, String> {
    let (service, operation, parameter) = match q.kind.as_str() {
        "vpcs" => ("ec2", "describe-vpcs", None),
        "subnets" => ("ec2", "describe-subnets", None),
        "instances" => ("ec2", "describe-instances", None),
        "databases" => ("rds", "describe-db-instances", None),
        "loadBalancers" => ("elbv2", "describe-load-balancers", None),
        "targetGroups" => ("elbv2", "describe-target-groups", None),
        "buckets" => ("s3api", "list-buckets", None),
        "targets" => ("elbv2", "describe-target-health", Some("TargetGroupArn")),
        "lbAttributes" => (
            "elbv2",
            "describe-load-balancer-attributes",
            Some("LoadBalancerArn"),
        ),
        "bucketLocation" => ("s3api", "get-bucket-location", Some("Bucket")),
        "bucketNotifications" => (
            "s3api",
            "get-bucket-notification-configuration",
            Some("Bucket"),
        ),
        _ => return Err("Unsupported topology query.".into()),
    };
    let mut args = args_for(&Query {
        service: "ec2".into(),
        profile: q.profile.clone(),
        region: q.region.clone(),
        next_token: q.next_token.clone(),
    })?;
    args[0] = service.into();
    args[1] = operation.into();
    if let Some(key) = parameter {
        let resource = q.resource.as_deref().ok_or("Resource required.")?;
        if resource.is_empty() || resource.len() > 2048 || resource.chars().any(char::is_control) {
            return Err("Invalid topology resource.".into());
        }
        if q.next_token.is_some() {
            return Err("This topology query does not accept pagination.".into());
        }
        args.retain(|a| a != "--max-items=100");
        args.extend([
            "--cli-input-json".into(),
            json!({key: resource}).to_string(),
        ]);
    }
    Ok(args)
}

#[tauri::command]
pub async fn topology_query(
    query: TopologyQuery,
    runner: tauri::State<'_, Runner>,
) -> Result<Value, String> {
    let raw = execute(arguments(&query)?, &runner).await?;
    parse_response(&query.kind, &raw)
}

fn parse_response(kind: &str, raw: &str) -> Result<Value, String> {
    // AWS CLI emits no stdout for an empty S3 notification configuration.
    if kind == "bucketNotifications" && raw.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(raw).map_err(|e| format!("Invalid topology response: {e}"))
}

fn validate_export(format: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > 24 * 1024 * 1024 {
        return Err("Diagram exceeds the 24 MiB export limit.".into());
    }
    match format {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Ok(()),
        "pdf" if bytes.starts_with(b"%PDF-") => Ok(()),
        _ => Err("Only PNG and PDF diagram files can be saved.".into()),
    }
}

#[tauri::command]
pub async fn save_diagram(format: String, bytes: Vec<u8>) -> Result<Option<String>, String> {
    validate_export(&format, &bytes)?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Export infrastructure diagram")
        .set_file_name(format!("orbit-infrastructure.{format}"))
        .add_filter(format.to_uppercase(), &[format.as_str()])
        .save_file()
        .await;
    match file {
        Some(file) => {
            file.write(&bytes)
                .await
                .map_err(|e| format!("Cannot save diagram: {e}"))?;
            Ok(Some(file.path().display().to_string()))
        }
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn query(kind: &str) -> TopologyQuery {
        TopologyQuery {
            profile: "test".into(),
            region: "ap-northeast-2".into(),
            kind: kind.into(),
            resource: None,
            next_token: None,
        }
    }
    #[test]
    fn only_fixed_read_operations_are_allowed() {
        assert!(validate_export("exe", b"MZ").is_err());
        assert!(validate_export("png", b"%PDF-1.4").is_err());
        assert!(validate_export("png", b"\x89PNG\r\n\x1a\n").is_ok());
        assert!(validate_export("pdf", b"%PDF-1.4").is_ok());
        assert_eq!(
            parse_response("bucketNotifications", "").unwrap(),
            json!({})
        );
        assert!(parse_response("vpcs", "").is_err());
        assert!(arguments(&query("terminate-instances")).is_err());
        for kind in [
            "vpcs",
            "subnets",
            "instances",
            "databases",
            "loadBalancers",
            "targetGroups",
            "buckets",
        ] {
            let args = arguments(&query(kind)).unwrap();
            assert!(args[1].starts_with("describe-") || args[1] == "list-buckets");
            assert!(args.contains(&"--max-items=100".into()));
        }
    }
    #[test]
    fn resources_are_json_values_not_cli_arguments() {
        let mut q = query("targets");
        assert!(arguments(&q).is_err());
        q.resource = Some("--endpoint-url=bad".into());
        let args = arguments(&q).unwrap();
        let input: Value = serde_json::from_str(args.last().unwrap()).unwrap();
        assert_eq!(input["TargetGroupArn"], "--endpoint-url=bad");
        assert!(!args.contains(&"--max-items=100".into()));
        q.next_token = Some("cursor".into());
        assert!(arguments(&q).is_err());
    }
    #[tokio::test]
    #[ignore = "requires ORBIT_LIVE_PROFILE; fixed read-only topology queries"]
    async fn live_readonly_topology() {
        let profile = std::env::var("ORBIT_LIVE_PROFILE").expect("ORBIT_LIVE_PROFILE required");
        let region = std::env::var("ORBIT_LIVE_REGION").unwrap_or("ap-northeast-2".into());
        let runner = Runner(std::sync::Arc::new(tokio::sync::Semaphore::new(3)));
        for (kind, key, child, id_key) in [
            ("vpcs", "Vpcs", "", ""),
            ("subnets", "Subnets", "", ""),
            ("instances", "Reservations", "", ""),
            ("databases", "DBInstances", "", ""),
            (
                "loadBalancers",
                "LoadBalancers",
                "lbAttributes",
                "LoadBalancerArn",
            ),
            ("targetGroups", "TargetGroups", "targets", "TargetGroupArn"),
            ("buckets", "Buckets", "bucketLocation", "Name"),
        ] {
            let mut q = query(kind);
            q.profile = profile.clone();
            q.region = region.clone();
            let raw = execute(arguments(&q).unwrap(), &runner).await.expect(kind);
            let data: Value = serde_json::from_str(&raw).unwrap();
            let rows = data[key].as_array().expect(key);
            println!("{kind}: {} first-page entries", rows.len());
            if !child.is_empty() {
                if let Some(id) = rows.first().and_then(|r| r[id_key].as_str()) {
                    q.kind = child.into();
                    q.resource = Some(id.into());
                    let raw = execute(arguments(&q).unwrap(), &runner).await.expect(child);
                    let detail: Value = serde_json::from_str(&raw).unwrap();
                    println!("{child}: OK");
                    if kind == "buckets"
                        && detail["LocationConstraint"].as_str().unwrap_or("us-east-1") == region
                    {
                        q.kind = "bucketNotifications".into();
                        let raw = execute(arguments(&q).unwrap(), &runner)
                            .await
                            .expect("notifications");
                        let _ = parse_response("bucketNotifications", &raw).unwrap();
                        println!("bucketNotifications: OK");
                    }
                }
            }
        }
    }
}
