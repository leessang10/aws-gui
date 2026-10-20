import { bindContextMenu, copyAction } from "./context-menu";
import { invoke } from "@tauri-apps/api/core";
import { language, setLanguage, type Language } from "./i18n";
import preview from "./catalog-preview.json";
import {
  escapeHtml as esc,
  readPreferences,
  savePreferences,
  category,
  filterCatalog,
  type CatalogService,
} from "./workspace-state";
import { mountExplorer } from "./explorer";
import "./workspace.css";
export type WorkspaceRoute = {
  kind: "resources" | "catalog" | "settings" | "api" | "detail";
  service?: string;
  resource?: Record<string, any>;
  operation?: string;
  input?: Record<string, unknown>;
};
type Context = {
  profile: string;
  region: string;
  demo: boolean;
  route: WorkspaceRoute;
  navigate: (route: WorkspaceRoute) => void;
  settingsChanged: (region?: string) => void;
  clearCache: () => void;
};
type Operation = {
  name: string;
  readOnly: boolean;
  supported: boolean;
  fields: { name: string; type: string; required: boolean }[];
};
type Review = { id: string; account: string; phrase: string };
let catalog: Promise<CatalogService[]> | undefined;
let advanced = false;
export const text = (ko: string, en: string) => (language === "ko" ? ko : en);
const native = ["ec2", "rds", "s3api", "logs"];
const button = (id: string, label: string, cls = "quiet") =>
  `<button id="${id}" class="${cls}">${label}</button>`;
