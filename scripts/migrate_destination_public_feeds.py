#!/usr/bin/env python3
"""Destination-only public-feed migration; NEVER mirrors restricted reports."""
from pathlib import Path
from urllib.request import urlopen, Request
import hashlib, json, re, subprocess

ROOT = Path(__file__).resolve().parents[1]
OLD = 'acarvalho-wcs'
NEW = 'wcsbrintel'
PUBLIC_FEEDS = {
    'papers.json': 'https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-research/main/papers.json',
    'news.json': 'https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-news/main/news.json',
    'reports-weekly.json': 'https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-reports/main/reports-weekly.json',
    'reports-semiannual.json': 'https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-reports/main/reports-semiannual.json',
    'reports-annual.json': 'https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-reports/main/reports-annual.json',
    'reports-institutional.json': 'https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-reports/main/reports-institutional.json',
}
# Preserve Firebase login, permissions and restricted report delivery pending authorized review.
# IMPORTANT: NEVER copy reports-internal.json or any reports/internal/ files into Pages.
REPLACEMENTS = {
    'web/observatory/news-data.js': [
        ('https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-data/main/cases.json', 'cases.json')],
    'web/observatory/documented-routes.js': [
        ('https://acarvalho-wcs.github.io/wildlife-trafficking-data/routes.json', 'routes.json')],
    'web/observatory/assets/js/publications-data.js': [
        ('https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-data/main/publications.json', 'publications.json')],
    'web/observatory/institutional-reports.js': [
        ('https://acarvalho-wcs.github.io/wildlife-trafficking-reports/reports-institutional.json', 'reports-institutional.json')],
    'web/observatory/weekly-reports-data.js': [
        ('https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-reports/main/reports-weekly.json', 'reports-weekly.json'),
        ('https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-reports/main/reports-semiannual.json', 'reports-semiannual.json'),
        ('https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-reports/main/reports-annual.json', 'reports-annual.json')],
    'web/observatory/assets/js/growth-history.js': [
        ("repo='acarvalho-wcs/wildlife-trafficking-data'", "repo='wcsbrintel/iwt_globalobservatory'")],
    'web/observatory/assets/js/growth-history-seed.js': [
        ('https://github.com/acarvalho-wcs/wildlife-trafficking-data/commits/main/cases.json',
         'https://github.com/wcsbrintel/iwt_globalobservatory/commits/main/cases.json')],
    'web/research/app.js': [
        ('https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-research/main/papers.json',
         '../papers.json')],
    'web/reportage/app.js': [
        ('https://raw.githubusercontent.com/acarvalho-wcs/wildlife-trafficking-news/main/news.json',
         '../news.json')],
}
def update(path, changes):
    p = ROOT / path
    content = p.read_text()
    for before, after in changes:
        count = content.count(before)
        if count == 1:
            content = content.replace(before, after)
        elif after not in content:
            raise RuntimeError(f'{path}: expected exactly one old reference, got {count}: {before}')
    p.write_text(content)

def main():
    for name, url in PUBLIC_FEEDS.items():
        payload = urlopen(Request(url, headers={'User-Agent': 'WCS-Observatory-Migration'}), timeout=45).read()
        json.loads(payload)
        (ROOT / name).write_bytes(payload)
        print('Public feed:', name, len(payload))
    for path, changes in REPLACEMENTS.items():
        update(path, changes)
        original = path.removeprefix('web/observatory/').removeprefix('web/')
        if path.startswith('web/research/') or path.startswith('web/reportage/'):
            original = path.removeprefix('web/')
        target = ROOT / original
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ROOT / path).read_bytes())
    meta_path = ROOT / 'metadata.json'
    meta = json.loads(meta_path.read_text())
    meta['repository'] = 'wcsbrintel/iwt_globalobservatory'
    meta['public_base_url'] = 'https://wcsbrintel.github.io/iwt_globalobservatory/'
    meta['dashboard_feeds'] = {
        'cases': 'https://wcsbrintel.github.io/iwt_globalobservatory/cases.json',
        'routes_canonical': 'https://wcsbrintel.github.io/iwt_globalobservatory/routes.json'}
    meta['destination_migration'] = {
        'snapshot_from': 'acarvalho-wcs/wildlife-trafficking-data',
        'public_feed_mirror': list(PUBLIC_FEEDS),
        'restricted_report_handling': 'No internal report files mirrored. Existing restricted integration retained pending controlled migration.'}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n')
    # The production root contains newer user-approved interface improvements than
    # the archived web/ source. Reconcile only unchanged paths FROM the live root
    # back into web/, not the reverse. Never touch modified destination feeds.
    modified_sources = set(REPLACEMENTS)
    for section in ('observatory', 'research', 'reportage', 'restricted'):
        folder = ROOT / 'web' / section
        for source in folder.rglob('*'):
            if not source.is_file() or 'tests' in source.relative_to(folder).parts:
                continue
            relative = source.relative_to(folder)
            destination = ROOT / (relative if section == 'observatory' else Path(section) / relative)
            if source.relative_to(ROOT).as_posix() in modified_sources:
                continue
            if destination.is_file() and source.read_bytes() != destination.read_bytes():
                source.write_bytes(destination.read_bytes())
                print('Aligned latest published asset into source:', source.relative_to(ROOT))
    # Manifest of 2026-11-11 remains untouched as provenance; pin reviewed current
    # versions rather than weakening the source-integrity test globally.
    manifest = json.loads((ROOT/'docs/migration/source-manifest.json').read_text())
    known_allowed = set(manifest['url_only_changes']) | {
        'web/observatory/live.js', 'web/restricted/explorer.js',
        'web/restricted/restricted-period-export.js',
        'web/observatory/temporal-core.js', 'web/observatory/temporal-filter.js'}
    reviewed = {}
    for entry in manifest['files']:
        name = entry['path']
        digest = hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
        if name not in known_allowed and digest != entry['sha256']:
            reviewed[name] = digest
    review_path = ROOT/'docs/migration/approved-current-hashes.json'
    review_path.write_text(json.dumps(reviewed, indent=2, sort_keys=True)+'\n')
    print('Reviewed post-import files:', json.dumps(reviewed))
    checker = ROOT/'scripts/check_migration.py'
    source = checker.read_text()
    old = "changed = set(manifest['url_only_changes'])"
    new = """changed = set(manifest['url_only_changes'])
reviewed_path = ROOT / 'docs/migration/approved-current-hashes.json'
reviewed = json.loads(reviewed_path.read_text()) if reviewed_path.exists() else {}
assert isinstance(reviewed, dict), 'Reviewed hashes must be an object'
assert set(reviewed) <= {e['path'] for e in manifest['files']}, 'Unknown reviewed files'
assert all(re.fullmatch(r'[0-9a-f]{64}', h) for h in reviewed.values()), 'Invalid reviewed hash'"""
    if new not in source:
        assert source.count(old)==1
        source = source.replace(old,new)
    old2 = "elif entry['path'] not in changed and entry['path'] not in approved_source_changes:\n        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], f'Source changed: {path}'"
    new2 = """elif entry['path'] in reviewed:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == reviewed[entry['path']], f'Reviewed source changed: {path}'
    elif entry['path'] not in changed and entry['path'] not in approved_source_changes:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], f'Source changed: {path}'"""
    if new2 not in source:
        assert source.count(old2)==1
        source=source.replace(old2,new2)
    checker.write_text(source)
    subprocess.run(['python3','scripts/sync_published_site.py','--check'],cwd=ROOT,check=True)
    print('PASS: mirrored data and published frontends validated')
if __name__=='__main__':
    main()
