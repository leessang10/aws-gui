import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { text } from "./app-model";

export function awsDocsUrl(service: string, operation?: string) {
  const name = service === "s3" ? "s3api" : service;
  return `https://docs.aws.amazon.com/cli/latest/reference/${encodeURIComponent(name)}/${operation ? `${encodeURIComponent(operation)}.html` : "index.html"}`;
}

export function AwsDocsLink({
  service,
  operation,
  desktop,
  onError,
}: {
  service: string;
  operation?: string;
  desktop: boolean;
  onError: (message: string) => void;
}) {
  const href = awsDocsUrl(service, operation);
  return (
    <Button asChild variant="outline" size="sm">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (!desktop) return;
          event.preventDefault();
          void openUrl(href).catch((error) => onError(String(error)));
        }}
      >
        <ExternalLink />
        {text("AWS 공식 문서", "AWS documentation")}
      </a>
    </Button>
  );
}
