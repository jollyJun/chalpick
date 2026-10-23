"""Fetch official rankings; keep source ranks, periods, and unambiguous catalog matches.

Run with --cached to rebuild from evidence files without network access.
Does not modify catalog.json or a database. Requires only Python's standard library.
"""
import argparse
import concurrent.futures
import datetime as dt
import html
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def clean(value):
    return html.unescape(re.sub(r'<[^>]+>', '', value)).strip()

def normalized(value):
    value = re.sub(r'\[독점\]|\((?:소설|웹툰)\)', '', value)
    return re.sub(r'\s+', '', value).casefold()

def acquire(key, url, cached):
    path = REPORTS / ('popular-' + key + '-source.json')
    if cached and path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=25) as response:
            result = {'sourceUrl': url, 'observedAt': now(), 'status': response.status,
                      'body': response.read().decode('utf-8')}
    except Exception as exc:
        result = {'sourceUrl': url, 'observedAt': now(), 'status': None, 'error': str(exc), 'body': ''}
    path.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    return result

def match_entry(entry, catalog, media):
    product = re.search(r'productNo=(\d+)', entry.get('url', ''))
    if product:
        matches = [item for item in catalog if item['type'] in media and any(
            re.search(r'productNo=' + product.group(1) + r'(?:&|$)', p.get('url', ''))
            for p in item.get('platforms', []))]
        if len(matches) == 1:
            entry['catalogId'] = matches[0]['id']
            entry['localizedTitle'] = matches[0]['title']
            entry['matchMethod'] = 'exact_platform_product_id_and_media'
            return entry
    matches = [item for item in catalog if item['type'] in media and
               normalized(item['title']) == normalized(entry.get('localizedTitle', entry['title']))]
    # Never guess across media or between multiple editions with the same title.
    if len(matches) == 1:
        entry['catalogId'] = matches[0]['id']
        entry['matchMethod'] = 'exact_normalized_title_and_media'
    else:
        entry['catalogId'] = None
        entry['matchMethod'] = 'ambiguous' if matches else 'unmatched'
    return entry

def naver_list(kind, catalog, cached):
    media = '웹소설' if kind == 'novel' else '웹툰'
    label = '웹소설' if kind == 'novel' else '만화'
    url = f'https://series.naver.com/{kind}/top100List.series?categoryCode=ALL&rankingTypeCode=DAILY'
    def page(number):
        key = f'naver_{kind}' + (f'-page{number}' if number > 1 else '')
        return acquire(key, url + (f'&page={number}' if number > 1 else ''), cached)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        responses = list(executor.map(page, range(1, 6)))
    entries = []
    for response in responses:
        section = re.search(r'<ul class="comic_top_lst">(.*?)</ul>', response['body'], re.S)
        if not section:
            continue
        for item in re.findall(r'<li>(.*?)</li>', section.group(1), re.S):
            rank_html = re.search(r'<span class="top_num">(.*?)</span>', item, re.S)
            heading = re.search(r'<h3>(.*?)</h3>', item, re.S)
            title = re.search(r'<a\s+href="([^"]+)"[^>]*>(.*?)</a>', heading.group(1), re.S) if heading else None
            if not rank_html or not title:
                continue
            rank = int(re.sub(r'\s+', '', clean(rank_html.group(1))))
            entry = {'rank': rank, 'title': clean(title.group(2)), 'catalogId': None,
                     'url': 'https://series.naver.com' + html.unescape(title.group(1)),
                     'status': 'available', 'observedAt': response['observedAt']}
            entries.append(match_entry(entry, catalog, [media]))
    entries.sort(key=lambda entry: entry['rank'])
    return {'id': f'naver-series-{kind}-daily', 'media': media,
            'label': f'네이버 시리즈 {label} 일간 TOP 100',
            'status': 'available' if entries else 'unavailable',
            'sourceLabel': f'네이버 시리즈 {label} TOP 100 · 일간', 'sourceUrl': url,
            'observedAt': max(r['observedAt'] for r in responses),
            'period': {'type': 'daily', 'label': '일간 · 공식 페이지에서 집계 시작·종료 시각 미표기', 'start': None, 'end': None},
            'scope': '전체 장르' + (' · 웹툰과 만화 단행본 포함' if kind == 'comic' else ''),
            'entries': entries,
            **({'reason': '공식 순위 HTML에서 순위와 작품명을 확인하지 못했습니다.'} if not entries else {})}

