import json, sys, glob, os
d = sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, '*.json'))):
    try: r = json.load(open(f, encoding='utf-8-sig'))
    except Exception as e: print(os.path.basename(f), 'BAD', e); continue
    name = os.path.basename(f)[:-5]
    out = {'ok': r.get('ok'), 'err': len(r.get('errors', []))}
    if r.get('failure'): out['failure'] = r['failure']
    if 'toast' in r: out['toast'] = {'icon': r['toast'].get('icon'), 'text': r['toast']['text'].replace('\n', ' | ')[:230], 'items': len(r['toast']['items']), 'ws': r['toast']['whiteSpace'], 'maxW': r['toast']['maxWidth']}
    if 'cards' in r: out['cards'] = [(c['title'], c['footer'][-2:] if c['footer'] else None, bool(c['hint'])) for c in r['cards']]
    if 'png' in r: out['png'] = {k: r['png'][k] for k in ['width', 'height', 'nonBackgroundPixels', 'ratio']}; out['ms'] = r.get('captureMs')
    if 'after' in r: out['after'] = r['after']; out['buttons'] = r.get('reloadButton')
    if name.split('-')[2] == 'smoke' or 'stale' in name: out['page'] = {k: r['page'][k] for k in ['path', 'headings', 'rootTextLength', 'errorView']}
    print(name, json.dumps(out, ensure_ascii=False))
    for e in r.get('errors', [])[:4]: print('    ERR', e[:300])