function heading(title: string, desc: string) {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div></div>`;
}
export function mountWorkspace(root: HTMLElement, ctx: Context) {
  const live = () => root.isConnected;
  const error = (e: unknown) => {
    if (live()) {
      const target = root.querySelector<HTMLElement>(".workspace-error");
      if (target) {
        target.textContent = String(e);
        target.hidden = false;
      }
    }
  };
  const on = (id: string, fn: () => void) =>
    root.querySelector<HTMLElement>(`#${id}`)?.addEventListener("click", fn);
  if (ctx.route.kind === "settings") {
    const p = readPreferences();
    root.innerHTML =
      heading(
        text("설정", "Settings"),
        text(
          "앱 환경과 AWS 작업 범위를 관리합니다.",
          "Manage your workspace and AWS action controls.",
        ),
      ) +
      `
      <div class="settings-grid"><section><h2>${text("표시", "Appearance")}</h2><label>${text("언어", "Language")}<select id="pref-language"><option value="ko" ${language === "ko" ? "selected" : ""}>한국어</option><option value="en" ${language === "en" ? "selected" : ""}>English</option></select></label>
      <label>${text("목록 밀도", "Table density")}<select id="pref-density"><option value="comfortable">${text("기본", "Comfortable")}</option><option value="compact" ${p.density === "compact" ? "selected" : ""}>${text("촘촘하게", "Compact")}</option></select></label></section>
      <section><h2>${text("연결", "Connection")}</h2><label>${text("기본 리전", "Default region")}<input id="pref-region" value="${esc(ctx.region)}" pattern="[a-z0-9-]+"></label><p>${text("인증 정보는 AWS CLI에서 관리합니다. 앱은 자격 증명 파일을 수정하지 않습니다.", "Credentials are managed by AWS CLI. Orbit does not edit credential files.")}</p>${button("save-preferences", text("설정 저장", "Save preferences"), "primary")}</section>
      <section><h2>${text("고급 API 작업", "Advanced API actions")}</h2><label class="check-label"><input id="pref-advanced" type="checkbox" ${advanced ? "checked" : ""} ${ctx.demo ? "disabled" : ""}>${text("이번 실행 세션에서 변경 가능한 API 허용", "Allow potentially mutating APIs for this session")}</label><p>${text("앱을 다시 시작하면 해제됩니다. 각 실행은 계정·리전·입력을 검토한 뒤 별도로 확인합니다.", "Disabled on app restart. Each execution requires reviewing the account, region and input, then confirming explicitly.")}</p></section>
      <section><h2>${text("로컬 데이터", "Local data")}</h2><p>${text("즐겨찾기·언어·리전만 로컬에 저장됩니다. API 입력과 결과는 저장하지 않습니다.", "Only preferences and navigation history persist. API inputs and results are not saved.")}</p>${button("clear-cache", text("리소스 캐시 비우기", "Clear resource cache"))}</section></div><p id="settings-status" role="status"></p><pre tabindex="0" class="workspace-error" role="alert" hidden></pre>`;
    on("save-preferences", () => {
      const region = root
        .querySelector<HTMLInputElement>("#pref-region")!
        .value.trim();
      if (!/^[a-z0-9-]{1,64}$/.test(region))
        return error(text("리전 형식을 확인하세요.", "Enter a valid region."));
      try {
        setLanguage(
          root.querySelector<HTMLSelectElement>("#pref-language")!
            .value as Language,
        );
        p.density = root.querySelector<HTMLSelectElement>("#pref-density")!
          .value as typeof p.density;
        savePreferences(p);
        ctx.settingsChanged(region);
      } catch (e) {
        error(e);
      }
    });
    root.querySelector<HTMLInputElement>("#pref-advanced")!.onchange = async (
      e,
    ) => {
      const checkbox = e.target as HTMLInputElement;
      checkbox.disabled = true;
      try {
        await invoke("set_advanced_enabled", { enabled: checkbox.checked });
        advanced = checkbox.checked;
      } catch (e) {
        checkbox.checked = advanced;
        error(e);
      } finally {
        checkbox.disabled = false;
      }
    };
    on("clear-cache", () => {
      ctx.clearCache();
      root.querySelector("#settings-status")!.textContent = text(
        "캐시를 비웠습니다.",
        "Resource cache cleared.",
      );
    });
    return;
  }
  if (ctx.route.kind === "catalog") {
    root.innerHTML =
      heading(
        text("전체 서비스", "All services"),
        text(
          "검색해서 열고, 자주 쓰는 서비스만 즐겨찾기에 고정하세요.",
          "Find any service. Keep only your frequent services in the sidebar.",
        ),
      ) +
      `<div class="catalog-toolbar"><input id="catalog-search" placeholder="${text("서비스 이름, CLI ID 검색…", "Search service name or CLI ID…")}" aria-label="${text("서비스 검색", "Search services")}"><select id="catalog-category" aria-label="${text("분류", "Category")}"><option value="">${text("전체 분류", "All categories")}</option>${["Compute", "Storage", "Database", "Security", "Management", "Network", "AI / ML", "Analytics", "Other"].map((s) => `<option>${s}</option>`).join("")}</select></div><p id="catalog-count" role="status">${text("로컬 CLI 모델을 읽는 중…", "Reading local CLI models…")}</p><div id="catalog-results"></div><pre tabindex="0" class="workspace-error" role="alert" hidden></pre>`;
    let items: CatalogService[] = [];
    const draw = () => {
      const result = filterCatalog(
        items,
        root.querySelector<HTMLInputElement>("#catalog-search")!.value,
        root.querySelector<HTMLSelectElement>("#catalog-category")!.value,
      );
      root.querySelector("#catalog-count")!.textContent =
        `${result.length} / ${items.length} · ${ctx.demo ? text("미리보기 카탈로그", "Preview catalog") : text("설치된 CLI 서비스 모델", "Installed CLI service models")}`;
      const p = readPreferences();
      root.querySelector("#catalog-results")!.innerHTML =
        `<div class="catalog-grid">${result.map((s) => `<article class="service-card"><button class="service-title" data-open="${esc(s.id)}"><strong>${esc(s.id)}</strong><span>${esc(s.name)}</span></button><div><small>${esc(category(s.id))} · ${s.operations} APIs · ${native.includes(s.id) ? text("전용 화면", "Workspace") : text("API 작업대", "API workbench")}</small><button class="pin-button" data-pin="${esc(s.id)}" aria-label="${esc(s.id)} ${text("즐겨찾기", "favorite")}" aria-pressed="${p.favorites.includes(s.id)}">${p.favorites.includes(s.id) ? "★" : "☆"}</button></div></article>`).join("")}</div>`;
      root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach(
        (b) =>
          (b.onclick = () =>
            ctx.navigate({
              kind: native.includes(b.dataset.open!) ? "resources" : "api",
              service: b.dataset.open,
            })),
      );
      root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) =>
        bindContextMenu(b.closest<HTMLElement>(".service-card"), () => {
          const id = b.dataset.open!;
          const p = readPreferences();
          const pinned = p.favorites.includes(id);
          return [
            {
              label: text("서비스 열기", "Open service"),
              run: () => b.click(),
            },
            {
              label: text("API 작업대", "API workbench"),
              run: () => ctx.navigate({ kind: "api", service: id }),
            },
            {
              label: text(
                pinned ? "즐겨찾기에서 제거" : "즐겨찾기에 추가",
                pinned ? "Remove favorite" : "Add favorite",
              ),
              disabled: !pinned && p.favorites.length >= 8,
              run: () =>
                b
                  .closest(".service-card")
                  ?.querySelector<HTMLButtonElement>("[data-pin]")
                  ?.click(),
            },
            copyAction(text("서비스 ID 복사", "Copy service ID"), id),
          ];
        }),
      );
      root.querySelectorAll<HTMLButtonElement>("[data-pin]").forEach(
        (b) =>
          (b.onclick = () => {
            const id = b.dataset.pin!;
            const p = readPreferences();
            if (p.favorites.includes(id))
              p.favorites = p.favorites.filter((v) => v !== id);
            else if (p.favorites.length < 8) p.favorites.push(id);
            else
              return error(
                text(
                  "즐겨찾기는 최대 8개입니다.",
                  "Keep at most eight favorites.",
                ),
              );
            savePreferences(p);
            draw();
            window.dispatchEvent(new Event("orbit:navigation"));
          }),
      );
    };
    root.querySelector<HTMLInputElement>("#catalog-search")!.oninput = draw;
    root.querySelector<HTMLSelectElement>("#catalog-category")!.onchange = draw;
    const request = ctx.demo
      ? Promise.resolve(preview)
      : (catalog ??= invoke<CatalogService[]>("service_catalog").catch((e) => {
          catalog = undefined;
          throw e;
        }));
    void request
      .then((result) => {
        if (live()) {
          items = result;
          draw();
        }
      })
      .catch(error);
    return;
  }
  if (ctx.route.kind === "detail") {
    const row = ctx.route.resource!;
    const service = ctx.route.service!;
    const id = String(
      row.InstanceId ??
        row.DBInstanceIdentifier ??
        row.Name ??
        row.logGroupName,
    );
    const editable =
      service === "ec2" ||
      service === "logs" ||
      (service === "rds" && !String(row.Engine).startsWith("aurora"));
    root.innerHTML =
      `${button("back-resource", text("← 목록", "← Resources"))}` +
      heading(
        id,
        text(
          "리소스 상세 · 마지막 목록 조회 시점의 정보",
          "Resource details · snapshot from the last list refresh",
        ),
      ) +
      `<div class="detail-actions">${button("open-api", text("API 작업대 열기", "Open API workbench"))}</div><dl class="resource-facts">${Object.entries(
        row,
      )
        .filter(([, v]) => v === null || typeof v !== "object")
        .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
        .join(
          "",
        )}</dl>${editable ? `<section class="edit-section"><h2>${text("수정", "Edit")}</h2><p>${text("변경할 값을 입력한 뒤 다음 화면에서 실제 요청을 검토합니다.", "Enter the new value, then review the actual request on the next screen.")}</p>${service === "ec2" ? `<label>Name tag<input id="edit-value" maxlength="256" value="${esc(row.Tags?.find((tag: any) => tag.Key === "Name")?.Value ?? "")}"></label>` : service === "rds" ? `<label>${text("백업 보존 기간(일)", "Backup retention (days)")}<select id="edit-value"><option value="" ${row.BackupRetentionPeriod == null ? "selected" : ""}>${text("기간 선택", "Choose duration")}</option>${Array.from({ length: 36 }, (_, n) => `<option ${row.BackupRetentionPeriod === n ? "selected" : ""}>${n}</option>`).join("")}</select></label><p>${text("0일은 자동 백업을 비활성화합니다. 백업 활성화·비활성화 시 일시 중단될 수 있습니다. 0이 아닌 기간 간 변경은 유지보수 시간을 기다리지 않고 적용될 수 있습니다.", "Zero disables automated backups; enabling/disabling can briefly suspend I/O. Changes between nonzero periods can apply asynchronously before the maintenance window.")}</p>` : `<label>${text("로그 보존 기간(일)", "Log retention (days)")}<select id="edit-value"><option value="" ${row.retentionInDays == null ? "selected" : ""}>${text("기간 선택", "Choose duration")}</option>${[1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653].map((n) => `<option ${row.retentionInDays === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`}${button("edit-review", text("변경 요청 작성", "Prepare change"), "primary")}</section>` : ""}<details><summary>${text("전체 JSON", "Full JSON")}</summary><pre tabindex="0" class="api-output">${esc(JSON.stringify(row, null, 2))}</pre></details>${service === "s3api" || service === "logs" ? '<div id="resource-explorer"></div>' : ""}`;
    root.querySelector<HTMLElement>(".page-heading")!.tabIndex = 0;
    bindContextMenu(root.querySelector<HTMLElement>(".page-heading"), () => [
      copyAction(text("리소스 ID 복사", "Copy resource ID"), id),
      copyAction(text("JSON 복사", "Copy JSON"), JSON.stringify(row, null, 2)),
      {
        label: text("API 작업대", "API workbench"),
        run: () => ctx.navigate({ kind: "api", service }),
      },
      {
        label: text("수정 항목으로 이동", "Go to edit fields"),
        disabled: !editable,
        run: () => {
          root.querySelector<HTMLElement>("#edit-value")?.focus();
        },
      },
    ]);
    root
      .querySelectorAll<HTMLElement>(".resource-facts > div")
      .forEach((el) => {
        el.tabIndex = 0;
        bindContextMenu(el, () => [
          copyAction(
            text("값 복사", "Copy value"),
            el.querySelector("dd")?.textContent,
          ),
          copyAction(
            text("필드 이름 복사", "Copy field name"),
            el.querySelector("dt")?.textContent,
          ),
        ]);
      });
    on("back-resource", () => ctx.navigate({ kind: "resources", service }));
    on("open-api", () => ctx.navigate({ kind: "api", service }));
    on("edit-review", () => {
      const value = root.querySelector<HTMLInputElement>("#edit-value")!.value;
      if (service !== "ec2" && !value) return;
      ctx.navigate({
        kind: "api",
        service,
        operation:
          service === "ec2"
            ? "create-tags"
            : service === "rds"
              ? "modify-db-instance"
              : "put-retention-policy",
        input:
          service === "ec2"
            ? { Resources: [id], Tags: [{ Key: "Name", Value: value }] }
            : service === "rds"
              ? {
                  DBInstanceIdentifier: id,
                  BackupRetentionPeriod: Number(value),
                  ApplyImmediately: false,
                }
              : { logGroupName: id, retentionInDays: Number(value) },
      });
    });
    if (service === "s3api" || service === "logs")
      mountExplorer(root.querySelector<HTMLElement>("#resource-explorer")!, {
        profile: ctx.profile,
        region: ctx.region,
        demo: ctx.demo,
        service: service === "s3api" ? "s3" : "logs",
        resource: id,
      });
    return;
  }
  if (ctx.route.kind === "api") mountApi();
  function mountApi() {
    const service = ctx.route.service!;
    let operations: Operation[] = [];
    let selected: Operation | undefined;
    let review: Review | undefined;
    let generation = 0;
    let pending = false;
    let reviewedInput = "";
    root.innerHTML =
      `${button("back-catalog", text("← 전체 서비스", "← All services"))}` +
      heading(
        service,
        text(
          "작업을 고르고 입력을 작성한 뒤, 대상 계정과 요청을 검토하세요.",
          "Choose an operation and input, then review the target account and request.",
        ),
      ) +
      `${ctx.demo ? `<div class="demo-banner">${text("미리보기는 샘플 작업만 표시합니다. 실제 데스크톱 앱은 설치된 CLI의 작업 전체를 불러옵니다.", "Preview shows sample operations only. The desktop app loads every operation from the installed CLI model.")}</div>` : ""}<div class="api-layout"><aside class="operation-list"><label>${text("작업 검색", "Find operation")}<input id="operation-search" placeholder="list, describe, update…"></label><div id="operations">${text("불러오는 중…", "Loading…")}</div></aside><section class="api-editor"><h2 id="operation-title">${text("작업 선택", "Select an operation")}</h2><p id="operation-kind"></p><div id="fields"></div><div class="editor-heading"><label for="api-input">${text("요청 JSON", "Request JSON")}</label>${button("skeleton", text("입력 예시 생성", "Generate skeleton"))}</div><textarea id="api-input" spellcheck="false" rows="13">${esc(JSON.stringify(ctx.route.input ?? {}, null, 2))}</textarea><p>${text("한 번에 API 한 페이지를 조회합니다. 다음 페이지는 응답의 커서를 요청 JSON에 넣어 조회하세요. 입력 예시의 불필요한 필드는 삭제하세요.", "One API page per request. Supply the returned cursor in your next request for pagination. Remove unused skeleton fields.")}</p>${button("prepare-api", text("요청 검토", "Review request"), "primary")}<pre tabindex="0" class="workspace-error" role="alert" hidden></pre><div id="api-review"></div><div id="api-result" aria-live="polite"></div></section></div>`;
    on("back-catalog", () => ctx.navigate({ kind: "catalog" }));
    const input = root.querySelector<HTMLTextAreaElement>("#api-input")!;
    const invalidate = () => {
      generation++;
      review = undefined;
      root.querySelector("#api-review")!.innerHTML = "";
    };
    input.oninput = invalidate;
    const lock = (value: boolean) => {
      pending = value;
      input.disabled = value;
      root
        .querySelectorAll<HTMLButtonElement>(
          "#prepare-api,#skeleton,[data-operation]",
        )
        .forEach((b) => (b.disabled = value));
    };
    const select = (op: Operation) => {
      if (pending) return;
      invalidate();
      selected = op;
      root.querySelector("#operation-title")!.textContent = op.name;
      root.querySelector("#operation-kind")!.textContent = !op.supported
        ? text(
            "별도 어댑터가 필요한 바이너리·스트리밍 작업입니다.",
            "Binary/streaming operation: dedicated adapter required.",
          )
        : op.readOnly
          ? text(
              "조회 작업 · 실행 전 계정 확인",
              "Read operation · account review required",
            )
          : text(
              "변경 가능 작업 · 설정에서 고급 API를 허용해야 합니다.",
              "Potentially mutating operation · enable advanced actions in Settings.",
            );
      root.querySelector("#fields")!.innerHTML =
        `<details open><summary>${text("입력 필드", "Input fields")} (${op.fields.length})</summary><div class="field-list">${op.fields.map((f) => `<span><code>${esc(f.name)}</code> <small>${esc(f.type)}${f.required ? " *" : ""}</small></span>`).join("") || text("입력 없음", "No input")}</div></details>`;
      root.querySelector<HTMLButtonElement>("#prepare-api")!.disabled =
        !op.supported;
      root.querySelector<HTMLButtonElement>("#skeleton")!.disabled =
        !op.supported;
      drawOperations();
    };
    const drawOperations = () => {
      const q = root
        .querySelector<HTMLInputElement>("#operation-search")!
        .value.toLowerCase();
      root.querySelector("#operations")!.innerHTML = operations
        .filter((op) => op.name.includes(q))
        .map(
          (op) =>
            `<button data-operation="${esc(op.name)}" ${pending ? "disabled" : ""} class="${selected?.name === op.name ? "selected" : ""}">${esc(op.name)}<small>${!op.supported ? text("미지원", "Unsupported") : op.readOnly ? text("조회", "Read") : text("검토 필요", "Review required")}</small></button>`,
        )
        .join("");
      root
        .querySelectorAll<HTMLButtonElement>("[data-operation]")
        .forEach((b) =>
          bindContextMenu(b, () => [
            {
              label: text("작업 선택", "Select operation"),
              disabled: pending,
              run: () => b.click(),
            },
            copyAction(
              text("작업 이름 복사", "Copy operation name"),
              b.dataset.operation,
            ),
            copyAction(
              text("CLI 명령 이름 복사", "Copy CLI command name"),
              "aws " + service + " " + b.dataset.operation,
            ),
          ]),
        );
      root.querySelectorAll<HTMLButtonElement>("[data-operation]").forEach(
        (b) =>
          (b.onclick = () => {
            input.value = "{}";
            select(operations.find((op) => op.name === b.dataset.operation)!);
          }),
      );
    };
    root.querySelector<HTMLInputElement>("#operation-search")!.oninput =
      drawOperations;
    on("skeleton", () => {
      if (!selected || pending) return;
      invalidate();
      const epoch = generation;
      lock(true);
      void (
        ctx.demo
          ? Promise.resolve(
              JSON.stringify(
                Object.fromEntries(
                  selected.fields.map((f) => [
                    f.name,
                    f.type === "integer"
                      ? 0
                      : f.type === "list"
                        ? []
                        : "EDIT_ME",
                  ]),
                ),
                null,
                2,
              ),
            )
          : invoke<string>("api_skeleton", {
              service,
              operation: selected.name,
            })
      )
        .then((value) => {
          if (live() && epoch === generation) input.value = value;
        })
        .catch(error)
        .finally(() => {
          if (live()) lock(false);
        });
    });
    on("prepare-api", () => {
      if (!selected || !selected.supported || pending) return;
      invalidate();
      root.querySelector<HTMLElement>(".workspace-error")!.hidden = true;
      let value: unknown;
      try {
        value = JSON.parse(input.value);
        if (!value || Array.isArray(value) || typeof value !== "object")
          throw new Error(
            text("JSON 객체를 입력하세요.", "Input must be a JSON object."),
          );
      } catch (e) {
        error(e);
        return;
      }
      const epoch = generation;
      const operation = selected.name;
      reviewedInput = JSON.stringify(value, null, 2);
      lock(true);
      void (
        ctx.demo
          ? Promise.resolve({
              id: "demo",
              account: "000000000000",
              phrase: `000000000000 ${service} ${operation}`,
            })
          : invoke<Review>("prepare_api", {
              query: {
                service,
                operation,
                profile: ctx.profile,
                region: ctx.region,
                input: value,
              },
            })
      )
        .then((value) => {
          if (!live() || epoch !== generation) return;
          review = value;
          root.querySelector("#api-review")!.innerHTML =
            `<section class="review-panel"><h2>${text("실행 전 검토", "Review before execution")}</h2><dl><dt>${text("계정 / 프로필", "Account / profile")}</dt><dd>${esc(value.account)} / ${esc(ctx.profile)}</dd><dt>${text("리전 / 작업", "Region / operation")}</dt><dd>${esc(ctx.region)} / ${esc(service)} ${esc(operation)}</dd></dl><pre tabindex="0">${esc(reviewedInput)}</pre><p>${ctx.demo ? text("미리보기: 실제 AWS 작업은 실행하지 않습니다.", "Preview: no AWS operation will execute.") : text("변경 API는 실제 리소스에 영향을 주며 비용이 발생할 수 있습니다. 이 요청은 dry-run이 아닙니다.", "Mutation APIs affect real resources and may incur charges. This request is not a dry run.")}</p><label>${text("아래 문구를 입력하여 확인", "Type this phrase to confirm")}<code>${esc(value.phrase)}</code><input id="api-confirm" autocomplete="off" spellcheck="false"></label>${button("execute-api", text(ctx.demo ? "샘플 결과 보기" : "확인한 요청 실행", ctx.demo ? "Show sample result" : "Execute reviewed request"), "primary")}</section>`;
          const executeButton =
            root.querySelector<HTMLButtonElement>("#execute-api")!;
          executeButton.disabled = true;
          root.querySelector<HTMLInputElement>("#api-confirm")!.oninput = (
            e,
          ) => {
            executeButton.disabled =
              (e.target as HTMLInputElement).value !== review?.phrase;
          };
          on("execute-api", () => {
            if (!review || pending) return;
            const prepared = review;
            const confirmation =
              root.querySelector<HTMLInputElement>("#api-confirm")!.value;
            if (confirmation !== prepared.phrase) return;
            invalidate();
            lock(true);
            root.querySelector("#api-result")!.textContent = text(
              "실행 중…",
              "Executing…",
            );
            void (
              ctx.demo
                ? Promise.resolve(
                    JSON.stringify(
                      { preview: true, service, operation },
                      null,
                      2,
                    ),
                  )
                : invoke<string>("execute_api", {
                    reviewId: prepared.id,
                    confirmation,
                  })
            )
              .then((output) => {
                if (!live()) return;
                ctx.clearCache();
                let formatted = output;
                try {
                  formatted = JSON.stringify(JSON.parse(output), null, 2);
                } catch {
                  /* plain CLI text */
                }
                root.querySelector("#api-result")!.innerHTML =
                  `<h2>${text("실행 결과", "Result")}</h2><pre tabindex="0" class="api-output">${esc(formatted || text("성공 · 응답 본문 없음", "Success · empty response body"))}</pre>`;
              })
              .catch((e) => {
                if (live()) root.querySelector("#api-result")!.textContent = "";
                error(e);
              })
              .finally(() => {
                if (live()) lock(false);
              });
          });
        })
        .catch(error)
        .finally(() => {
          if (live()) lock(false);
        });
    });
    const demoOperations: Operation[] = [
      {
        name:
          ctx.route.operation ??
          ({
            ec2: "describe-instances",
            rds: "describe-db-instances",
            s3api: "list-buckets",
            logs: "describe-log-groups",
            lambda: "list-functions",
            sts: "get-caller-identity",
          }[service] ||
            "sample-operation"),
        readOnly: !ctx.route.operation,
        supported: true,
        fields: Object.keys(ctx.route.input ?? {}).map((name) => ({
          name,
          type: Array.isArray(ctx.route.input?.[name])
            ? "list"
            : typeof ctx.route.input?.[name] === "number"
              ? "integer"
              : "string",
          required: true,
        })),
      },
    ];
    void (
      ctx.demo
        ? Promise.resolve(demoOperations)
        : invoke<Operation[]>("service_operations", { service })
    )
      .then((items) => {
        if (!live()) return;
        operations = items;
        drawOperations();
        const op =
          operations.find((o) => o.name === ctx.route.operation) ??
          operations.find((o) => o.readOnly && o.supported) ??
          operations[0];
        if (op) select(op);
      })
      .catch(error);
  }
}
