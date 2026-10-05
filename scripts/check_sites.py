"""Daily hours-and-prices checker.

Runs on GitHub Actions (see .github/workflows/daily-check.yml). For every place with a website it
downloads the site plus its hours/visit/tickets pages, keeps the lines about hours and prices,
asks Google Gemini (free tier) to compare them with the printed guide, and saves the results to
data/checks.json, which the website reads. The workflow commits that file back to the repository.

Needs one GitHub repository secret:
  GEMINI_API_KEY   from https://aistudio.google.com/apikey
Optional: GEMINI_MODEL (default gemini-flash-latest)
"""
import json, os, re, sys, time, html, datetime, concurrent.futures as cf
from urllib.parse import urljoin, urlparse
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLACES = json.load(open(os.path.join(ROOT, 'data', 'places.json'), encoding='utf-8'))
GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')
MODEL = os.environ.get('GEMINI_MODEL', 'gemini-flash-latest')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
LINK = re.compile(r'hour|visit|plan|ticket|pric|admission|rate|info|faq|attraction|location|open|general', re.I)
KEEP = re.compile(r'\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)|\bnoon\b|\bopen|\bclosed\b|\bhours\b|\$\s?\d|\bfree\b|admission|ticket', re.I)
S = requests.Session()
S.headers.update({'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml'})

T0 = time.time()
FETCH_BUDGET = 20 * 60     # seconds for downloading all websites
TOTAL_BUDGET = 65 * 60     # stop asking Gemini after this, so results are always saved in time

def log(*a):
    print(f'[{int(time.time() - T0) // 60:02d}:{int(time.time() - T0) % 60:02d}]', *a, flush=True)

def get(url):
    # Hard 20-second limit per page: a server that trickles bytes can't hold the whole check up.
    try:
        with S.get(url, timeout=(10, 15), allow_redirects=True, stream=True) as r:
            if 'html' not in r.headers.get('content-type', 'text/html'):
                return r.status_code, r.url, ''
            buf, start = b'', time.time()
            for chunk in r.iter_content(65536):
                buf += chunk
                if len(buf) > 3_000_000 or time.time() - start > 20: break
            return r.status_code, r.url, buf.decode(r.encoding or 'utf-8', 'replace')
    except Exception:
        return 0, url, ''

def text_lines(body):
    b = re.sub(r'(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>', ' ', body)
    b = re.sub(r'(?i)<br\s*/?>|</(p|div|li|tr|h\d|section|td|th|span)>', '\n', b)
    b = html.unescape(re.sub(r'<[^>]+>', ' ', b))
    return [re.sub(r'[ \t\xa0]+', ' ', l).strip() for l in b.split('\n') if 3 < len(l.strip()) < 300]

def jsonld(body):
    out = []
    for m in re.finditer(r'(?is)<script[^>]+application/ld\+json[^>]*>(.*?)</script>', body):
        s = m.group(1)
        for key in ('openingHours', 'openingHoursSpecification', 'priceRange', 'offers'):
            for k in re.finditer(r'"%s"\s*:\s*(\[[^\]]*\]|"[^"]*"|\{[^}]*\})' % key, s):
                out.append(f'{key}: {k.group(1)[:300]}')
    md = re.search(r'(?is)<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', body)
    if md: out.append('description: ' + html.unescape(md.group(1))[:300])
    return out

def gather(p):
    url = p['website']
    if 'facebook.com' in url or 'instagram.com' in url:
        return {'id': p['id'], 'text': '', 'error': 'social media page'}
    code, final, body = get(url)
    if code != 200 or not body:
        return {'id': p['id'], 'text': '', 'error': f'website could not be loaded (HTTP {code})'}
    pages = [(final, body)]
    host = urlparse(final).netloc
    links = []
    for m in re.finditer(r'<a\b[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', body, re.I | re.S):
        href, label = m.group(1), re.sub(r'<[^>]+>', '', m.group(2))
        u = urljoin(final, href)
        if urlparse(u).netloc != host or u in links or u.rstrip('/') == final.rstrip('/'): continue
        if LINK.search(href) or LINK.search(label): links.append(u)
    for u in links[:6]:
        c2, f2, b2 = get(u)
        if c2 == 200 and b2: pages.append((f2, b2))
    seen, out = set(), []
    for f, b in pages:
        for l in jsonld(b) + text_lines(b):
            if (l.startswith(('openingHours', 'priceRange', 'offers', 'description')) or KEEP.search(l)) and l not in seen:
                seen.add(l); out.append(l)
    txt = '\n'.join(out)[:4000]
    return {'id': p['id'], 'text': txt, 'error': '' if txt else 'no hours or prices found in the page text'}

SCHEMA = {
    'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
        'id': {'type': 'INTEGER'}, 'siteHours': {'type': 'STRING'}, 'sitePrice': {'type': 'STRING'},
        'hours': {'type': 'STRING', 'enum': ['same', 'different', 'not_found']},
        'price': {'type': 'STRING', 'enum': ['same', 'different', 'not_found']},
        'note': {'type': 'STRING'}},
        'required': ['id', 'siteHours', 'sitePrice', 'hours', 'price', 'note']}}

