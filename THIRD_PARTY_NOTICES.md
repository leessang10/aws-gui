# Third-party notices / 오픈소스 고지

Orbit 자체 코드는 [MIT](LICENSE)로 배포합니다. 아래 라이브러리, 글꼴, 아이콘과 포함된 UI 코드에는 각자의 라이선스가 적용되며 Orbit의 MIT 라이선스로 대체되지 않습니다.

Orbit's own code is MIT-licensed. Third-party code, fonts and icons retain their original licenses and copyright notices; Orbit's MIT license does not replace them.

## License texts / 라이선스 원문

- [Collected license texts](public/licenses/THIRD-PARTY-LICENSES.txt): installed direct frontend/backend dependencies and vendored shadcn/ui notices, including upstream copyright notices.
- [Pretendard SIL OFL 1.1](public/licenses/Pretendard-OFL.txt).
- [shadcn/ui MIT](public/licenses/shadcn-MIT.txt).

이 목록은 직접 사용한 주요 의존성과 포함한 UI·글꼴의 고지입니다. 전체 전이 의존성이나 빌드 도구의 완전한 목록은 아닙니다. 정확한 의존성 버전은 package-lock.json과 src-tauri/Cargo.lock에 기록됩니다. 재배포 시에는 실제 포함하는 의존성의 고지도 함께 보존하세요.

This list covers direct dependencies and vendored UI/font notices, not a complete inventory of transitive dependencies or build tools. Exact dependency versions are recorded in package-lock.json and src-tauri/Cargo.lock. Redistributors should also retain notices for the dependencies they include.

## Components

| Component                 | Version             | Declared license            | Upstream                                                  |
| ------------------------- | ------------------- | --------------------------- | --------------------------------------------------------- |
| @tauri-apps/api           | 2.12.4              | Apache-2.0 OR MIT           | [Source](https://github.com/tauri-apps/tauri)             |
| @tauri-apps/plugin-opener | 2.7.2               | MIT OR Apache-2.0           | [Source](https://github.com/tauri-apps/plugins-workspace) |
| @xyflow/react             | 12.12.0             | MIT                         | [Source](https://github.com/xyflow/xyflow)                |
| class-variance-authority  | 0.7.1               | Apache-2.0                  | [Source](https://github.com/joe-bell/cva)                 |
| clsx                      | 2.1.1               | MIT                         | [Source](https://github.com/lukeed/clsx)                  |
| elkjs                     | 0.12.0              | EPL-2.0 OR GPL-3.0-or-later | [Source](https://github.com/kieler/elkjs)                 |
| html-to-image             | 1.11.13             | MIT                         | [Source](https://github.com/bubkoo/html-to-image)         |
| jspdf                     | 4.2.1               | MIT                         | [Source](https://github.com/parallax/jsPDF)               |
| lucide-react              | 1.60.0              | ISC                         | [Source](https://github.com/lucide-icons/lucide)          |
| pretendard                | 1.3.9               | OFL-1.1                     | [Source](https://github.com/orioncactus/pretendard)       |
| radix-ui                  | 1.8.1               | MIT                         | [Source](https://github.com/radix-ui/primitives)          |
| react                     | 19.3.1              | MIT                         | [Source](https://github.com/facebook/react)               |
| react-dom                 | 19.3.1              | MIT                         | [Source](https://github.com/facebook/react)               |
| sonner                    | 2.0.8               | MIT                         | [Source](https://github.com/emilkowalski/sonner)          |
| tailwind-merge            | 3.7.0               | MIT                         | [Source](https://github.com/dcastil/tailwind-merge)       |
| tw-animate-css            | 1.4.0               | MIT                         | [Source](https://github.com/Wombosvideo/tw-animate-css)   |
| tailwindcss               | 4.3.3               | MIT                         | [Source](https://github.com/tailwindlabs/tailwindcss)     |
| tauri                     | 2.12.4              | Apache-2.0 OR MIT           | [Source](https://github.com/tauri-apps/tauri)             |
| tauri-build               | 2.7.3               | Apache-2.0 OR MIT           | [Source](https://github.com/tauri-apps/tauri)             |
| tauri-plugin-opener       | 2.7.2               | Apache-2.0 OR MIT           | [Source](https://github.com/tauri-apps/plugins-workspace) |
| serde                     | 1.0.229             | MIT OR Apache-2.0           | [Source](https://github.com/serde-rs/serde)               |
| serde_json                | 1.0.154             | MIT OR Apache-2.0           | [Source](https://github.com/serde-rs/json)                |
| tokio                     | 1.54.0              | MIT                         | [Source](https://github.com/tokio-rs/tokio)               |
| rfd                       | 0.17.2              | MIT                         | [Source](https://github.com/PolyMeilex/rfd)               |
| shadcn/ui                 | Vendored components | MIT                         | [Source](https://github.com/shadcn-ui/ui)                 |

## Pretendard

Pretendard Variable 1.3.9 is bundled locally, including in infrastructure diagram labels. Copyright (c) 2021, Kil Hyung-jin. Reserved Font Name: Pretendard. The font remains licensed under SIL OFL 1.1, separately from Orbit. The original license is preserved without modification. [Source and version](https://github.com/orioncactus/pretendard/tree/v1.3.9).

Pretendard Variable 1.3.9는 로컬 글꼴로 포함되며 구조도에도 적용됩니다. 글꼴의 저작권·예약 이름·SIL OFL 1.1 원문은 별도로 보존합니다.

## ELK.js

Orbit uses the unmodified elkjs npm package under EPL-2.0. Its package declares EPL-2.0 OR GPL-3.0-or-later; Orbit uses the EPL-2.0 option. The original license text is included in the collected notices. Corresponding upstream sources: [elkjs v0.12.0](https://github.com/kieler/elkjs/tree/0.12.0) and [Eclipse Layout Kernel](https://github.com/eclipse-elk/elk). ELK.js is not relicensed under Orbit's MIT license.

ELK.js는 EPL-2.0 조건으로 사용하며 원문 고지와 상위 소스 링크를 제공합니다. Orbit의 MIT 라이선스가 ELK.js에 적용되는 것은 아닙니다.

## Icons and UI

Lucide's distributed license includes ISC and MIT notices for Feather-derived icons. Both are preserved. shadcn/ui components are vendored and customized; their original MIT notice is retained. Tauri and other dual-licensed packages retain their distributed license options.

## External software

AWS CLI and Microsoft Edge WebView2 are external runtime dependencies, not Orbit-authored code. Their respective vendor terms apply. AWS names and marks belong to their respective owners. Orbit is not affiliated with AWS.
