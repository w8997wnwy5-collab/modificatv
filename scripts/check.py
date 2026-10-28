"""Check that the webOS manifests and their referenced files are present."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
app = root / 'app'
info = json.loads((app / 'appinfo.json').read_text())
service = json.loads((root / 'service/services.json').read_text())
version = json.loads((root / 'package.json').read_text())['version']
# Developer Mode installs replace an app with the same ID; keep it stable across updates.
assert info['id'] == 'io.cleanframe.lg', 'Keep the installed app ID stable'
assert re.fullmatch(r'[a-z0-9][a-z0-9.-]*', info['id']) and not info['id'].startswith(('com.palm', 'com.webos', 'com.lge')), 'Invalid webOS app ID'
assert info['type'] == 'web' and info.get('disableBackHistoryAPI') is True, 'CleanFrame handles Back itself'
assert info['version'] == version == json.loads((root / 'service/package.json').read_text())['version'], 'Manifest/package versions differ'
assert re.fullmatch(r'\d+\.\d+\.\d+', info['version']), 'webOS versions are three numbers'
assert service['id'] == info['id'] + '.service' and [s['name'] for s in service['services']] == [service['id']], 'Service ID must extend the app ID'
assert json.loads((root / 'service/package.json').read_text())['name'] == service['id'], 'Service package name differs'
assert (root / 'service/service.js').is_file(), 'Missing service'
for field in ['main', 'icon', 'largeIcon']:
    assert (app / info[field]).is_file(), 'Missing ' + field + ' file'
assert all((app / name).is_file() for name in ['main.js', 'style.css'])
for reference in ['assets/wallpapers/catalog.js', 'assets/adaptive-ink.js', 'assets/font-catalog.js']:
    assert (app / reference).is_file(), 'Missing runtime catalogue: ' + reference
for filename in ['index.html']:
    source = (app / filename).read_text()
    pattern = r'(?:src|href)=[\"\']([^\"\']+)' if filename.endswith('.html') else r'from\s+[\"\']([^\"\']+)'
    for reference in re.findall(pattern, source):
        if ':' in reference or reference.startswith('$'):
            continue
        assert (app / reference).is_file(), 'Missing bundled resource: ' + reference
        if filename.endswith('.js'):
            assert reference.startswith(('./', '../')), 'Module imports must be relative paths'
for css in app.rglob('*.css'):
    source = re.sub(r'/\*.*?\*/', '', css.read_text(), flags=re.S)
    assert not re.search(r'(?:^|[;{}])\s*inset\s*:', source, re.I), 'Use explicit edges for older engines: ' + str(css.relative_to(app))
    assert not re.search(r'(?:^|[;{}])\s*(?:row-|column-)?gap\s*:', source, re.I), 'Use child margins for older flex engines: ' + str(css.relative_to(app))
    for reference in re.findall(r'url\([\"\']?([^\)\"\']+)', source):
        if ':' not in reference:
            assert (css.parent / reference.split('?')[0]).is_file(), 'Missing CSS resource: ' + reference
# These resource names are constructed at runtime, so HTML/CSS reference checks cannot find them.
walls = json.loads((app / 'assets/wallpapers/SOURCES.json').read_text())
for wall in walls:
    for field in ['src', 'thumb']:
        assert (app / wall[field]).is_file(), 'Missing wallpaper: ' + wall[field]
    wall_id = wall['id']
    for suffix in ['study-soft', 'field-blur', 'field-frost', 'field-clear']:
        assert (app / ('assets/materials/' + wall_id + '-' + suffix + '.jpg')).is_file(), 'Missing registered material: ' + wall_id + '/' + suffix
    assert (app / ('assets/wallpapers/' + wall_id + '-panel.jpg')).is_file(), 'Missing panel backdrop: ' + wall_id
for icon in ['netflix', 'youtube', 'primevideo', 'disneyplus', 'appletv', 'spotify', 'hbomax']:
    assert (app / ('assets/icons/' + icon + '.svg')).is_file(), 'Missing icon: ' + icon
print('App identity, version and bundled resources are valid.')
