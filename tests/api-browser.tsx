import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { ApiWorkbench } from "../src/pages";
import { Notifications } from "../src/notifications";
import { setLanguage } from "../src/i18n";
import { applyTheme } from "../src/theme";
import schema from "./fixtures/create-tags-schema.json";
import "../src/styles.css";
setLanguage("ko");
applyTheme();
mockIPC((command) => {
  if (command === "service_operations")
    return [
      { name: "create-tags", supported: true, readOnly: false, fields: [] },
    ];
  if (command === "api_input_schema") return schema;
  throw Error("No AWS calls are available in this fixture.");
});
createRoot(document.getElementById("app")!).render(
  <Notifications>
    <main className="mx-auto max-w-6xl p-8">
      <ApiWorkbench
        ctx={{
          demo: false,
          profile: "test",
          region: "ap-northeast-2",
          navigate() {},
          clearCache() {},
        }}
        route={{ kind: "api", service: "ec2", operation: "create-tags" }}
      />
    </main>
  </Notifications>,
);
