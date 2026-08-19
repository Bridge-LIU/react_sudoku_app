#!/usr/bin/env python
"""Usage: python 06-report.py <run-dir>"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.lib.excel_fill import fill_report, ExcelFillContext


def main():
    if len(sys.argv) < 2:
        print('Usage: 06-report.py <run-dir>', file=sys.stderr)
        sys.exit(1)
    run_dir = Path(sys.argv[1])
    root = Path(__file__).parent.parent
    template = root / 'templates' / 'sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx'

    test_results = json.loads((run_dir / 'test-results.json').read_text(encoding='utf-8'))
    diff = json.loads((run_dir / 'diff.json').read_text(encoding='utf-8'))
    diff_summary = {
        'added': len(diff['added']),
        'modified': len(diff['modified']),
        'removed': len(diff['removed']),
    }

    shot_dir = run_dir / 'screenshots'
    screenshots = []
    if shot_dir.exists():
        for i, png in enumerate(sorted(shot_dir.glob('*_after.png'))):
            screenshots.append(('06_スナップショット', f'K{15 + i * 3}', str(png)))

    ctx = ExcelFillContext(
        template_path=str(template),
        output_path=str(run_dir / 'report.xlsx'),
        run_ts=run_dir.name.replace('_', ' '),
        test_results=test_results,
        screenshots=screenshots,
        diff_summary=diff_summary,
    )
    fill_report(ctx)
    print(f'Generated {ctx.output_path}')


if __name__ == '__main__':
    main()
