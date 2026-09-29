# Writes the job lists drive.ps1 walks through: jobs-chrome.json (48 jobs) and jobs-firefox.json (35 jobs).
# Usage: python3 make_jobs.py <output dir, e.g. the WSL path of a Windows temp folder>
import json
import os
import sys

out_dir = sys.argv[1]

# port -> job-name tag (build + server shape). 5303 serves the main build and only feeds the visual baseline.
PORTS = {5301: 'devnew', 5302: 'devold', 5303: 'mainold'}
ADMIN = ['success', 'partial', 'allfail', 'http500', 'http403']
SMOKE = [('login', '/login?anon=1'), ('dashboard', '/'), ('tier', '/tier-table'), ('admin', '/admin/tier-table'),
         ('import', '/import/csv'), ('profile', '/profile'), ('public', '/shared/tier-table/abc123'),
         ('notfound', '/no-such-page'), ('teapot', '/418')]


def jobs_for(port, browser):
    tag = PORTS[port]
    base = f'http://localhost:{port}'
    jobs = []
    if port != 5303:
        jobs += [{'name': f'{browser}-{tag}-admin-{s}', 'url': f'{base}/admin/tier-table?probe=admin:{s}'} for s in ADMIN]
    jobs.append({'name': f'{browser}-{tag}-scores', 'url': f'{base}/scores?probe=scores:x'})
    jobs += [{'name': f'{browser}-{tag}-png-{m}', 'url': f'{base}/tier-table?probe=png:{m}'} for m in ['chips', 'dense']]
    for name, path in SMOKE:
        sep = '&' if '?' in path else '?'
        jobs.append({'name': f'{browser}-{tag}-smoke-{name}', 'url': f'{base}{path}{sep}probe=smoke:{name}'})
    # Breaks the Scores chunk on that server until the scenario ends, so keep it last per port.
    if port in (5301, 5303):
        jobs.append({'name': f'{browser}-{tag}-stale-scores', 'url': f'{base}/?probe=stale:Scores'})
    return jobs


chrome = jobs_for(5301, 'chrome') + jobs_for(5302, 'chrome') + jobs_for(5303, 'chrome')
firefox = jobs_for(5301, 'firefox') + jobs_for(5302, 'firefox')
os.makedirs(out_dir, exist_ok=True)
for name, jobs in [('jobs-chrome.json', chrome), ('jobs-firefox.json', firefox)]:
    with open(os.path.join(out_dir, name), 'w', encoding='utf-8') as f:
        json.dump(jobs, f, ensure_ascii=False, indent=0)
print(len(chrome), len(firefox))
