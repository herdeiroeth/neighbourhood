# neighbourhood

> 🏘️ **제로 의존성 LAN 파일 전송 도구** — 같은 네트워크에서 머신 간 파일을 즉시 공유합니다.

[![zh](https://img.shields.io/badge/lang-zh--CN-blue.svg)](README.md) [![en](https://img.shields.io/badge/lang-en-red.svg)](README.en.md) [![ja](https://img.shields.io/badge/lang-ja-green.svg)](README.ja.md) [![ko](https://img.shields.io/badge/lang-ko-orange.svg)](README.ko.md) [![es](https://img.shields.io/badge/lang-es-purple.svg)](README.es.md)

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![No Dependencies](https://img.shields.io/badge/dependencies-0-success)

`neighbourhood`는 가볍고 자체 포함된 LAN 파일 전송 도구입니다. 외부 의존성이 전혀 필요 없습니다 — Node.js 내장 모듈만 사용합니다. 중단점 재개, 디렉토리 다운로드(tar 스트리밍), 아름다운 진행 표시줄을 지원합니다.

**⚠️ 보안 주의:** `neighbourhood`에는 **인증이나 TLS가 없습니다** — 신뢰할 수 있는 네트워크에서만 사용하세요. 기본적으로 `0.0.0.0`(모든 인터페이스)에서 수신하며 CORS도 완전히 열려 있습니다. 빠른 LAN 마이그레이션을 위해 설계되었으며, 공개 노출에는 적합하지 않습니다.

---

## ✨ 기능

- **📂 원격 파일 탐색** — 다른 머신에서 디렉토리 내용 나열
- **⬇️ 파일 다운로드** — 진행 표시줄, 속도 및 예상 완료 시간 표시
- **📁 디렉토리 다운로드** — 전체 폴더를 `.tar`로 스트리밍
- **⏯️ 중단점 재개** — HTTP Range 헤더를 통한 다운로드 재개
- **🚫 제로 의존성** — 순수 Node.js 표준 라이브러리(`http`, `fs`, `path`, `os`, `stream`)
- **🌐 LAN 최적화** — 로컬 네트워크 속도와 안정성에 최적화
- **🖥️ 크로스 플랫폼** — Windows, macOS, Linux 지원

---

## 📦 빠른 시작

```bash
# npm install이 필요 없습니다! 바로 클론해서 실행하세요.

# 저장소 클론
git clone https://github.com/herdeiroeth/neighbourhood.git
cd neighbourhood

# 터미널 1: 서버 시작 (현재 디렉토리 공유)
node bin/server.js

# 터미널 2: 파일 목록 보기 및 다운로드
node bin/client.js localhost:3000 list /
node bin/client.js localhost:3000 get /package.json
node bin/client.js localhost:3000 get-dir /lib
```

---

## 🚀 사용 방법

### 서버 측 (파일이 있는 머신)

```bash
# 기본 포트(3000)에서 현재 디렉토리 공유
node bin/server.js

# 특정 디렉토리를 사용자 정의 포트로 공유
node bin/server.js /path/to/share --port 8080

# 또는 PORT 환경 변수 사용
PORT=8080 node bin/server.js /path/to/share
```

**출력 예시:**
```
  trans-server running
  Root: /Users/me/shared-files
  Local: http://localhost:3000
  LAN:   http://192.168.1.10:3000

  On the other machine run:
    node bin/client.js 192.168.1.10:3000 list /
```

### 클라이언트 측 (LAN 내 모든 머신)

```bash
# 파일 목록 보기 (ls는 list의 별칭)
node bin/client.js 192.168.1.10:3000 list /
node bin/client.js 192.168.1.10:3000 ls /Documents

# 단일 파일 다운로드
node bin/client.js 192.168.1.10:3000 get /photos/vacation.zip

# 전체 디렉토리 다운로드 (tar 스트리밍)
node bin/client.js 192.168.1.10:3000 get-dir /Documents
```

중단된 다운로드는 `.part` 파일로 남습니다 — 동일한 `get` 명령을 다시 실행하면 HTTP Range 헤더를 통해 자동으로 재개됩니다.

---

## 📋 API 엔드포인트

고급 사용 또는 브라우저 액세스용:

| 엔드포인트 | 메서드 | 쿼리 파라미터 | 설명 |
|---|---|---|---|
| `/api/list` | GET | `path` | 디렉토리 내용을 JSON으로 나열 |
| `/api/stat` | GET | `path` | 파일/디렉토리 메타데이터 가져오기 |
| `/api/download` | GET | `path` | 파일 다운로드 (Range/206 재개 지원) |
| `/api/download-dir` | GET | `path` | 디렉토리를 TAR 아카이브로 다운로드 |

---

## 🔧 아키텍처

```
[머신 A - 소스]                         [머신 B - 대상]
  trans-server                              trans-client
  rootDir ──► HTTP :3000 ── LAN ──► list / get / get-dir
              /api/list
              /api/stat
              /api/download      (파일, Range)
              /api/download-dir  (tar 스트림)
```

### 프로젝트 구조

```
.
├── bin/
│   ├── server.js          # 서버 CLI 진입점
│   └── client.js          # 클라이언트 CLI 진입점
├── lib/
│   ├── client/
│   │   ├── index.js       # 인수 파싱 및 명령 디스패치
│   │   ├── commands.js    # list / get / get-dir 구현
│   │   ├── progress.js    # 속도 및 ETA가 있는 진행 표시줄
│   │   └── resume.js      # .part 파일 관리 및 Range 헤더
│   ├── server/
│   │   ├── index.js       # HTTP 서버 + 정상 종료
│   │   ├── routes.js      # API 라우트 핸들러 (경로 안전 포함)
│   │   └── tar-stream.js  # 스트리밍 TAR 생성기 (ustar 형식)
│   └── shared/
│       ├── protocol.js    # 포트 및 엔드포인트 상수
│       └── format.js      # 크기, 속도, 날짜 포맷터
├── package.json
├── README.md
├── README.en.md
├── README.ja.md
├── README.ko.md
├── README.es.md
├── LICENSE
└── .gitignore
```

| 계층 | 경로 | 역할 |
|---|---|---|
| CLI | `bin/` | 실행 가능 진입점 |
| 서버 | `lib/server/` | HTTP, 라우팅, TAR 생성 |
| 클라이언트 | `lib/client/` | 명령, 진행, 재개 로직 |
| 공유 | `lib/shared/` | 프로토콜 상수, 포맷 유틸리티 |

**기술 스택:**
- **런타임:** Node.js ≥ 18 (ES modules)
- **의존성:** 제로 (표준 라이브러리만)
- **프로토콜:** 일반 HTTP/1.x (TLS 없음)

---

## 🧪 수동 테스트

1. 테스트 디렉토리를 지정하여 서버 시작
2. `list /` — 이름, 유형, 크기 확인
3. 작은 파일 `get`, 큰 파일 `get` — 중단 + 재개 테스트
4. `get-dir` — 로컬 압축 해제 결과 확인
5. `../` 경로 탐색 시도 — 403 Forbidden 반환 확인
6. 서버에서 Ctrl+C — 정상 종료 메시지 확인

---

## ⚠️ 보안 및 제한 사항

이 도구는 LAN 마이그레이션을 위해 **의도적으로 느슨한 권한**을 가지고 있습니다:

| 항목 | 현재 동작 | 위험 |
|---|---|---|
| 인증 | 없음 | 포트에 접근 가능한 모든 머신이 나열 및 다운로드 가능 |
| TLS | 없음 | 네트워크 트래픽이 평문으로 전송 |
| 바인드 | `0.0.0.0` | 모든 인터페이스에서 수신 |
| CORS | `Access-Control-Allow-Origin: *` | LAN 내 브라우저 접근 허용 |
| 경로 안전 | `safePath`가 `rootDir` 내로 제한 | 기본 경로 탐색 방어 |
| Tar 압축 풀기 | 파일명에서 `..` 제거 | zip-slip 유형 문제 완화 |

**사용 권장사항:**
1. **신뢰할 수 있는 로컬 네트워크**에서만 사용 (또는 격리된 터널)
2. 추가 인증 없이 라우터, WAN, 오픈 VPN에 포트를 **노출하지 마세요**
3. `rootDir`은 실제로 마이그레이션이 필요한 디렉토리만 지정
4. 전송 완료 후 즉시 서버 중지

**알려진 제한 사항:**
- 인증, 사용자 권한 부여, 접근 감사 없음
- HTTPS/TLS 없음 — 일반 HTTP만
- TAR 구현은 단순화된 ustar: 100자를 초과하는 파일명은 잘림
- `get-dir`은 재개 **미지원** (단일 파일 `get`만 지원)
- 자동화된 테스트, CI, lint 스크립트 없음
- 속도 제한, 크기 제한, 동시성 제어 없음
- Windows 호환성을 위해 Git Bash 경로 처리가 있지만, 크로스 플랫폼 테스트 매트릭스 없음

---

## 📄 라이선스

MIT © [herdeiroeth](https://github.com/herdeiroeth)

---

<p align="center">❤️와 <code>node_modules</code> 제로로 만들었습니다</p>