def netflix_list(kind, catalog, cached):
    url = 'https://www.netflix.com/tudum/top10/south-korea' + ('/tv' if kind == 'tv' else '')
    response = acquire('netflix_' + kind, url, cached)
    body = response['body']
    dates = re.search(r'data-uia="top10-filters-week-select-selected">(\d+/\d+/\d+) - (\d+/\d+/\d+)', body)
    period = {'type': 'weekly', 'label': '집계기간 확인 불가', 'start': None, 'end': None}
    if dates:
        start, end = [dt.datetime.strptime(s, '%m/%d/%y').date().isoformat() for s in dates.groups()]
        period = {'type': 'weekly', 'label': start + ' ~ ' + end, 'start': start, 'end': end}
    entries = []
    verified_aliases = {
        'Land of Happiness': ('행복의 나라', 'https://www.netflix.com/kr/title/82699647', ['영화']),
        'The Apothecary Diaries: Season 3': ('약사의 혼잣말', 'https://www.netflix.com/kr/title/81712068', ['애니메이션']),
    }
    for card in re.findall(r'<li data-entity-id="top10-[\s\S]*?</li>', body):
        title_match = re.search(r'alt="([^"]+)"', card)
        rank_match = re.search(r'#(\d+) in (?:Shows|Movies)', card)
        id_match = re.search(r'data-id="top10-[^"]+-(\d+)"', card)
        if not (title_match and rank_match and id_match):
            continue
        title = html.unescape(title_match.group(1))
        entry = {'rank': int(rank_match.group(1)), 'title': title, 'catalogId': None,
                 'sourceTitleId': id_match.group(1), 'status': 'available',
                 'url': 'https://www.netflix.com/kr/title/' + id_match.group(1)}
        media = ['영화'] if kind == 'movies' else ['드라마', 'OTT', '애니메이션']
        source_id = id_match.group(1)
        direct_matches = [item for item in catalog if item['type'] in media and any(
            re.search(r'netflix\.com/(?:kr/)?title/' + source_id + r'(?:[/?]|$)', p.get('url', ''))
            for p in item.get('platforms', []))]
        if len(direct_matches) == 1:
            entry.update(catalogId=direct_matches[0]['id'], localizedTitle=direct_matches[0]['title'],
                         matchMethod='exact_platform_title_id_and_media')
            entries.append(entry)
            continue
        if title in verified_aliases:
            localized, verification, media = verified_aliases[title]
            entry.update(localizedTitle=localized, titleVerificationUrl=verification)
        entry = match_entry(entry, catalog, media)
        if entry['catalogId'] is not None and title == 'The Apothecary Diaries: Season 3':
            entry.update(matchMethod='verified_series_level_match', seriesTitleId='81712068',
                         editionWarning='원본 순위는 시즌 3(83050560), 찰픽 연결은 시리즈 전체(81712068)입니다. 시즌별 항목을 동일 판본으로 간주하지 않습니다.')
        entries.append(entry)
    available = len(entries) == 10 and period['start'] is not None
    return {'id': 'netflix-kr-' + kind + '-weekly', 'media': '영화' if kind == 'movies' else '드라마·OTT',
            'label': '넷플릭스 한국 ' + ('영화' if kind == 'movies' else 'TV') + ' 주간 TOP 10',
            'status': 'available' if available else 'unavailable', 'sourceLabel': 'Netflix Tudum · 한국 주간 TOP 10',
            'sourceUrl': url, 'observedAt': response['observedAt'], 'period': period, 'country': 'KR',
            'scope': 'Movies' if kind == 'movies' else 'TV 전체 · 드라마, 예능, 애니메이션 포함',
            'entries': entries if available else [],
            **({'reason': '공식 페이지의 10개 순위 또는 집계기간을 완전히 검증하지 못했습니다.'} if not available else {})}

