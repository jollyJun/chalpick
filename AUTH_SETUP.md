# 찰픽 네이버·카카오 로그인 연결

실제 OAuth 인증 코드는 구현되어 있습니다. 제공자 앱과 서버 환경변수를 연결하기 전에는 로그인이 비활성 상태로 표시됩니다. 임시 취향 프로필은 로그인 계정으로 취급하지 않습니다. 이 작업에서 네이버·카카오 앱 생성, 서비스 심사, Vercel 설정 변경 또는 공개 배포는 하지 않았습니다.

## 구현 범위

브라우저의 로그인 버튼 → 서버에서 로그인 요청 생성 → 네이버·카카오 동의 화면 → 서버 콜백 → 서버에서 코드 교환 및 프로필 확인 → 하루 동안 유효한 암호화 세션 쿠키 순서입니다. 회원번호와 닉네임만 세션에 담습니다. 이메일·연령·전화번호·프로필 이미지는 사용하지 않으며, 제공자 액세스 토큰과 리프레시 토큰은 저장하거나 브라우저에 반환하지 않습니다.

보관함과 취향은 기존 브라우저 저장 방식을 유지합니다. 로그인만으로 기기 간 동기화되거나 데이터베이스 회원 행이 만들어지지 않습니다. 두 소셜 계정을 이메일로 합치지 않으며, 로그인 식별자는 `naver:회원번호` 또는 `kakao:회원번호`입니다.

## 환경변수

`.env.example`을 프로젝트 루트의 `.env.local`로 복사해 실제 값을 넣습니다. `.env.local`은 `public/`, `dist/`, 소스 저장소에 포함하면 안 됩니다. Vercel에서는 프로젝트의 서버 환경변수로 같은 이름을 등록해야 합니다. `NEXT_PUBLIC_` 또는 `VITE_` 접두어를 붙이지 않습니다.

| 이름 | 내용 |
| --- | --- |
| `AUTH_BASE_URL` | 로컬 `http://localhost:4173`, 운영 `https://chalpick.kr`. 경로·쿼리 없이 정확한 출처를 지정합니다. |
| `AUTH_SESSION_SECRET` | 무작위 32바이트의 base64url 값. 아래 명령으로 생성합니다. |
| `NAVER_CLIENT_ID` | 네이버 애플리케이션의 Client ID |
| `NAVER_CLIENT_SECRET` | 같은 애플리케이션의 Client Secret |
| `KAKAO_CLIENT_ID` | 카카오 REST API 키. JavaScript 키나 Admin 키를 사용하지 않습니다. |
| `KAKAO_CLIENT_SECRET` | 카카오 REST API 키의 Client Secret. 활성화된 상태를 유지합니다. |

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

생성한 값은 비밀 저장소에 보관합니다. 다른 환경의 키를 재사용하지 않는 편이 좋습니다. 키를 변경하면 기존 세션이 모두 무효화됩니다. HTTP는 개발 환경의 localhost·127.0.0.1·IPv6 loopback에서만 허용됩니다. 운영에서는 HTTPS가 필수입니다.

## 제공자에 등록할 정확한 주소

등록할 콜백 URL에는 `action`과 `provider` 쿼리가 포함됩니다. 아래 문자열 그대로 등록합니다. 애플리케이션이 실제로 사용하는 주소 한 쌍을 선택하고, 개발/운영 앱을 나누면 각 앱에 해당 환경의 주소를 등록합니다.

| 제공자 | 환경 | Callback / Redirect URI |
| --- | --- | --- |
| 네이버 | 로컬 | `http://localhost:4173/api/auth?action=callback&provider=naver` |
| 네이버 | 운영 | `https://chalpick.kr/api/auth?action=callback&provider=naver` |
| 카카오 | 로컬 | `http://localhost:4173/api/auth?action=callback&provider=kakao` |
| 카카오 | 운영 | `https://chalpick.kr/api/auth?action=callback&provider=kakao` |

로컬 주소는 `http://localhost:4173`으로 열어야 합니다. `127.0.0.1`은 다른 출처이므로 별도로 설정하고 등록하지 않은 상태에서는 로그인이 열리지 않습니다. Preview 배포에 운영 자격정보를 그대로 붙이지 않습니다. Preview 로그인이 필요하면 고정된 Preview 도메인을 마련하고 별도 앱/환경변수/콜백을 등록합니다.

