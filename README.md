# Orbit

**로컬 AWS CLI로 사용하는 데스크톱 AWS 워크스페이스.**

한국어 · [English](README.en.md)

[다운로드](https://github.com/leessang10/aws-gui/releases/latest) · [릴리스 노트](docs/releases/v0.1.0.md) · [버그 제보](https://github.com/leessang10/aws-gui/issues) · [MIT 라이선스](LICENSE)

웹 콘솔을 오가지 않고 리소스를 탐색하고, 로그를 읽고, 인프라 연결 관계를 확인하세요. Orbit은 컴퓨터에 설치된 AWS CLI와 기존 프로필을 사용합니다. Tauri 2, Rust, React, TypeScript로 만들었습니다.

![Orbit 다크 테마의 EC2 리소스 목록](docs/dark-workspace.png)

## 주요 기능

| 기능           | 할 수 있는 일                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------- |
| 리소스 탐색    | EC2 인스턴스, RDS 데이터베이스, S3 버킷, CloudWatch 로그 그룹 조회 및 상세 정보 확인           |
| 파일·로그 탐색 | S3 폴더·Prefix 이동과 객체 메타데이터, CloudWatch 로그 본문·시간 범위·필터·페이지 이동         |
| API 실행       | 설치된 CLI의 서비스·작업 검색, 옵션별 입력 폼, 필수값·설명·검증, JSON 편집, AWS 공식 문서 링크 |
| 인프라 구조도  | 리소스 선택, 연결된 리소스 포함, VPC·서브넷 그룹, 자동 배치, 보기 모드 및 PNG/PDF 내보내기     |
| 작업 환경      | 프로필·리전 전환, 즐겨찾기, 최근 서비스, 우클릭 메뉴, 사이드바 접기/펴기                       |
| 화면 설정      | 한국어·영어, 라이트·다크·시스템 테마, 표 밀도, Pretendard 글꼴                                 |

## 스크린샷

### API 옵션 입력

필요한 옵션을 폼으로 입력하거나 JSON으로 편집할 수 있습니다. 모드를 전환해도 입력값은 유지됩니다.

![필수값과 옵션 설명을 표시하는 API 입력 폼](docs/api-input-form.png)

### 인프라 구조도

필요한 리소스를 골라 불러오고, 연결된 리소스를 함께 표시할 수 있습니다.

![인프라 구조도의 리소스 선택과 연결 리소스 옵션](docs/connected-resources.png)

![인프라 구조도 내보내기 결과](docs/infrastructure-export.png)

스크린샷은 예시 리소스로 촬영했으며 실제 AWS 계정 정보가 아닙니다.

## 설치

현재 배포 대상은 **Windows x64**입니다. 설치 파일을 사용하는 경우 Node.js나 Rust는 필요하지 않습니다.

1. [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)를 설치합니다. 서비스 카탈로그를 위해 표준 Windows 설치 경로를 권장합니다.
2. [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)이 설치되어 있는지 확인합니다.
3. [최신 릴리스](https://github.com/leessang10/aws-gui/releases/latest)에서 파일을 받습니다.

| 파일                          | 용도                        |
| ----------------------------- | --------------------------- |
| `Orbit_0.1.0_x64-setup.exe`   | 현재 사용자용 설치 프로그램 |
| `Orbit_0.1.0_windows_x64.exe` | 설치 없이 실행하는 단일 EXE |
| `SHA256SUMS.txt`              | 실행 파일의 SHA-256 체크섬  |
| `Source code (zip / tar.gz)`  | 해당 릴리스의 소스코드      |

v0.1.0은 **코드 서명이 없는 초기 배포본**입니다. Windows에서 알 수 없는 게시자 경고가 나타날 수 있습니다. 다운로드한 파일은 다음 명령으로 릴리스의 체크섬과 비교할 수 있습니다.

```powershell
Get-FileHash .\Orbit_0.1.0_x64-setup.exe -Algorithm SHA256
```

## 사용법

### 1. AWS 프로필 준비

기존 AWS CLI 프로필을 그대로 사용합니다. 새 프로필이 필요하면 터미널에서 설정하세요.

```powershell
aws --version
aws configure --profile my-profile
```

IAM Identity Center(SSO)를 사용한다면 다음 명령으로 설정하고 로그인합니다.

```powershell
aws configure sso --profile my-sso
aws sso login --profile my-sso
```

인증 정보는 AWS CLI에서 관리합니다. Orbit에 액세스 키를 별도로 입력할 필요가 없습니다. 프로필 설정은 [AWS CLI 공식 안내](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html)를 참고하세요.

### 2. 리소스 탐색

- 앱을 실행한 뒤 사이드바 하단에서 **프로필과 리전**을 선택합니다. 계정 ID로 연결 대상을 확인하세요.
- EC2·RDS·S3·CloudWatch 또는 **전체 서비스**에서 원하는 서비스를 선택합니다.
- 리소스를 선택해 상세 정보를 열고, 우클릭 메뉴에서 ID·ARN 등 필요한 값을 복사합니다.
- S3에서는 폴더나 Prefix로 이동하고, CloudWatch에서는 시간 범위와 필터로 로그를 좁힙니다.
- `Ctrl+B`로 사이드바를 접거나 펼칩니다. 설정에서 언어·테마·표 밀도를 변경할 수 있습니다.

### 3. API 실행

1. 서비스의 **API 실행**에서 작업을 검색해 선택합니다.
2. **옵션 입력** 폼에 값을 입력합니다. 필요하면 JSON 모드로 전환하거나 공식 문서를 엽니다.
3. 요청을 검토해 **계정·리전·작업·입력값**을 확인합니다.
4. 표시된 확인 문구를 입력한 뒤 실행합니다.

변경 API는 설정의 **고급 API 작업**을 현재 세션에서 활성화해야 실행할 수 있습니다. 검토는 5분 동안 유효하며 한 번만 사용할 수 있고, 입력값을 바꾸면 다시 검토해야 합니다. AWS IAM 권한이 적용되며 서비스별 요청 비용이 발생할 수 있습니다.

### 4. 인프라 구조도

1. 사이드바의 **인프라 구조도 → 리소스 선택**을 엽니다.
2. 이름이나 ID로 검색하고 체크합니다. 검색어를 비우면 조회된 전체 후보가 표시됩니다.
3. 필요하면 **연결된 리소스도 포함**을 선택한 뒤 **불러오기**를 누릅니다.
4. 아이콘·간단히·상세 보기, 자동 정렬, 검색을 사용하고 PNG 또는 PDF로 내보냅니다.

구조도는 AWS 설정에서 확인한 소속과 연결을 표시합니다. 화살표가 실제 트래픽이나 네트워크 접근 가능성을 보장하지 않으며, EC2와 RDS/S3 사이의 애플리케이션 통신을 추정하지 않습니다. 노드를 이동해도 AWS 리소스는 변경되지 않습니다.

## 현재 지원 범위

- EC2·RDS·S3·CloudWatch 전용 탐색 화면은 읽기 전용입니다. 수정 기능은 별도의 API 검토·실행 흐름을 사용합니다.
- S3 파일 업로드·다운로드, 객체 본문 미리보기, `s3 sync`, 바이너리·스트리밍 API는 지원하지 않습니다.
- API 실행은 한 페이지 단위입니다. 다음 페이지는 응답의 커서를 요청 옵션에 넣어 조회합니다.
- 설치된 CLI 모델에서 작업을 가져오지만 모든 AWS API의 동작을 검증한 것은 아닙니다. 옵션 설명과 AWS 오류는 원문 언어로 표시될 수 있습니다.
- 구조도는 부분 결과와 권한 오류를 표시하며 수집 한도가 있습니다. 상세 동작은 [구조도 문서](docs/react-ui.md#infrastructure-selection), 런타임 한도는 [릴리스 준비 문서](docs/release-readiness.md)를 참고하세요.
- macOS·Linux 바이너리, 자동 업데이트 및 대규모 계정 성능 보장은 제공하지 않습니다.

## 소스에서 실행하기

Node.js 22+, Rust, MSVC C++ 빌드 도구, WebView2와 AWS CLI v2가 필요합니다.

```powershell
git clone https://github.com/leessang10/aws-gui.git
cd aws-gui
npm ci
.\start.ps1
```

Cargo가 PATH에 있으면 `npm run tauri dev`로 실행할 수도 있습니다. `npm run dev`는 AWS 연결 없이 UI를 확인하는 브라우저 개발 모드입니다. 실제 AWS 조회에는 데스크톱 앱을 사용하세요.

```powershell
# 프런트엔드 테스트와 빌드
npm run check

# Rust 검사
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings

# 실행 파일과 설치 프로그램 빌드
npm run tauri build
```

실행 파일은 `src-tauri/target/release/aws-gui.exe`, 설치 프로그램은 `src-tauri/target/release/bundle/nsis/`에 생성됩니다. 실제 AWS에 접근하는 통합 테스트는 기본적으로 비활성화되어 있습니다. 실행 방법은 [검증 문서](docs/release-readiness.md)를 참고하세요.

## 기여와 문제 보고

[Issues](https://github.com/leessang10/aws-gui/issues)에 OS, Orbit/AWS CLI 버전, 재현 순서와 오류 메시지를 남겨주세요. 인증 정보·고객 데이터·계정 식별자는 제거해 주세요. Pull Request에는 변경 목적과 확인한 동작을 적어주세요.

구조를 살펴보려면 [설계](docs/design.md), [React UI](docs/react-ui.md), [UI 결정 사항](docs/ui-decisions.md)을 참고하세요.

## 라이선스와 크레딧

Orbit 자체 코드는 [MIT License](LICENSE)로 배포합니다. 외부 라이브러리·글꼴·아이콘에는 각각의 라이선스가 적용됩니다.

- **Pretendard Variable 1.3.9** — Kil Hyung-jin, SIL Open Font License 1.1. 글꼴을 앱에 포함하며 [원문 고지](public/licenses/Pretendard-OFL.txt)를 보존합니다.
- **React, React Flow, shadcn/ui, Radix UI, Sonner** — MIT.
- **Tauri** — MIT 또는 Apache-2.0.
- **ELK.js** — EPL-2.0으로 사용하며 [상위 프로젝트 소스](https://github.com/kieler/elkjs)를 제공합니다.
- **Lucide** — ISC 및 일부 Feather 기반 아이콘의 MIT 고지.

버전·출처·라이선스 원문은 [Third-party notices](THIRD_PARTY_NOTICES.md)에 정리했습니다. Orbit은 AWS의 공식 제품이 아니며 AWS와 제휴하지 않습니다.
