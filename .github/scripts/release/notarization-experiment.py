"""Disposable macOS timing experiment: stdlib only, no product publishing.

Retains existing signed nested code, re-signs outer bundles. This is NOT a
from-source build measurement, nor a cold Apple service cache measurement.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import shutil
import subprocess
import sys
import time

ROOT = Path('.tmp/notarization-experiment').resolve()
REPORTS = ROOT / 'reports'
APP = ROOT / 'sample' / 'Open Design.app'
TAG = 'open-design-v0.22.0'
ASSET = 'open-design-0.22.0-mac-arm64.dmg'


def run(*args, timeout=600, check=True):
    # Do not log argv, which may contain credentials.
    try:
        result = subprocess.run([str(arg) for arg in args], capture_output=True,
                                text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        # TimeoutExpired includes argv; never expose that credential-bearing repr.
        raise RuntimeError(f'{args[0]} exceeded {timeout}s; do not retry a submission blindly') from None
    if check and result.returncode:
        detail = result.stdout + result.stderr
        for key, value in os.environ.items():
            if key.startswith('APPLE_') and value:
                detail = detail.replace(value, '[REDACTED]')
        raise RuntimeError(f'{args[0]} exited {result.returncode}: {detail}')
    return result


def write(name, value):
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / name).write_text(json.dumps(value, indent=2) + '\n')


def prepare(variant):
    ROOT.mkdir(parents=True, exist_ok=False)
    run('gh', 'release', 'download', TAG, '--repo', 'nexu-io/open-design',
        '--pattern', ASSET, '--pattern', ASSET + '.sha256', '--dir', ROOT)
    with (ROOT / ASSET).open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    assert digest == (ROOT / (ASSET + '.sha256')).read_text().split()[0]
    mount = ROOT / 'mount'
    run('hdiutil', 'attach', ROOT / ASSET, '-readonly', '-nobrowse', '-mountpoint', mount)
    try:
        apps = list(mount.glob('*.app'))
        assert len(apps) == 1
        APP.parent.mkdir()
        run('ditto', apps[0], APP)
    finally:
        run('hdiutil', 'detach', mount)
    run('codesign', '--verify', '--deep', '--strict', APP)
    plist_path = APP / 'Contents/Info.plist'
    info = plistlib.loads(plist_path.read_bytes())
    source_version = info.get('CFBundleShortVersionString')
    info['ODNotarizationExperiment'] = os.environ['GITHUB_RUN_ID'] + '-' + variant
    if variant == 'minimal':
        resources = APP / 'Contents/Resources'
        # Exact disposable copy only; original release/worktrees untouched.
        shutil.rmtree(resources)
        entry = resources / 'app'
        entry.mkdir(parents=True)
        (entry / 'package.json').write_text(json.dumps({
            'name': 'notarization-timing-minimal', 'version': '1.0.0', 'main': 'main.js'}))
        # Generated runtime fixture: no dependencies, network, updater or focus.
        (entry / 'main.js').write_text('''const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL('data:text/html,<title>Capsule bootstrap</title><h1>Ready</h1>');
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  if (text.trim() !== 'Ready') throw new Error('renderer did not start');
  console.log('NOTARY_SMOKE_OK ' + JSON.stringify(process.versions));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
''')
        info.pop('ElectronAsarIntegrity', None)
        info.pop('CFBundleIconFile', None)
    plist_path.write_bytes(plistlib.dumps(info))
    framework = APP / 'Contents/Frameworks/Electron Framework.framework/Resources/Info.plist'
    electron = plistlib.loads(framework.read_bytes()).get('CFBundleVersion')
    write('source.json', {'release': TAG, 'asset': ASSET, 'sha256': digest,
                         'version': source_version, 'electron': electron,
                         'variant': variant, 'runner': run('sw_vers').stdout,
                         'arch': run('uname', '-m').stdout.strip()})


def measure(variant):
    required = ['APPLE_SIGNING_CERTIFICATE_BASE64', 'APPLE_SIGNING_CERTIFICATE_PASSWORD',
                'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError('Missing CI secrets: ' + ', '.join(missing))
    keychain = ROOT / 'experiment.keychain-db'
    cert = ROOT / 'certificate.p12'
    cert.write_bytes(base64.b64decode(os.environ[required[0]]))
    cert.chmod(0o600)
    password = secrets.token_hex(24)
    result = {'variant': variant, 'seconds': {}, 'submissionId': None}

    def timed(label, *args, **kwargs):
        start = time.monotonic()
        try:
            return run(*args, **kwargs)
        finally:
            result['seconds'][label] = round(time.monotonic() - start, 3)
            write('timing.json', result)
            print(label, result['seconds'][label], 'seconds', flush=True)

    try:
        run('security', 'create-keychain', '-p', password, keychain)
        run('security', 'set-keychain-settings', '-lut', '21600', keychain)
        run('security', 'unlock-keychain', '-p', password, keychain)
        # codesign's identity/private-key lookup also consults the user search list.
        run('security', 'list-keychains', '-d', 'user', '-s', keychain,
            Path.home() / 'Library/Keychains/login.keychain-db')
        run('security', 'import', cert, '-k', keychain, '-P', os.environ[required[1]],
            '-T', '/usr/bin/codesign', '-T', '/usr/bin/security')
        run('security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:',
            '-s', '-k', password, keychain)
        identities = run('security', 'find-identity', '-v', '-p', 'codesigning', keychain).stdout
        matches = re.findall(r'([A-F0-9]{40}) "Developer ID Application:[^"]+"', identities)
        assert len(matches) == 1, 'Expected one Developer ID Application identity'
        entitlements = ROOT / 'entitlements.plist'
        entitlements.write_bytes(plistlib.dumps({
            'com.apple.security.cs.allow-jit': True,
            'com.apple.security.cs.allow-unsigned-executable-memory': True,
            'com.apple.security.cs.disable-library-validation': True}))
        timed('outerSign', 'codesign', '--force', '--sign', matches[0], '--keychain',
              keychain, '--options', 'runtime', '--timestamp', '--entitlements', entitlements, APP)
        timed('signatureVerify', 'codesign', '--verify', '--deep', '--strict', APP)
        if variant == 'minimal':
            info = plistlib.loads((APP / 'Contents/Info.plist').read_bytes())
            smoke = timed('headlessSmoke', APP / 'Contents/MacOS' / info['CFBundleExecutable'],
                          '--user-data-dir=' + str(ROOT / 'user-data'), timeout=45)
            assert 'NOTARY_SMOKE_OK' in smoke.stdout, smoke.stdout + smoke.stderr
            (REPORTS / 'smoke.txt').write_text(smoke.stdout + smoke.stderr)
        files = [p for p in APP.rglob('*') if p.is_file() and not p.is_symlink()]
        result['files'] = len(files)
        result['appBytes'] = sum(p.stat().st_size for p in files)
        archive = ROOT / 'submission.zip'
        timed('zip', 'ditto', '-c', '-k', '--keepParent', APP, archive)
        result['uploadBytes'] = archive.stat().st_size
        auth = ['--apple-id', os.environ['APPLE_ID'], '--password',
                os.environ['APPLE_APP_SPECIFIC_PASSWORD'], '--team-id', os.environ['APPLE_TEAM_ID']]
        # Submit exactly once; waiting excludes client upload/submit time.
        submitted = timed('uploadSubmit', 'xcrun', 'notarytool', 'submit', archive,
                          *auth, '--output-format', 'json', timeout=900)
        submission = json.loads(submitted.stdout)
        write('submit.json', submission)
        result['submissionId'] = submission['id']
        write('timing.json', result)
        waited = timed('appleWait', 'xcrun', 'notarytool', 'wait', submission['id'],
                       *auth, '--output-format', 'json', '--timeout', '35m',
                       timeout=2160, check=False)
        (REPORTS / 'wait.json').write_text(waited.stdout)
        info = json.loads(run('xcrun', 'notarytool', 'info', submission['id'],
                              *auth, '--output-format', 'json').stdout)
        write('notary-info.json', info)
        result['status'] = info['status']
        if info['status'] in ('Accepted', 'Invalid', 'Rejected'):
            log = run('xcrun', 'notarytool', 'log', submission['id'], *auth)
            (REPORTS / 'notary-log.json').write_text(log.stdout)
        assert info['status'] == 'Accepted', 'Not accepted; inspect saved ID, do not resubmit'
        timed('staple', 'xcrun', 'stapler', 'staple', APP)
        timed('stapleValidate', 'xcrun', 'stapler', 'validate', APP)
        timed('gatekeeper', 'spctl', '--assess', '--type', 'execute', '--verbose=2', APP)
        timed('dmg', 'hdiutil', 'create', '-srcfolder', APP, '-volname',
              'Notarization experiment', '-format', 'UDZO', ROOT / 'sample.dmg')
        result['dmgBytes'] = (ROOT / 'sample.dmg').stat().st_size
    finally:
        write('timing.json', result)
        cert.unlink(missing_ok=True)
        if keychain.exists():
            run('security', 'delete-keychain', keychain, check=False)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    operation, variant = sys.argv[1:]
    assert variant in ('full', 'minimal')
    assert operation in ('prepare', 'measure')
    {'prepare': prepare, 'measure': measure}[operation](variant)
