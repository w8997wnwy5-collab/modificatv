"""Build the LG webOS package from app/ and service/ with LG's official packager.

    npm run package   ->   dist/<app id>_<version>_all.ipk

Offline: no TV, account or signing key is used. Developer Mode installs this
package as it is. Sources are copied unminified, exactly as checked.
"""
from pathlib import Path
import io
import json
import subprocess
import tarfile

from private_files import private_path, secret_content

ROOT = Path(__file__).resolve().parents[1]
APP, SERVICE, DIST = ROOT / 'app', ROOT / 'service', ROOT / 'dist'
REQUIRED = ['appinfo.json', 'index.html', 'device.js', 'main.js', 'style.css', 'icon.png', 'largeIcon.png']


def sources():
    for folder in (APP, SERVICE):
        for path in sorted(folder.rglob('*')):
            name = path.relative_to(ROOT).as_posix()
            if path.is_symlink():
                raise SystemExit('Package files must be regular files, not symlinks: ' + name)
            if not path.is_file():
                continue
            if private_path(name) or name.startswith('app/assets/private-fonts/') or secret_content(path.read_bytes()):
                raise SystemExit('Private material in package source: ' + name)
            yield name


def members(ipk):
    """The files in an .ipk: an ar archive holding control.tar.gz and data.tar.gz."""
    data, at, found = ipk.read_bytes(), 8, {}
    if data[:8] != b'!<arch>\n':
        raise SystemExit('Not an ar archive: ' + str(ipk))
    while at + 60 <= len(data):
        name, size = data[at:at + 16].decode().strip().rstrip('/'), int(data[at + 48:at + 58].decode())
        found[name] = data[at + 60:at + 60 + size]
        at += 60 + size + size % 2
    return found


def main():
    info = json.loads((APP / 'appinfo.json').read_text())
    service = json.loads((SERVICE / 'services.json').read_text())
    versions = {info['version'], json.loads((ROOT / 'package.json').read_text())['version'],
                json.loads((SERVICE / 'package.json').read_text())['version']}
    if len(versions) != 1:
        raise SystemExit('appinfo.json, package.json and service/package.json versions differ.')
    if service['id'] != info['id'] + '.service':
        raise SystemExit('The service ID must be the app ID followed by .service.')
    names = list(sources())
    cli = ROOT / 'node_modules/.bin/ares-package'
    if not cli.exists():
        raise SystemExit("Run npm ci first: LG's ares-package is a development dependency.")
    DIST.mkdir(exist_ok=True)
    output = DIST / (info['id'] + '_' + info['version'] + '_all.ipk')
    output.unlink(missing_ok=True)
    result = subprocess.run([str(cli), '--no-minify', '-o', str(DIST), str(APP), str(SERVICE)],
                            cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0 or not output.is_file():
        raise SystemExit('ares-package failed:\n' + result.stdout + result.stderr)
    parts = members(output)
    with tarfile.open(fileobj=io.BytesIO(parts['data.tar.gz'])) as data:
        packaged = {m.name.lstrip('./') for m in data.getmembers() if m.isfile()}
    base = 'usr/palm/applications/' + info['id'] + '/'
    missing = [n for n in REQUIRED if base + n not in packaged]
    missing += [n for n in ['service.js', 'services.json', 'package.json'] if 'usr/palm/services/' + service['id'] + '/' + n not in packaged]
    if missing:
        raise SystemExit('Package is missing: ' + ', '.join(missing))
    if len(packaged) != len(names) + 1:  # + the generated packageinfo.json
        raise SystemExit('Package has %d files; expected %d.' % (len(packaged), len(names) + 1))
    for name in packaged:
        if private_path(name) or 'private-fonts/' in name:
            raise SystemExit('Private material in package: ' + name)
    print('Built ' + str(output.relative_to(ROOT)) + ' (%.1f MB, %d files).' % (output.stat().st_size / 1e6, len(packaged)))
    print('Unsigned, public fonts only. No TV or account was contacted.')


if __name__ == '__main__':
    main()
