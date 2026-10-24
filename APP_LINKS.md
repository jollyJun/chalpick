# 공식 감상처 앱 연결 — v8

확인일: 2026-10-24 (한국시간). DB 주소는 변경하지 않고 화면의 공식 감상처 링크만 처리합니다.

## 동작

- PC: 저장된 공식 HTTPS 작품 주소를 새 탭으로 엽니다.
- Android Chrome·Samsung Internet·Edge: 확인된 앱 연결만 사용하고, 앱이 없거나 연결이 처리되지 않으면 해당 작품의 공식 웹 주소로 돌아갑니다. 앱 실행 여부는 단말기·브라우저 설정과 설치된 앱 버전에 영향을 받습니다.
- iPhone·iPad: 네이버웹툰은 공식 Universal Link로 작품 목록을 엽니다. 다른 서비스는 원본 공식 HTTPS 링크를 현재 탭으로 열어 OS의 Universal Link 처리를 허용합니다.
- 카카오톡·네이버·Instagram 등의 앱 내부 브라우저와 확인하지 않은 Android 브라우저: 강제 실행하지 않고 원본 공식 HTTPS 링크를 현재 탭으로 엽니다. 플랫폼 페이지에서 제공하는 ‘앱 열기’를 이용하거나 외부 브라우저로 열어야 할 수 있습니다.
- 앱 설치 여부를 조회하거나, 페이지 로딩만으로 앱을 실행하거나, 타이머로 다른 앱 실행을 재시도하지 않습니다. 사용자가 공식 감상처 링크를 직접 누르는 경우에만 처리합니다.
- 네이버웹툰 iOS Universal Link의 미설치 대체 페이지는 네이버가 관리하는 앱 설치 안내입니다. Android처럼 작품 웹 페이지로 자동 복귀한다고 보장하지 않습니다. 이 경우 뒤로 가기 후 플랫폼 웹 페이지를 이용할 수 있습니다.

## 서비스별 범위

| 서비스 | Android 외부 Chromium 브라우저 | iOS / 그 외 |
|---|---|---|
| 네이버웹툰 | 공식 `webtoonkr` 작품목록 + 고정 배포 패키지, 작품 웹 fallback | 공식 `apps.comic.naver.com/launchApp/` Universal Link |
| 넷플릭스 | 공식 HTTPS 작품 주소 + 확인된 모바일 패키지 | 원본 공식 HTTPS |
| 티빙 | 공식 HTTPS 작품 주소 + 확인된 패키지 | 원본 공식 HTTPS; 옛 player 경로가 Universal Link에 포함된다는 보장은 없음 |
| 웨이브 | 공식 HTTPS 영화/VOD player + 확인된 패키지 | 원본 공식 HTTPS |
| 왓챠 | 공식 HTTPS contents + 확인된 패키지 | 원본 공식 HTTPS; contents 경로의 AASA 확인 |
| 쿠팡플레이 | 공식 HTTPS content + 확인된 패키지 | 원본 공식 HTTPS |
| 디즈니+ | 공식 HTTPS 작품 경로 + 확인된 패키지 | 원본 공식 HTTPS; browse/movie/series 경로의 AASA 확인 |
| 카카오페이지 | 원본 공식 HTTPS; Play/OneStore 판본이 각각 존재하므로 한 앱으로 고정하지 않음 | 원본 공식 HTTPS; AASA 확인 |
| 카카오웹툰 | 원본 공식 HTTPS; 국내/글로벌 및 이전 패키지가 함께 있어 임의 지정하지 않음 | 원본 공식 HTTPS; AASA의 `/linkapp/*`와 DB의 `/content/*`는 다르므로 임의 변환하지 않음 |
| 네이버시리즈 | 원본 공식 HTTPS; 확인하지 않은 전용 스킴을 만들지 않음 | 동일 |
| 리디 | 원본 공식 HTTPS; 확인하지 않은 전용 스킴을 만들지 않음 | 동일 |
| U+tv모바일 | DB에 있던 공식 OneLink 원본 보존 | 동일 |
| 애플TV | 원본 공식 HTTPS; 확인된 Android 패키지는 TV 기기용이라 휴대폰 패키지로 오인하지 않음 | 동일 |

공식 서버의 앱 연결 선언을 확인했다는 것은 현재 출시 앱과 실제 휴대폰에서 작품 페이지까지 도착하는 것을 모두 검증했다는 뜻은 아닙니다. 이 작업에서는 실제 휴대폰의 설치 앱을 실행하지 못했습니다. 따라서 ‘모든 앱에 100% 직접 이동 완료’로 안내해서는 안 됩니다.

## 네이버웹툰 근거

