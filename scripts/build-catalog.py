"""Build the public, read-only catalog from the user's normalized CSV export.

Run locally with Python 3.12+. This script never connects to a database.
It reads only the supplied export and writes only inside this new website folder.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parents[1] / "결과물_ERD_DB_20261022"
TABLES = SOURCE / "테이블별_CSV"
RESEARCH = SOURCE / "_work"
OUTPUT = PROJECT / "public" / "data"
REPORTS = PROJECT / "reports"


def read_csv(name: str) -> list[dict]:
    with (TABLES / f"{name}.csv").open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def safe_url(value: str | None) -> str | None:
    if not value or any(c in value for c in "\r\n\t"):
        return None
    value = value.strip()
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return None
        if parsed.username or parsed.password:
            return None
        return value
    except ValueError:
        return None


def optional_number(value: str | None) -> int | float | None:
    if value is None or not value.strip():
        return None
    number = float(value)
    return int(number) if number.is_integer() else number


def first_source_url(value: str | None) -> str | None:
    match = re.search(r"https?://[^\s;|]+", value or "")
    return safe_url(match.group()) if match else None


def research_rows(filename: str):
    path = RESEARCH / filename
    if not path.exists():
        return
    # Iterate on actual newlines: splitlines() also splits Unicode separators
    # that can legitimately occur inside the stored Korean descriptions.
    with path.open(encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                parse_issues.append({"file": filename, "line": number})


def parse_rating(value: str) -> tuple[bool | None, int | None]:
    value = re.sub(r"[\u2066-\u2069\u200e\u200f]", "", value).strip()
    if value in {"ALL", "전체", "전체관람가", "전체이용가", "전체 이용가"}:
        return False, 0
    if value in {"청불", "청소년관람불가", "청소년 관람불가", "성인"}:
        return True, 19
    match = re.fullmatch(r"(?:RATE_)?(7|12|15|18|19)(?:\+|세(?:\s*(?:이용가|관람가))?)?", value)
    if match:
        age = int(match.group(1))
        return age >= 18, age
    return None, None


def record_age(content_id: int, adult: bool | None, age: int | None, evidence: str):
    if adult is None:
        return
    existing = age_data.get(content_id)
    # If sources disagree, the more restrictive observed rating wins.
    if existing and existing[0] is True and adult is False:
        return
    age_data[content_id] = (adult, age)
    age_sources[content_id] = evidence


contents = read_csv("contents")
persons = {row["id"]: row for row in read_csv("persons")}
tags = {row["tag_slug"]: row for row in read_csv("tag_dictionary")}
complexities = {row["content_id"]: row for row in read_csv("content_complexity")}
story_engines = {row["engine_slug"]: row for row in read_csv("story_engine_dictionary")}
tag_group_map = {"genre": "genre", "setting_premise": "setting", "character_relationship": "relationship"}
credits = defaultdict(list)
platform_rows = defaultdict(list)
parse_issues: list[dict] = []
age_data: dict[int, tuple[bool, int | None]] = {}
age_sources: dict[int, str] = {}
display_types: dict[int, str] = {}
content_media = {int(row["id"]): row["media"] for row in contents}

role_order = {
    "STORY_WRITER": 0,
    "LEAD_ARTIST": 1,
    "ORIGINAL_AUTHOR": 2,
    "ADAPTATION_WRITER": 3,
    "DIRECTOR": 4,
    "SCREENWRITER": 5,
    "LEAD_ACTOR": 6,
    "SUPPORT_ACTOR": 7,
}
role_labels = {
    "STORY_WRITER": "글", "LEAD_ARTIST": "그림", "ORIGINAL_AUTHOR": "원작",
    "ADAPTATION_WRITER": "각색", "DIRECTOR": "감독", "SCREENWRITER": "각본",
    "LEAD_ACTOR": "주요 출연", "SUPPORT_ACTOR": "조연",
}
for row in read_csv("content_creators"):
    credits[row["content_id"]].append(row)
for row in read_csv("content_platforms"):
    platform_rows[row["content_id"]].append(row)

for row in research_rows("research_naver.jsonl"):
    if row.get("identity_match") is not True:
        continue
    rating = row.get("api_data", {}).get("age", {})
    adult, age = parse_rating(rating.get("type", ""))
    record_age(int(row["content_id"]), adult, age, "official_naver_age")

for row in research_rows("research_other_validated.jsonl"):
    if row.get("usable") is not True or row.get("identity_match") is not True:
        continue
    info = row.get("media_evidence", {}).get("title_info", [])
    content_id = int(row["content_id"])
    if content_media.get(content_id) == "OTT":
        # Use only provider genre/feature labels before audio/cast metadata;
        # searching the complete record would misread names such as 애니 포츠.
        details = row.get("media_evidence", {}).get("more_details_excerpt", "")
        classification_text = details.split("음성", 1)[0]
        if "장르" in classification_text:
            classification_text = classification_text.split("장르", 1)[1]
        if re.search(r"애니메이션|애니 시리즈|(?:^|[ ,])애니(?:$|[ ,])", classification_text):
            display_types[content_id] = "애니메이션"
        elif not any(word in classification_text for word in ["리얼리티", "다큐멘터리", "토크쇼", "버라이어티", "스탠드업"]):
            if any(word in classification_text for word in ["드라마", "시트콤", "코미디 시리즈"]):
                if display_types.get(content_id) != "애니메이션":
                    display_types[content_id] = "드라마"
    for value in info:
        adult, age = parse_rating(str(value))
        record_age(int(row["content_id"]), adult, age, "official_platform_title_info")
    # The existing validated web records retain the official rating as a
    # separate bullet before the synopsis. Do not scan prose for numbers.
    for value in (row.get("source_excerpt") or "").split("\n")[:8]:
        if value.lstrip().startswith("*"):
            adult, age = parse_rating(value.lstrip().removeprefix("*").strip())
            record_age(int(row["content_id"]), adult, age, "official_platform_rating_bullet")

# Explicit edition-specific ratings already documented in the supplied export.
# Generic statements about possible authentication and separate adult editions
# are intentionally excluded. The underlying research notes remain private.
documented_adult = {
    230: None, 1279: 18, 1303: 19, 1313: 18, 1331: 18,
    1383: 19, 1501: 19, 1528: 19, 1614: None, 1727: 19, 1728: 19,
}
for content_id, age in documented_adult.items():
    record_age(content_id, True, age, "existing_edition_specific_rating_evidence")
record_age(1377, False, 15, "existing_edition_specific_rating_evidence")
record_age(1553, False, 15, "existing_edition_specific_rating_evidence")

items = []
for row in contents:
    content_id = int(row["id"])
    slugs = json.loads(row["tag_slugs_cache"] or "[]")
    public_tags = [tags[slug]["display_name"] for slug in slugs if slug in tags]
    genres = [tags[slug]["display_name"] for slug in slugs if slug in tags and tags[slug]["category"] == "genre"]
    tag_groups = {"genre": [], "setting": [], "relationship": []}
    for slug in slugs:
        if slug in tags:
            tag_groups[tag_group_map[tags[slug]["category"]]].append(tags[slug]["display_name"])
    names = []
    public_credits = []
    for credit in sorted(credits[row["id"]], key=lambda r: (role_order.get(r["creator_role"], 99), int(r["credit_order"] or 999), int(r["id"]))):
        person = persons.get(credit["person_id"])
        if not person:
            continue
        name = person["name"].strip()
        if name and name not in names:
            names.append(name)
        if name:
            collective_account = person["external_person_id"] == "naver_artist_305532"
            identity_key = (person["external_person_id"] or None) if not collective_account else None
            public_credits.append({
                "id": int(person["id"]),
                "name": name,
                "role": credit["creator_role"],
                "roleLabel": role_labels.get(credit["creator_role"], credit["creator_role"]),
                "identityKey": identity_key,
                "identityConfidence": "collective_account" if collective_account else ("verified_external_id" if identity_key else "content_scoped"),
                "candidateKey": None if collective_account else credit["creator_role"] + ":" + (person["normalized_name"] or name),
                "sourceUrl": first_source_url(credit["source_url"]),
            })
    links = []
    seen_platforms = set()
    for platform in sorted(platform_rows[row["id"]], key=lambda r: (r["is_available"] != "True", r["verification_status"] != "verified", {"availability": 0, "current_edition_provider": 1, "origin": 2}.get(r["platform_role"], 9), -int(r["id"]))):
        url = safe_url(platform["watch_url"])
        if not url or platform["is_available"] == "False" or platform["verification_status"] not in {"verified", "partial"}:
            continue
        if platform["platform"] in seen_platforms:
            continue
        seen_platforms.add(platform["platform"])
        links.append({"name": platform["platform"], "url": url})
    adult, age = age_data.get(content_id, (None, None))
    complexity_row = complexities.get(row["id"], {})
    items.append({
        "id": content_id,
        "title": row["title"],
        "type": display_types.get(content_id, row["media"]),
        "genre": genres[0] if genres else "기타",
        "tags": public_tags,
        "tagSlugs": slugs,
        "tagGroups": tag_groups,
        "description": row["synopsis"] or None,
        "year": int(row["release_year"]) if row["release_year"] else None,
        "creators": names,
        "credits": public_credits,
        "platforms": links,
        "image": safe_url(row["origin_image_url"]),
        "adult": adult,
        "age": age,
        "ipId": row["ip_id"] or None,
        "recommendation": {
            "tier": optional_number(row["tier"]),
            "axes": {key: optional_number(row[key]) for key in ["tempo", "mood", "resolve", "unusual"]},
            "storyEnginePrimary": row["story_engine_primary"] or None,
            "storyEngineSecondary": row["story_engine_secondary"] or None,
            "worldModel": row["world_model"] or None,
            "fantasyPresence": row["fantasy_presence"] or None,
            "complexity": {key: optional_number(complexity_row.get(key + "_complexity")) for key in ["overall", "tracking", "character", "faction", "naming", "relationship", "lore"]},
            "analysisState": complexity_row.get("analysis_state") or None,
            "provisional": True,
            "status": row["recommendation_status"] or None,
        },
    })

assert len(items) == 2500
assert len({item["id"] for item in items}) == 2500
assert {item["id"] for item in items} == {int(row["id"]) for row in contents}
assert all(item["type"] in {"웹툰", "웹소설", "OTT", "영화", "드라마", "애니메이션"} for item in items)
assert all(item["title"] and isinstance(item["tags"], list) and isinstance(item["creators"], list) for item in items)
assert all(set(item) == {"id", "title", "type", "genre", "tags", "tagSlugs", "tagGroups", "description", "year", "creators", "credits", "platforms", "image", "adult", "age", "ipId", "recommendation"} for item in items)
assert all(set(item["tagGroups"]) == {"genre", "setting", "relationship"} for item in items)
assert all(sorted(item["tags"]) == sorted(tag for group in item["tagGroups"].values() for tag in group) for item in items)
assert all(bool(credit["identityKey"]) if credit["identityConfidence"] == "verified_external_id" else credit["identityKey"] is None for item in items for credit in item["credits"])

by_id = {item["id"]: item for item in items}
featured_ids = [72, 73, 74, 64, 1, 243, 37, 36, 1061, 1057, 25, 180, 181, 182, 194, 7, 4, 56, 388, 397, 398, 436, 1218, 1370, 1439, 1517]
featured = [{"id": content_id, "title": by_id[content_id]["title"], "type": by_id[content_id]["type"], "image": by_id[content_id]["image"], "adult": by_id[content_id]["adult"]} for content_id in featured_ids if by_id[content_id]["adult"] is not True]
counts = {
    "total": len(items),
    "byType": dict(Counter(item["type"] for item in items)),
    "byGenre": dict(Counter(item["genre"] for item in items).most_common()),
    "withImage": sum(item["image"] is not None for item in items),
    "withDescription": sum(item["description"] is not None for item in items),
    "withPlatformLink": sum(bool(item["platforms"]) for item in items),
    "withYear": sum(item["year"] is not None for item in items),
    "adult": sum(item["adult"] is True for item in items),
    "nonAdultConfirmed": sum(item["adult"] is False for item in items),
    "ageUnconfirmed": sum(item["adult"] is None for item in items),
    "creditRows": sum(len(item["credits"]) for item in items),
    "verifiedIdentityCredits": sum(credit["identityKey"] is not None for item in items for credit in item["credits"]),
    "withFourAxes": sum(all(value is not None for value in item["recommendation"]["axes"].values()) for item in items),
    "withOverallComplexity": sum(item["recommendation"]["complexity"]["overall"] is not None for item in items),
}
catalog = {"items": items, "updatedAt": "2026-10-22", "sourceCount": len(contents)}
tag_counts = Counter(slug for item in items if item["adult"] is not True for slug in item["tagSlugs"])
tag_counts_all = Counter(slug for item in items for slug in item["tagSlugs"])
taxonomy_groups = []
for group_id, category, label in [("genre", "genre", "장르"), ("setting", "setting_premise", "소재·배경"), ("relationship", "character_relationship", "인물·관계")]:
    group_tags = []
    for slug, tag in tags.items():
        if tag["category"] != category:
            continue
        group_tags.append({
            "slug": slug,
            "label": tag["display_name"],
            "count": tag_counts[slug],
            "countAll": tag_counts_all[slug],
            "aliases": [alias.strip() for alias in re.split(r"[,;|]", tag["aliases"]) if alias.strip()],
            "definition": tag["definition"],
        })
    taxonomy_groups.append({"id": group_id, "label": label, "count": len(group_tags), "tags": group_tags})
taxonomy = {
    "updatedAt": catalog["updatedAt"],
    "totalTags": len(tags),
    "groups": taxonomy_groups,
    "countScope": "adult !== true인 작품 수. countAll은 전체 2,500편 기준.",
    "roles": role_labels,
    "storyEngines": [{"slug": slug, "label": engine["display_name"], "definition": engine["definition"]} for slug, engine in story_engines.items()],
}
manifest = {
    "updatedAt": catalog["updatedAt"],
    "counts": counts,
    "types": list(counts["byType"]),
    "genres": [name for name, _count in Counter(item["genre"] for item in items).most_common()],
    "platforms": sorted({platform["name"] for item in items for platform in item["platforms"]}),
    "featured": featured,
    "ageValues": {"true": "확인된 성인 등급 또는 성인 인증 판본", "false": "확인된 전체·7·12·15세 등급", "null": "이용등급 미확인"},
    "imagePolicy": "공급처 원본 이미지 URL. 찰픽 CDN 복제본이 아니며 공급처 정책과 URL 변경에 따라 표시 여부가 달라질 수 있습니다.",
    "taxonomyCounts": {group["id"]: group["count"] for group in taxonomy_groups},
    "creditIdentityPolicy": {"verified_external_id": "같은 identityKey를 공유하는 작품만 동일 인물·창작 스튜디오로 연결", "content_scoped": "작품별 인물 레코드이며 동명인으로 자동 병합하지 않음", "collective_account": "여러 작가를 묶은 공동 계정은 동일 작가 추천에서 제외", "candidateKey": "동일 역할·이름 검색용 후보. 동일 인물 근거가 아니므로 동명 포함 표시 필요"},
    "recommendationDataPolicy": "원본의 잠정 분석값을 보존합니다. 공식 플랫폼 평가나 확정 추천 점수가 아니며, 결측값은 null입니다.",
}
report = {
    "counts": counts,
    "inputFiles": ["contents.csv", "persons.csv", "content_creators.csv", "content_platforms.csv", "tag_dictionary.csv", "content_complexity.csv", "story_engine_dictionary.csv"],
    "ageEvidenceCounts": dict(Counter(age_sources.values())),
    "originalTypeCounts": dict(Counter(row["media"] for row in contents)),
    "classifiedOttCounts": dict(Counter(display_types.values())),
    "unreadableResearchLines": parse_issues,
    "checks": {"sourceIdsPreserved": True, "uniqueIds": True, "publicFieldAllowlist": True, "httpUrlsOnly": True, "databaseAccess": False},
    "missingRequestedTitles": ["인터스텔라", "어바웃 타임", "장송의 프리렌"],
    "notes": ["No existing source files were modified.", "Existing structured catalog fields were used without invented ratings, popularity, or release years.", "Sources and private review notes are excluded from the public payload.", "Known adult editions are flagged; null does not imply all-ages suitability."]
}
OUTPUT.mkdir(parents=True, exist_ok=True)
REPORTS.mkdir(parents=True, exist_ok=True)
(OUTPUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
(OUTPUT / "catalog-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUTPUT / "taxonomy.json").write_text(json.dumps(taxonomy, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(REPORTS / "catalog-build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({"output": str(OUTPUT / "catalog.json"), "counts": counts, "researchParseErrors": len(parse_issues)}, ensure_ascii=False))
