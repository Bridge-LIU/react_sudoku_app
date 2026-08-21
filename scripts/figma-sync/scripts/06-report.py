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

    tr_path = run_dir / 'test-results.json'
    test_results = json.loads(tr_path.read_text(encoding='utf-8')) if tr_path.exists() else {}

    diff_path = run_dir / 'diff.json'
    diff_summary = {'added': 0, 'modified': 0, 'removed': 0}
    if diff_path.exists():
        diff = json.loads(diff_path.read_text(encoding='utf-8'))
        if isinstance(diff, list):
            # runner (run.mjs) の nodeDiffs 形式：[{kind: 'added'|'modified'|'removed', ...}]
            for d in diff:
                k = d.get('kind', 'modified')
                if k in diff_summary:
                    diff_summary[k] += 1
        elif isinstance(diff, dict):
            # 旧 07-test.mjs 形式（parity のため）
            diff_summary = {
                'added': len(diff.get('added', [])),
                'modified': len(diff.get('modified', [])),
                'removed': len(diff.get('removed', [])),
            }

    shot_dir = run_dir / 'screenshots'
    screenshots = []
    if shot_dir.exists():
        for i, png in enumerate(sorted(shot_dir.glob('*_after.png'))):
            screenshots.append(('06_スナップショット', f'K{15 + i * 3}', str(png)))

    # design_changes.json（Agent A が Phase 4 完了時に書き出す）
    dc_path = run_dir / 'design_changes.json'
    design_changes = []
    if dc_path.exists():
        design_changes = json.loads(dc_path.read_text(encoding='utf-8')) or []
        # PNG の相対パス→絶対パス化（run_dir 起点）
        for dc in design_changes:
            for k in ('before_png', 'after_png', 'diff_png'):
                v = dc.get(k)
                if v and not Path(v).is_absolute():
                    dc[k] = str(run_dir / v)

    ctx = ExcelFillContext(
        template_path=str(template),
        output_path=str(run_dir / 'report.xlsx'),
        run_ts=run_dir.name.replace('_', ' '),
        test_results=test_results,
        screenshots=screenshots,
        diff_summary=diff_summary,
        design_changes=design_changes,
    )
    fill_report(ctx)
    print(f'Generated {ctx.output_path}')


if __name__ == '__main__':
    main()