1. [화산귀환 공식 모바일 작품 페이지](https://m.comic.naver.com/webtoon/list?titleId=769209)의 ‘웹툰앱으로 보기’와 공개 HTML:
   - Android 스킴 `webtoonkr`
   - 쿼리 `contentList?version=2&titleId=769209&league=WEBTOON`
   - 패키지 `com.nhn.android.webtoon`
   - iOS Universal Link 접두사 `https://apps.comic.naver.com/launchApp/`
2. [공식 앱 열기 브리지](https://m.comic.naver.com/external/appLaunchBridge?titleId=769209&type=ARTICLE_LIST)의 `al:android:url`, `al:android:package`, `al:ios:url` 메타정보를 함께 확인했습니다.
3. [공식 AASA](https://apps.comic.naver.com/.well-known/apple-app-site-association)는 네이버웹툰 iOS 앱과 `/launchApp/*` 경로의 연결을 선언합니다.
4. 네이버 공식 공개 `vendor-common-8d4a78bb9f921a8a04ad.js`의 AppLauncher는 Universal Link 접두사 뒤에 작품 쿼리를 붙이는 방식입니다. `app-launch-bridge-b271f002b54886b75b86.js`도 같은 접두사를 사용합니다. 외부 라이브러리 코드를 복사해 넣지 않았습니다.
5. 회차, 베스트도전, 요일 목록이나 중복·잘못된 `titleId`는 작품 앱 링크로 추측하지 않습니다. 정식 웹툰 작품목록 경로의 양의 숫자 ID만 변환합니다.

## 다른 서비스의 공식 앱 선언

아래 공식 HTTPS 경로의 JSON에서 `delegate_permission/common.handle_all_urls`와 배포 패키지를 확인했습니다. 로그인 자격 공유만 선언한 항목과 디버그 패키지는 사용하지 않았습니다.

- [넷플릭스](https://www.netflix.com/.well-known/assetlinks.json): `com.netflix.mediaclient`
- [티빙](https://www.tving.com/.well-known/assetlinks.json): `net.cj.cjhv.gs.tving`
- [웨이브](https://www.wavve.com/.well-known/assetlinks.json): `kr.co.captv.pooqV2`
- [왓챠](https://watcha.com/.well-known/assetlinks.json): `com.frograms.wplay`
- [쿠팡플레이](https://www.coupangplay.com/.well-known/assetlinks.json): `com.coupang.mobile.play`
- [디즈니+](https://www.disneyplus.com/.well-known/assetlinks.json): `com.disney.disneyplus`
- 판본 확인만 하고 강제 지정하지 않은 [카카오페이지](https://page.kakao.com/.well-known/assetlinks.json), [카카오웹툰](https://webtoon.kakao.com/.well-known/assetlinks.json), [애플TV](https://tv.apple.com/.well-known/assetlinks.json).

기술 기준: [Chrome의 Android Intent와 fallback](https://developer.chrome.com/docs/android/intents), [Apple의 Universal Link](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app).

## 보안과 통합

`public/platform-links.js`의 공개 함수:

- `officialPlatformURL(value)`: 허용된 공식 호스트의 HTTPS URL만 반환합니다. 잘못된 URL은 빈 문자열입니다.
- `platformDestination(value, environment?)`: `{href, webURL, target, mode}` 또는 `null`. 환경에는 `userAgent`, `navigatorPlatform`, `maxTouchPoints`를 넣을 수 있습니다. 사용자 입력·DB에서 직접 받은 `intent:`, 앱 스킴, 사용자명·비밀번호 URL, 다른 포트·유사 호스트는 거부합니다.
- `installPlatformLinks(document)`: 문서에 한 번 설치하고 반환된 함수를 호출하면 해제합니다. `a[data-platform-link]`로 표시한 공식 감상처 링크만 처리합니다. 모바일의 신뢰되는 실제 클릭에서만 `preventDefault()` 후 같은 동기 클릭 처리 안에서 `location.assign()`으로 이동합니다. 타이머나 비동기 작업을 사이에 넣지 않아 사용자의 직접 동작을 유지합니다. Ctrl/Cmd/Shift/Alt 클릭, 중클릭, 가짜 클릭, 다운로드는 가로채지 않습니다.

렌더러에서는 링크의 원래 `href`를 `officialPlatformURL(url)`로 검증하고 `data-platform-link="서비스명"`을 붙입니다. 잘못된 링크는 버튼 자체를 표시하지 않습니다. 앵커의 `href`는 앱 이동 후에도 원래 HTTPS 주소 그대로 유지하여 링크 복사·길게 누르기·새 탭 열기가 영향을 받지 않게 했습니다. 매 클릭마다 원래 웹 주소를 다시 검증합니다. 상세의 첫 공식 보기 버튼, 각 감상 플랫폼 버튼, DB 밖 인기 작품의 공식 링크 등 적용 범위는 렌더러가 명시적으로 표시해야 합니다.

## 확인 방법

1. 자동 테스트: `node --test scripts/test-platform-links.mjs`
2. 실제 Android Chrome에서 네이버웹툰 설치 후 화산귀환 ‘공식 플랫폼에서 보기’를 누르면 해당 작품 목록에 도착하는지 확인합니다.
3. 앱 미설치 Android에서 같은 버튼을 누르면 `m.comic.naver.com/webtoon/list?titleId=769209`가 열리는지 확인합니다.
4. iPhone Safari에서 설치 상태별로 확인합니다. 미설치일 때는 네이버의 설치 안내가 나타날 수 있습니다.
5. 카카오톡 등 앱 내부 브라우저에서는 링크가 막히지 않고 공식 웹으로 이어지는지 확인합니다.
6. 다른 플랫폼도 대표 작품 1편씩 설치/미설치, 로그인/비로그인 조건으로 확인합니다. 로그인이나 이용권이 필요하면 해당 플랫폼의 정상 안내 화면이 나타나는 것이 맞습니다.
7. PC에서는 계속 공식 작품 페이지가 열리고 Ctrl/Cmd+클릭 등 기존 브라우저 동작이 유지되는지 확인합니다.

자동 테스트는 주소의 안전성, 작품 ID 보존, fallback, OS 분기와 클릭 경계를 검증합니다. 휴대폰 설치 앱의 실제 동작을 대신하지 않습니다.