네이버: [내 애플리케이션](https://developers.naver.com/apps/#/list)에서 네이버 로그인과 웹 서비스 URL을 설정하고 위 Callback URL을 등록합니다. 회원 식별은 기본 제공되는 `id`를 사용하며, 표시용 별명만 선택합니다. 이메일·실명·성별·생일·연령대·프로필 사진 권한은 이 구현에 필요하지 않습니다. 일반 이용자에게 제공하기 전 네이버의 서비스 검수·이용 가능 범위를 콘솔에서 확인합니다. 구현 근거: [네이버 로그인 API](https://developers.naver.com/docs/login/api/api.md), [회원 프로필 API](https://developers.naver.com/docs/login/profile/profile.md).

카카오: [앱 관리](https://developers.kakao.com/console/app)에서 카카오 로그인을 활성화하고 REST API 키의 Redirect URI를 등록합니다. 닉네임(`profile_nickname`) 동의항목만 사용합니다. Client Secret을 서버 환경변수에 등록합니다. 이 코드는 OpenID Connect나 이메일 권한을 요구하지 않습니다. 구현 근거: [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [설정하기](https://developers.kakao.com/docs/ko/kakaologin/prerequisite).

## 서버와 화면 연결 계약

Vercel의 `api/auth.js`는 하나의 Node.js 함수로 GET/POST 요청을 `server/auth.mjs`의 `handleAuth(Request)`로 전달합니다. 추가 패키지가 없습니다. 함수와 공통 코드는 정적 결과물 폴더에 복사하지 않으며, Vercel에 **프로젝트 루트 전체**를 배포해야 합니다. Node.js 22 이상을 권장합니다. [Vercel Node.js 함수 문서](https://vercel.com/docs/functions/runtimes/node-js).

현재 `framework: null`, `outputDirectory: "dist"` 설정은 정적 결과물을 `dist/`에서 제공하고, 프로젝트 루트의 `api/`는 별도로 함수로 인식하는 구조입니다. `dist/`만 새로운 프로젝트로 올리면 로그인 함수가 누락됩니다. GET/POST의 Web Request/Response 형식은 [Functions API Reference](https://vercel.com/docs/functions/functions-api-reference), 루트 `api/` 및 출력 폴더 설정은 [프로젝트 구성 문서](https://vercel.com/docs/project-configuration/vercel-json)에 맞췄습니다. 실제 Vercel 클라우드 빌드·배포는 아직 실행하지 않았습니다.

로컬 `scripts/server.mjs`는 정적 파일을 찾기 전에 다음으로 분기합니다.

```js
import { handleNodeAuth } from '../server/auth.mjs';

// http.createServer 안, 정적 파일 처리 전
if (new URL(req.url, 'http://localhost').pathname === '/api/auth') {
  await handleNodeAuth(req, res);
  return;
}
```

서버 실행 전에 `.env.local`을 읽어야 합니다. Node의 `--env-file-if-exists=.env.local` 옵션 또는 서버 시작 코드의 `process.loadEnvFile()`을 사용할 수 있습니다. `public/auth.js`를 페이지 모듈에서 import하고 `initAuth()`를 호출하면 `.header-top` 안의 보관함 버튼 앞에 로그인 버튼을 추가합니다. CSS와 대화상자는 모듈이 자동 추가합니다.

```js
import { initAuth } from '/auth.js';
initAuth();
```

인증 변화는 document의 `chalpick:authchange` 이벤트로 알립니다. `event.detail`은 `{ authenticated, user }`입니다. 임시 취향은 이 이벤트나 세션을 위조하지 않고 별도로 유지합니다.

| 요청 | 동작 |
| --- | --- |
| `GET /api/auth?action=status` | 로그인 여부·최소 사용자 정보·제공자 활성 여부 |
| `GET /api/auth?action=session` | 같은 세션 확인 응답 |
| `POST /api/auth?action=start&provider=naver` | state 쿠키와 네이버 인증 URL 반환 |
| `POST /api/auth?action=start&provider=kakao` | state 쿠키와 카카오 인증 URL 반환 |
| `GET /api/auth?action=callback&provider=…` | state 검증, 코드 교환, 프로필 확인, 쿠키 발급 후 홈으로 이동 |
| `POST /api/auth?action=logout` | 현재 브라우저의 찰픽 세션 및 진행 중인 로그인 쿠키 삭제 |

POST 요청은 같은 출처의 `Origin`, `Content-Type: application/json`, `X-Chalpick-Auth: 1` 헤더가 필요합니다. 제공자의 계정 전체에서 로그아웃하거나 계정 연결을 해제하지는 않습니다.

## 검증 및 보안 경계

`node --test scripts/test-auth.mjs`는 외부 서비스에 접속하지 않고 모의 제공자 응답으로 정상 인증과 state 누락·변조·만료, 세션 위조·만료, 요청 출처, 로그아웃, 고정 콜백, 비밀값 비노출을 확인합니다. 실제 앱 자격정보가 등록되지 않은 상태에서는 제공자의 실제 동의 화면까지 완료했다고 보장할 수 없습니다. 설정 후에는 실제 네이버·카카오 계정 각각으로 로그인·새로고침·로그아웃을 확인합니다.

state는 10분 유효한 AES-256-GCM 암호화 HttpOnly 쿠키와 요청값을 함께 검증합니다. 콜백 처리 후 해당 쿠키를 지우며, 제공자의 인가 코드는 제공자 측의 일회용 교환 규칙을 따릅니다. 서비스 세션은 별도 용도로 암호화된 하루 유효 쿠키입니다. 운영 쿠키는 `__Host-` 이름, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`를 사용하고 Domain을 지정하지 않습니다. 응답과 리다이렉트는 캐시하지 않습니다.

네이버·카카오의 일반 웹 OAuth 콜백은 최상위 페이지 GET 이동이므로 Lax 쿠키를 받을 수 있습니다. 시작·로그아웃 POST에 적용하는 출처 검사를 콜백에는 적용하지 않고 state를 검증합니다. iframe이나 POST 콜백으로 흐름을 바꾸지 않습니다. [SameSite 쿠키 동작](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

콜백 state를 지웠다는 사실을 서버 데이터베이스에 별도로 기록하지는 않습니다. 따라서 캡처한 state 쿠키와 콜백 자체를 다시 전송하는 경우에는 제공자의 일회용 코드 교환 거부가 추가 방어선입니다. 서버 저장소 없는 구조를 서버 전체의 state 재사용 차단이나 즉시 세션 철회 기능으로 설명해서는 안 됩니다.

현재는 서버 저장소가 없는 세션입니다. 로그아웃은 해당 브라우저의 쿠키를 지우며, 탈취된 쿠키의 개별 서버 철회나 모든 기기 로그아웃은 제공하지 않습니다. 그런 기능과 회원 탈퇴·기기 간 보관함 동기화가 필요해지면 서버 세션/회원 저장소를 추가해야 합니다.
