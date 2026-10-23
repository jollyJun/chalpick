# 찰픽 광고 이미지 제작·권리 확인 기록 (v7)

## 현재 적용 이미지

- 2026-10-23 내장 이미지 생성 도구로 새 이미지를 제작했습니다. 참고 이미지, 기존 웹툰·영화 장면, 포스터, 특정 작가의 작품을 입력하지 않았습니다.
- 빈 책, 유리 카드, 원·사각형·재생 삼각형 등 일반적인 도형만 표현했습니다. 출력 이미지도 육안 검수했습니다.
- 한글과 버튼은 `public/index.html`의 실제 텍스트로 표시합니다. ‘웹툰’ 글자 오류가 재발하지 않도록 이미지와 분리했습니다.
- 찰픽 로고는 기존 `public/assets/logo.png`를 별도로 표시합니다. 로고 이용권한은 서비스 운영자가 확인해야 합니다.
- 기존 `promo-wide.webp`, `promo-sidebar.webp`는 비교용 원본으로만 남기고 배포 산출물에서는 제외합니다.

| 용도 | 파일 | 크기 |
|---|---|---|
| 두 광고 공용 배경 | `public/assets/promo-abstract-v7.webp` | 1200×800, 32,048 bytes |
| 문구·버튼·로고 | `public/index.html` | 실제 HTML |
| 반응형 배치 | `public/promo.css` | 모바일·데스크톱 |

생성 원본: `C:/Users/hjun/.codex/generated_images/01a14279-c2ea-7f93-ac22-c62f3cd228b7/exec-2a2b58c1-06cb-480d-87c5-09dcc02347e0.png`

웹용 변환은 크기 축소와 WebP 압축만 했습니다. 별도의 외부 이미지나 인물을 합성하지 않았습니다. AI 이미지 1개를 두 광고가 공유합니다.

## 권리상 한계

기존 생성 기록에도 제3자 포스터를 사용하지 말라는 조건은 있었습니다. 하지만 프롬프트의 조건만으로 비침해가 보증되지는 않습니다. 새 이미지 또한 ‘법적 분쟁 가능성 0%’라는 보증을 할 수 없습니다. 이번 조치는 특정 작품을 연상시키는 장면과 인물을 제거하고 입력·생성 기록을 남겨 위험을 줄이는 조치입니다.

서비스 내 작품 소개용 포스터는 광고 이미지와 별개입니다. 공식 이미지 URL 확인이 재게시·상업적 이용 허락까지 확보되었다는 뜻은 아닙니다. 출시 전에 포스터·썸네일·로고 이용조건과 필요한 권리자 허락을 별도로 확인하세요. 법적 확약이 필요하면 권리 검토를 받아야 합니다.

