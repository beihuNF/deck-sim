#!/usr/bin/env python3
"""Reapply frozen v0.98.3 resources after extraction, for existing saves and retired models.

Run after extract.py, spine_index.py and scenes.py. Never replace a current beta asset or localization key.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'assets'
ARCHIVE = ROOT / 'legacy-v0.98.3'


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')


def main():
    legacy = read(ARCHIVE / 'index.json')
    for rel in legacy['files']:
        dest = ROOT / rel
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ARCHIVE / 'files' / rel, dest)
    manifest = read(ROOT / 'manifest.json')
    present = {t['src'] for t in manifest['textures']}
    manifest['textures'].extend(t for t in legacy['textures'] if t['src'] not in present)
    manifest['legacyAtlases'] = legacy['atlases']
    write(ROOT / 'manifest.json', manifest)
    for rel, extra in legacy['i18n'].items():
        dest = ROOT / rel
        current = read(dest) if dest.exists() else {}
        write(dest, extra | current)
    spine = read(ROOT / 'spine-index.json')
    for key, value in legacy['spine'].items():
        if key == 'encounters':
            spine[key] = value | spine[key]
        elif key not in spine:
            spine[key] = value
    write(ROOT / 'spine-index.json', spine)
    scenes = read(ROOT / 'scenes/index.json')
    write(ROOT / 'scenes/index.json', sorted(set(scenes) | set(legacy['scenes'])))
    audio = read(ROOT / 'audio/index.json')
    audio['files'] = sorted(set(audio['files']) | set(legacy['audio']['files']))
    audio['aliases'] = legacy['audio']['aliases'] | audio['aliases']
    write(ROOT / 'audio/index.json', audio)
    events = read(ROOT / 'audio/events.json')
    for key, extra in legacy['audioEvents'].items():
        events[key] = extra | events[key]
    write(ROOT / 'audio/events.json', events)
    print(f"Retained {len(legacy['files'])} legacy resource files and {sum(len(v) for v in legacy['i18n'].values())} localization keys")


if __name__ == '__main__':
    main()
