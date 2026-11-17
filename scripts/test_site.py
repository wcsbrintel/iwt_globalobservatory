"""Run maintained frontend integration tests against the published code.

The archived Sites globe VM harness in tests/legacy-observatory/check-globe.cjs
expects an obsolete ObservatoryGlobe API (create/individual); it is retained
for historical reference, not used to certify the modern MapLibre UI.
"""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='observatory-maplibre-') as tmp:
    work = Path(tmp)
    (work/'dist').symlink_to(ROOT/'web/observatory', target_is_directory=True)
    (work/'scripts').symlink_to(ROOT/'tests/legacy-observatory', target_is_directory=True)
    subprocess.run(['node', str(work/'scripts/check-maplibre.cjs')],
                   cwd=work, check=True, timeout=180)

modern = [
    ROOT/'tests/clean-map-country-chart.test.cjs',
    ROOT/'tests/clean-map-story-cards.test.cjs',
    ROOT/'tests/exact-location-groups.test.cjs',
    ROOT/'tests/globe-rotation.test.cjs',
    ROOT/'web/observatory/tests/temporal-activity.test.cjs'
]
for test in modern:
    assert test.is_file(), f'Missing current frontend test: {test}'
subprocess.run(['node','--test',*map(str,modern)], cwd=ROOT,check=True,timeout=240)
