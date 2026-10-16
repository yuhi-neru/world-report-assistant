"""Collect dependency license texts without touching any user workspace data."""
from pathlib import Path
import json
import tomllib

root = Path(__file__).resolve().parents[1]
sections = []
def add(name, version, license_name, folder):
    candidates = [p for p in folder.iterdir() if p.is_file() and p.name.upper().startswith(('LICENSE','LICENCE','COPYING','NOTICE','COPYRIGHT'))]
    blocks = []
    for p in sorted(candidates):
        if p.stat().st_size < 800_000:
            blocks.append(f'--- {p.name} ---\n{p.read_text(encoding="utf-8",errors="replace")}')
    sections.append(f'\n{"="*75}\n{name} {version}\nDeclared license: {license_name}\n\n'+'\n\n'.join(blocks))

lock=json.loads((root/'package-lock.json').read_text(encoding='utf-8'))
for rel,meta in lock['packages'].items():
    folder=root/rel
    if not rel or meta.get('dev') or not (folder/'package.json').exists():
        continue
    pkg=json.loads((folder/'package.json').read_text(encoding='utf-8'))
    add('npm '+pkg.get('name',rel),pkg.get('version',''),pkg.get('license','See package source'),folder)

sources=list((Path.home()/'.cargo/registry/src').glob('*'))
cargo=tomllib.loads((root/'src-tauri/Cargo.lock').read_text(encoding='utf-8'))
for pkg in cargo['package']:
    if not pkg.get('source','').startswith('registry+'):
        continue
    folder=next((p/f'{pkg["name"]}-{pkg["version"]}' for p in sources if (p/f'{pkg["name"]}-{pkg["version"]}/Cargo.toml').exists()),None)
    if folder is None:
        continue
    meta=tomllib.loads((folder/'Cargo.toml').read_text(encoding='utf-8'))
    add('Rust '+pkg['name'],pkg['version'],meta.get('package',{}).get('license','See package source'),folder)

(root/'THIRD_PARTY_NOTICES.txt').write_text('World Report Assistant — Third-party notices\n\nDependency license texts bundled with this build. Build-time and platform-specific dependencies may also be listed.\n'+''.join(sections),encoding='utf-8')
print(f'Collected license notices for {len(sections)} dependencies')