PROMPT = """You compare a family outing guide with each place's own website. For EVERY item decide:
- siteHours: the regular opening hours the website text shows (max 160 chars), or "" if not shown.
- sitePrice: admission/entry prices the website text shows (max 160 chars), or "".
- hours: "same" if siteHours agree with guide_hours closely enough (ignore holiday notes), "different" if they clearly differ, "not_found" if the text shows no usable hours.
- price: "same" / "different" / "not_found" the same way.
- note: max 100 chars, only if important (e.g. "Website says closed for the season", "Hours vary by date"), else "".
Use only the website text given. Never guess. Ignore party packages, cookie banners and other locations' hours.
Items:
"""

def judge(batch):
    items = [{'id': g['id'], 'name': p['name'], 'guide_hours': p['guide_hours'], 'guide_price': p['guide_price'], 'website_text': g['text']} for g, p in batch]
    body = {'contents': [{'role': 'user', 'parts': [{'text': PROMPT + json.dumps(items, ensure_ascii=False)}]}],
            'generationConfig': {'temperature': 0.1, 'responseMimeType': 'application/json', 'responseSchema': SCHEMA}}
    for attempt in range(5):
        r = requests.post(f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
                          headers={'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json'}, json=body, timeout=180)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(30 * (attempt + 1)); continue
        r.raise_for_status()
        txt = ''.join(p.get('text', '') for p in r.json()['candidates'][0]['content']['parts'])
        return json.loads(txt)
    raise RuntimeError('Gemini kept refusing (rate limit)')

PATH = os.path.join(ROOT, 'data', 'checks.json')

def save(rows):
    """Merge rows into the website's data/checks.json (the workflow commits it). Safe to call often."""
    old = json.load(open(PATH, encoding='utf-8')) if os.path.exists(PATH) else {}
    for x in rows:
        prev = old.get(str(x['place_id']))
        # keep the last good finding when today's page simply failed to load
        if prev and x['hours'] == 'not_found' and x['price'] == 'not_found' and ('could not be loaded' in x['note'] or 'too long' in x['note']) and (prev.get('siteHours') or prev.get('sitePrice')):
            continue
        old[str(x['place_id'])] = {'checkedAt': x['checked_at'], 'url': x['url'], 'siteHours': x['site_hours'], 'sitePrice': x['site_price'],
                                   'hours': x['hours'], 'price': x['price'], 'note': x['note']}
    json.dump(old, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)

def main():
    if not GEMINI_KEY:
        sys.exit('Missing GEMINI_API_KEY (add it under Settings -> Secrets and variables -> Actions)')
    by_id = {p['id']: p for p in PLACES if p.get('website')}
    log(f'downloading {len(by_id)} websites')
    ex = cf.ThreadPoolExecutor(24)
    futs = {ex.submit(gather, p): pid for pid, p in by_id.items()}
    gathered = []
    try:
        for n, f in enumerate(cf.as_completed(futs, timeout=FETCH_BUDGET), 1):
            gathered.append(f.result())
            if n % 50 == 0: log(f'{n} websites downloaded')
    except cf.TimeoutError:
        done = {g['id'] for g in gathered}
        for f, pid in futs.items():
            if pid not in done: gathered.append({'id': pid, 'text': '', 'error': 'website took too long to load'})
        log('stopped waiting for slow websites')
    ex.shutdown(wait=False, cancel_futures=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    rows, todo = [], []
    for g in gathered:
        p = by_id[g['id']]
        if g['text']: todo.append((g, p))
        else:
            rows.append({'place_id': g['id'], 'checked_at': now, 'url': p['website'], 'site_hours': '', 'site_price': '',
                         'hours': 'not_found', 'price': 'not_found', 'note': g['error'][:100]})
    save(rows)
    log(f'{len(todo)} websites have hours or prices to compare; {len(rows)} had nothing usable')
    ok = lambda v: v if v in ('same', 'different', 'not_found') else 'not_found'
    for i in range(0, len(todo), 20):
        if time.time() - T0 > TOTAL_BUDGET:
            log(f'time budget used; {len(todo) - i} places wait for the next run'); break
        batch = todo[i:i + 20]
        try:
            res = {int(x['id']): x for x in judge(batch)}
        except Exception as e:
            log('batch failed:', e); res = {}
        part = []
        for g, p in batch:
            x = res.get(g['id'])
            if not x: continue
            part.append({'place_id': g['id'], 'checked_at': now, 'url': p['website'], 'site_hours': str(x.get('siteHours', ''))[:160],
                         'site_price': str(x.get('sitePrice', ''))[:160], 'hours': ok(x.get('hours')), 'price': ok(x.get('price')),
                         'note': str(x.get('note', ''))[:100]})
        save(part); rows += part
        log(f'compared {min(i + 20, len(todo))} of {len(todo)}')
        time.sleep(7)   # stay inside the free tier's requests-per-minute limit
    from collections import Counter
    log(f'saved {len(rows)} places. hours:', Counter(x['hours'] for x in rows), 'prices:', Counter(x['price'] for x in rows))
    os._exit(0)   # don't wait on any website download that is still hanging

if __name__ == '__main__':
    main()
