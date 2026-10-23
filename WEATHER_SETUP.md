# 접속 지역 날씨 추천

찰픽은 Vercel이 방문자의 접속 IP를 바탕으로 전달하는 대략적인 지역을 사용합니다. GPS 권한을 요청하지 않으며, 방문자 IP·쿠키·원래 좌표를 날씨 제공자에게 전달하지 않습니다. 약 10km 격자로 반올림한 좌표로 서버가 MET Norway의 예보를 받아옵니다. IP 지역은 통신사·VPN 때문에 실제 위치와 다를 수 있습니다.

## 표시 기준

- 관측값이 아니라 **접속 지역의 현재 시간대를 포함하는 1시간 예보**입니다. 화면에서도 예보라고 표시합니다.
- 비·소나기·뇌우는 `rain`, 눈·진눈깨비는 `snow`입니다. 맑음·흐림·안개에는 날씨 테마를 만들지 않습니다.
- 미래 시간의 비, 오래된 예보, 6시간 묶음 예보를 현재 날씨로 해석하지 않습니다.
- 지역을 알 수 없거나 날씨 조회가 실패하면 날씨 비중을 빼고 계절·기념일 추천을 사용합니다. 임의의 도시나 날씨로 대체하지 않습니다.
- 로컬 `localhost`에는 Vercel의 신뢰할 수 있는 접속 지역이 없으므로 날씨 추천을 건너뜁니다. 배포된 Vercel 주소에 실제 접속했을 때 자동 지역 조회가 작동합니다. 로컬 요청에 지역 헤더를 임의로 붙여도 무시합니다.

## 운영 설정

API 키와 별도 날씨 가입은 필요 없습니다. `/api/weather`를 포함하여 프로젝트 전체를 Vercel에 배포합니다. 사용자별 응답은 CDN·공유 캐시에 저장하지 않습니다. 서버 내부에서 지역 격자별 원본 예보를 제공자의 `Expires` 시각까지 재사용하고, 만료 후에는 `If-Modified-Since`로 재확인합니다. 동시 중복 요청은 합치며, 오류나 요청 제한에는 대기 시간을 둡니다. 서버 인스턴스별 캐시이므로 트래픽이 커지면 공유 캐시로 옮깁니다.

기본 서버 식별값은 `Chalpick/1.0 https://chalpick.kr`입니다. 운영자에게 연락할 수 있는 문의 페이지 또는 공개 업무용 이메일을 마련하고, 필요하면 Vercel 환경변수 `WEATHER_USER_AGENT`에 `Chalpick/1.0 https://chalpick.kr/실제-문의페이지` 형태로 지정합니다. 존재하지 않는 주소를 사용하지 마세요. 이 값은 서버에서만 사용합니다.

MET Norway는 상업용·광고 수익 서비스에 CC BY 4.0으로 이용을 허용합니다. 출처와 라이선스를 표시하고, 찰픽이 예보를 두 종류의 테마로 분류했다는 점을 함께 알립니다. 날씨 카드 또는 연결된 설명에 API 응답의 `source.name`, `source.url`, `source.licenseUrl`, `source.description`을 사용합니다.

## API

`GET /api/weather`

정상 응답 예시:

```json
{
  "available": true,
  "condition": "rain",
  "region": "서울",
  "isForecast": true,
  "forecastAt": "2026-10-22T15:00:00Z",
  "forecastUntil": "2026-10-22T16:00:00.000Z",
  "updatedAt": "2026-10-22T13:00:00Z",
  "source": {
    "name": "MET Norway",
    "url": "https://www.met.no/en",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "description": "MET Norway의 현재 시간대 1시간 예보를 찰픽의 비/폭풍·눈 테마로 분류했습니다."
  }
}
```

`available: true, condition: null`은 날씨를 확인했지만 비·눈에 해당하지 않는 경우입니다. `available: false`는 확인할 수 없는 경우이며 `reason`은 `region_unavailable`, `provider_unavailable`, `forecast_unavailable` 중 하나입니다. 둘 다 날씨 추천 후보에서 제외합니다.

## 확인한 공식 자료

- [Vercel 접속 지역 헤더와 로컬 환경 제한](https://vercel.com/kb/guide/geo-ip-headers-geolocation-vercel-functions)
- [Vercel 위도·경도·도시 헤더](https://vercel.com/docs/headers/request-headers)
- [MET Norway 상업용 허용과 출처·연락처 안내](https://docs.api.met.no/doc/FAQ.html)
- [MET API 이용조건과 캐시 지침](https://docs.api.met.no/doc/TermsOfService.html)
- [Locationforecast 시간 단위·전 지구 예보 설명](https://docs.api.met.no/doc/locationforecast/datamodel.html)

검증: `node --test scripts/test-weather.mjs`. 실제 MET 한국 지역 응답을 별도로 확인했으며, 방문자 자동 지역은 실제 Vercel 배포 접속으로 확인해야 합니다.
