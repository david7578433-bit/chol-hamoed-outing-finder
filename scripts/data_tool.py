"""Edit the site's place data in one file, then split it back for the website.

The website loads two files so the first screen is quick on phones:
  data/core.json     everything the lists and cards need (drive times are stored as a list in the order of "origins")
  data/details.json  the Yiddish description ("d") and family reviews ("rv") of each place, in the same order

  python3 scripts/data_tool.py merge   -> writes data/all-places.json (one easy-to-edit file; not used by the site)
  python3 scripts/data_tool.py split   -> rebuilds data/core.json and data/details.json from data/all-places.json

Keep the order of places the same (or only add new places at the end): the daily website check (data/checks.json)
and the AI helper's catalog (ai/catalog.txt) refer to places by their position. Winter-only additions live in seasons.js.
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, 'data', *a)

def merge():
    core = json.load(open(P('core.json'), encoding='utf-8'))
    det = json.load(open(P('details.json'), encoding='utf-8'))['details']
    keys = [o['k'] for o in core['origins']]
    for p, d in zip(core['places'], det):
        p['t'] = {k: m for k, m in zip(keys, p.get('t') or []) if m is not None}
        p.pop('rn', None); p['d'] = d.get('d', ''); p['rv'] = d.get('rv', [])
    json.dump(core, open(P('all-places.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote data/all-places.json')

def split():
    full = json.load(open(P('all-places.json'), encoding='utf-8'))
    keys = [o['k'] for o in full['origins']]
    places, det = [], []
    for p in full['places']:
        p = dict(p)
        det.append({'d': p.pop('d', ''), 'rv': p.pop('rv', [])})
        t = p.get('t') or {}
        p['t'] = [t.get(k) for k in keys] if t else []
        p['rn'] = len(det[-1]['rv'])
        places.append(p)
    full['places'] = places
    json.dump(full, open(P('core.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'v': 1, 'details': det}, open(P('details.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('wrote data/core.json and data/details.json')

if __name__ == '__main__':
    {'merge': merge, 'split': split}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: print(__doc__))()