참고: [한국저작권위원회 — 생성형 인공지능 결과물에 의한 저작권 분쟁 예방 안내서](https://www.copyright.or.kr/information-materials/publication/research-report/view.do?brdclasscode=&brdctsno=54252&brdctsstatecode=&list.do%3FpageIndex=1&nationcode=&searchTarget=ALL&searchText=&servicecode=06)

## v7 실제 생성 프롬프트

Use case: ads-marketing. Create a brand-new original premium 3D abstract illustration for a Korean story-discovery service website. Wide 3:2 canvas, no text at all. Luminous icy-white and pale blue studio background. In the RIGHT half, a beautiful sculptural arrangement of three translucent frosted-glass rounded cards and a small open blank white book floating over a clear circular glass pedestal. One card contains ONLY a simple cobalt-blue rounded square, one ONLY a turquoise circle, one ONLY a generic white play triangle on a blue gradient. Blank book pages, absolutely no writing, no pictures printed on pages. Small soft geometric blue glass orbs in the far background. Elegant restrained blue/teal reflections, soft diffuse studio light, realistic caustics, subtle depth of field. LEFT half almost empty off-white negative space, objects stay in right half. Entire composition must consist solely of these generic geometric objects; NO illustrated comic panels, NO scenes, NO skyline, NO photography inserts, NO characters, NO humans, NO recognizable works, NO branded symbols, NO logos, NO lettering, NO watermark. Do not reference or imitate any artist, movie, webtoon or existing campaign. Product-render polish, not clip art. This image is background art only; Korean typography is added separately as HTML.

---

# 이전 v6 제작 기록 (현재 미사용·보관용)

2026-10-23 내장 이미지 생성 도구로 제작했습니다. 로고는 기존 `public/assets/logo.png`를 참고했으며, 제3자 작품 포스터나 인물 이미지는 사용하지 않았습니다.

## 웹용 파일

| 파일 | 크기 | 용량 | 문구 |
| --- | --- | --- | --- |
| `public/assets/promo-wide.webp` | 1500 × 501 | 56,278 bytes | 취향에 꼭 맞는 다음 이야기 / 웹툰 · 웹소설 · 드라마 · 영화 / 내 취향 찾기 → |
| `public/assets/promo-sidebar.webp` | 720 × 600 | 36,190 bytes | 오늘의 한 편, 찰픽에서 발견하세요. / 고르는 시간은 짧게, 몰입은 깊게. / 취향으로 만나보기 |

두 파일을 합쳐 약 90.3 KiB입니다. 생성 결과의 내용은 그대로 두고 웹 표시 크기로 축소한 후 WebP 품질 82로 압축했습니다. UI에서는 원본 비율을 유지하고 아래쪽 광고 위치에는 지연 로딩을 적용하는 것이 좋습니다. 이미지 속 버튼 문구와 실제 링크 목적지를 일치시켜 주세요.

## 생성 프롬프트: 가로 배너

Use case: ads-marketing. Create ONE finished horizontal promotional raster banner for the Korean content recommendation service 찰픽 (Chalpick), landscape 3:1 aspect ratio, ideally 1500x500. Reference image 1 is brand-logo reference only: preserve the recognizable blue/teal/pale-blue four-facet emblem and Korean brand word 찰픽 in a small signature at upper left; do not use the image background. Premium contemporary Korean tech editorial advertising, white/very pale icy-blue background, generous whitespace, navy typography and electric blue/teal accents. Left 60%: typography with exceptionally clear accurate Korean text. Main headline large bold clean sans-serif: '취향에 꼭 맞는 다음 이야기'. Below, smaller: '웹툰 · 웹소설 · 드라마 · 영화'. Below that a compact cobalt rounded CTA pill reading '내 취향 찾기 →'. Right 35%: elegantly arranged floating frosted-glass story cards/book pages, one blue bookmark, tiny abstract cinematic frame and softly glowing four-facet motif. Sculptural 3D product rendering, soft daylight shadows, no busy background. The artwork should look polished and refined, not generic clipart. No characters, celebrities, third-party logos or copyrighted posters. Keep ALL text fully inside ample safe margins and readable; no extra English copy, no watermark. Exact text only as requested. Finished print-quality clean raster graphic, not a screenshot, no website frame.

## 생성 프롬프트: 사이드 배너

Use case: ads-marketing. Create ONE finished promotional raster sidebar image for Korean content recommendation service 찰픽 (Chalpick), landscape 6:5 aspect ratio, ideally1200x1000. Input image1 is brand-logo reference only: recognizable blue/teal/pale-blue four-facet emblem with Korean 찰픽 small signature near top left. Refined premium Korean tech-editorial ad. White and icy-blue background, navy Korean typography, electricblue and teal highlights. Top half: generously spaced clean typography, large legible headline EXACTLY two lines '오늘의 한 편,' and '찰픽에서 발견하세요.' Under headline in smaller darkgray type '고르는 시간은 짧게, 몰입은 깊게.' Bottom right: beautiful tactile frosted-glass storycards, softly glowing abstract book, movie-frame with pastel dawn gradient, small blue bookmark and faceted Chalpick sparkle; original scenes only, no third-party content posters. Ground objects with soft studio shadows. Bottom left a rounded cobalt CTA button with exact text '취향으로 만나보기'. Keepall textfullyinside large safe margins, maximum clarity at300pxwide. Restrainedhighendartdirection, luminous butnotoversaturated, no gradientsbehindtext, noartoverlappingtext. NoEnglishcopy, noextra slogans, no watermark, no humans, no siteframe, no mockup border. Actual finishedgraphic.
