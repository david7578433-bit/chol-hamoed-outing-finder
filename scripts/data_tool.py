"""Edit the site's place data in one file, then put it back for the website.

  python3 scripts/data_tool.py merge   -> writes data/all-places.json (one easy-to-edit file; not used by the site)
  python3 scripts/data_tool.py split   -> rebuilds data/core.json from data/all-places.json

In all-places.json drive times ("t") are a dictionary by community; core.json stores them as a list in the order of "origins".
Keep the order of places the same (or only add new places at the end): the daily website check (data/checks.json),
the winter hours (data/hours.json) and the AI helper's catalog (ai/catalog.txt) refer to places by their position.
Each place: n name, s category, k local/trip, a address, p phones, h regular hours, w website, io in/out, ll [lat, lng],
de description (written for this site), fp 0 when entry is free.
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, 'data', *a)

def merge():
    core = json.load(open(P('core.json'), encoding='utf-8'))
    keys = [o['k'] for o in core['origins']]
    for p in core['places']:
        p['t'] = {k: m for k, m in zip(keys, p.get('t') or []) if m is not None}
    json.dump(core, open(P('all-places.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('wrote data/all-places.json')

def split():
    full = json.load(open(P('all-places.json'), encoding='utf-8'))
    keys = [o['k'] for o in full['origins']]
    places = []
    for p in full['places']:
        p = dict(p)
        t = p.get('t') or {}
        p['t'] = [t.get(k) for k in keys] if t else []
        places.append(p)
    full['places'] = places
    json.dump(full, open(P('core.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('wrote data/core.json')

if __name__ == '__main__':
    {'merge': merge, 'split': split}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: print(__doc__))()