def localize_netflix(lists, cached):
    path = REPORTS / 'popular-netflix-localized-source.json'
    entries = [entry for listing in lists if listing['id'].startswith('netflix-kr-') for entry in listing['entries']]
    if cached and path.exists():
        evidence = json.loads(path.read_text(encoding='utf-8'))['items']
    else:
        def fetch_title(entry):
            source_id = entry['sourceTitleId']
            url = 'https://www.netflix.com/kr/title/' + source_id
            result = {'sourceTitleId': source_id, 'sourceUrl': url, 'observedAt': now(), 'localizedTitle': None}
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=25) as response:
                    body = response.read().decode('utf-8')
                    result.update(status=response.status, finalUrl=response.url)
                heading = re.search(r'<h1[^>]*>(.*?)</h1>', body, re.S)
                if heading and re.search(r'[가-힣]', clean(heading.group(1))):
                    result.update(localizedTitle=clean(heading.group(1)), evidence=heading.group(0))
            except Exception as exc:
                result.update(status=None, error=str(exc))
            return result
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            evidence = list(executor.map(fetch_title, entries))
        path.write_text(json.dumps({'items': evidence}, ensure_ascii=False, indent=2), encoding='utf-8')
    by_id = {item['sourceTitleId']: item for item in evidence if item.get('status') == 200 and item.get('localizedTitle')}
    for entry in entries:
        item = by_id.get(entry['sourceTitleId'])
        if item:
            entry.update(localizedTitle=html.unescape(item['localizedTitle']), titleVerificationUrl=item['sourceUrl'],
                         titleObservedAt=item['observedAt'])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cached', action='store_true')
    args = parser.parse_args()
    REPORTS.mkdir(exist_ok=True)
    catalog = json.loads((ROOT / 'public/data/catalog.json').read_text(encoding='utf-8'))['items']
    lists = [naver_list('comic', catalog, args.cached), naver_list('novel', catalog, args.cached),
             netflix_list('movies', catalog, args.cached), netflix_list('tv', catalog, args.cached)]
    localize_netflix(lists, args.cached)
    tv = lists[-1]
    anime = [dict(e) for e in tv['entries'] if e.get('catalogId') and
             next(item['type'] for item in catalog if item['id'] == e['catalogId']) == '애니메이션']
    lists.append({'id': 'netflix-kr-tv-animation-weekly', 'media': '애니메이션',
                  'label': '넷플릭스 한국 TV TOP 10 속 애니메이션', 'status': 'available' if anime else 'unavailable',
                  'sourceLabel': tv['sourceLabel'], 'sourceUrl': tv['sourceUrl'], 'observedAt': tv['observedAt'],
                  'period': tv['period'], 'country': 'KR', 'scope': '애니메이션 전용 순위가 아닙니다. 한국 TV 전체 순위를 그대로 표시합니다.',
                  'entries': anime, **({'reason': '검증 가능한 애니메이션 작품이 없습니다.'} if not anime else {})})
    # These are the results of the accompanying browser verification, not claimed live checks by this script.
    verified_at = '2026-10-22T09:56:00Z'
    unavailable = [
        ('kobis-daily', '영화', 'KOBIS 일별 박스오피스', 'https://www.kobis.or.kr/kobis/business/stat/boxs/findDailyBoxOfficeList.do', '공식 페이지가 조회 결과 0건을 반환했고 날짜별 순위를 확인하지 못했습니다.'),
        ('kakao-webtoon', '웹툰', '카카오페이지 실시간 랭킹', 'https://page.kakao.com/menu/10010/screen/94', '공식 순위 페이지에 접근할 수 없어 순위를 검증하지 못했습니다.'),
        ('laftel-animation', '애니메이션', '라프텔 인기 순위', 'https://laftel.net/', '공식 사이트가 403 Forbidden을 반환하여 애니메이션 전용 순위를 확인하지 못했습니다.'),
    ]
    for ident, media, label, url, reason in unavailable:
        lists.append({'id': ident, 'media': media, 'label': label, 'status': 'unavailable',
                      'sourceLabel': label, 'sourceUrl': url, 'observedAt': verified_at,
                      'period': {'type': 'unknown', 'label': '집계기간 확인 불가', 'start': None, 'end': None},
                      'entries': [], 'reason': reason})
    output = {'updatedAt': now(), 'schemaVersion': 1,
              'notes': ['플랫폼별 공식 순위이며 찰픽 통합 인기 순위가 아닙니다.',
                        'rank는 원본 순위입니다. 미등록 작품을 숨기더라도 다시 번호를 매기지 않습니다.',
                        'observedAt은 조회 시각(UTC), period는 플랫폼이 명시한 집계기간입니다.',
                        'catalogId가 null이면 제목과 매체를 검증하여 연결할 수 없었던 작품입니다.'],
              'lists': lists}
    (ROOT / 'public/data/popular.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    summary = {'updatedAt': output['updatedAt'], 'lists': [{k: entry[k] for k in ['id', 'status', 'period']} |
               {'entryCount': len(entry['entries']), 'matchedCount': sum(e['catalogId'] is not None for e in entry['entries']),
                'matches': [{'rank': e['rank'], 'title': e['title'], 'catalogId': e['catalogId']} for e in entry['entries'] if e['catalogId'] is not None]}
               for entry in lists]}
    (REPORTS / 'popular-build-report.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
