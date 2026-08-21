#!/usr/bin/env python
"""Usage: python 06-report.py <run-dir>

v11 (figma-sync 専用 6 sheet) 対応。run_dir 直下の各 phase 出力 + 現行 state /
config / git log を集約して ExcelFillContext を構築、excel_fill.fill_report で
report.xlsx を出力する。
"""
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.lib.excel_fill import fill_report, ExcelFillContext  # noqa: E402


def _load_json(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'[06-report] WARN failed to parse {path}: {e}', file=sys.stderr)
            return default
    return default


def _load_text(path: Path, default=''):
    if path.exists():
        try:
            return path.read_text(encoding='utf-8').strip()
        except Exception:
            return default
    return default


def _derive_diff_summary(diff_data):
    """diff.json (nodeDiff[] list or {added,modified,removed} dict) を集約"""
    if isinstance(diff_data, list):
        return {
            'nodeDiffCount': len(diff_data),
            'kinds': {},
            'warnings': [],
        }
    if isinstance(diff_data, dict):
        return {
            'nodeDiffCount': (
                len(diff_data.get('added', [])) +
                len(diff_data.get('modified', [])) +
                len(diff_data.get('removed', []))
            ),
            'warnings': diff_data.get('warnings', []),
        }
    return {'nodeDiffCount': 0, 'warnings': []}


def _derive_phase_results(run_dir: Path, status: str, apply_result: dict, diff_data):
    """run_dir 内の各 .json / .log ファイル存在から phase 別 status を derive"""
    ph = {}
    # Phase 1-a: head.json は入力側、run_dir には存在しないので status で近似
    if status in ('NO_CHANGE', 'NO_CHANGE_VIA_FALLBACK'):
        ph['phase_1a'] = 'NO_CHANGE'
    elif status == 'FIGMA_EMPTY':
        ph['phase_1a'] = 'FIGMA_EMPTY'
    else:
        ph['phase_1a'] = 'CHANGED'

    diff_path = run_dir / 'diff.json'
    if diff_path.exists():
        if isinstance(diff_data, list):
            ph['phase_1b'] = f'{len(diff_data)} NodeDiff'
        else:
            ph['phase_1b'] = 'DIFF (dict)'
    else:
        ph['phase_1b'] = 'SKIP'

    if (run_dir / 'fallback.log').exists():
        fb = _load_json(run_dir / 'fallback.log', {})
        ph['phase_1b_fallback'] = f'{fb.get("fallbackStatus", "?")} (fallback)'
    else:
        ph['phase_1b_fallback'] = 'SKIP'

    ph['phase_1c'] = 'DONE' if (run_dir / 'detail.json').exists() else 'SKIP'

    if apply_result:
        cf = len(apply_result.get('changedFiles', []))
        er = len(apply_result.get('errors', []))
        ph['phase_3'] = f'{cf} files apply, {er} errors'
    else:
        ph['phase_3'] = 'SKIP'

    shot_dir = run_dir / 'screenshots'
    if shot_dir.exists():
        pngs = list(shot_dir.glob('*.png'))
        ph['phase_4'] = f'{len(pngs)} PNG'
    else:
        ph['phase_4'] = 'SKIP'

    tr_path = run_dir / 'test-results.json'
    if tr_path.exists():
        tr = _load_json(tr_path, {})
        unit_ok = (tr.get('unit') or {}).get('exitCode') == 0
        e2e_ok = (tr.get('e2e') or {}).get('exitCode') == 0
        ph['phase_5'] = f'unit={"PASS" if unit_ok else "FAIL"} e2e={"PASS" if e2e_ok else "FAIL"}'
    else:
        ph['phase_5'] = 'SKIP'

    ph['phase_7'] = status if status in ('APPROVED', 'REJECTED') else 'PENDING'
    ph['phase_8'] = 'COMMITTED' if status == 'APPROVED' else 'SKIP'
    ph['phase_9'] = 'STATE_UPDATED' if status in ('APPROVED', 'INITIAL_BASELINE', 'NO_CHANGE', 'NO_CHANGE_VIA_FALLBACK') else 'SKIP'

    return ph


def _get_git_info(react_app_root: Path):
    """直近 commit の sha / msg / changed_files を取得（失敗しても空 dict）"""
    try:
        p = subprocess.run(
            ['git', 'log', '-1', '--pretty=%H%n%s'],
            capture_output=True, cwd=str(react_app_root), timeout=10
        )
        if p.returncode != 0:
            return {}
        # Windows で日本語 commit msg が cp932 で読めない事故を避けるため utf-8 replace で decode
        stdout_txt = (p.stdout or b'').decode('utf-8', errors='replace')
        lines = stdout_txt.strip().split('\n')
        sha = lines[0] if len(lines) > 0 else ''
        msg = lines[1] if len(lines) > 1 else ''
        cf_p = subprocess.run(
            ['git', 'show', '--name-only', '--pretty=', sha],
            capture_output=True, cwd=str(react_app_root), timeout=10
        )
        cf_txt = (cf_p.stdout or b'').decode('utf-8', errors='replace') if cf_p.returncode == 0 else ''
        changed = [ln for ln in cf_txt.strip().split('\n') if ln]
        return {
            'commit_sha': sha,
            'commit_msg': msg,
            'changed_files': changed,
            'pr_url': None,
        }
    except Exception as e:
        print(f'[06-report] WARN git info fetch failed: {e}', file=sys.stderr)
        return {}


def main():
    if len(sys.argv) < 2:
        print('Usage: 06-report.py <run-dir>', file=sys.stderr)
        sys.exit(1)
    run_dir = Path(sys.argv[1])
    root = Path(__file__).parent.parent
    template = root / 'templates' / 'sudoku_figma-sync実施報告書_2026-08-21_v11.xlsx'

    if not template.exists():
        print(f'[06-report] ❌ Template not found: {template}', file=sys.stderr)
        sys.exit(1)

    # ── inputs ──
    config = _load_json(root / 'config.json', {})
    react_app_root = Path(config.get('reactAppRoot', '')) if config.get('reactAppRoot') else root.parent.parent
    # config.reactAppRoot は relative name の場合あるので、絶対を作る
    if not react_app_root.is_absolute():
        react_app_root = root.parent.parent

    state_after = _load_json(root / '.figma-sync-state.json', {})
    # state_before の snapshot は取れないので None（Phase 9 で run_dir に保存する将来拡張向け）
    state_before = None

    apply_result = _load_json(run_dir / 'apply.json', {})
    diff_data = _load_json(run_dir / 'diff.json', [])
    diff_summary = _derive_diff_summary(diff_data)

    test_results = _load_json(run_dir / 'test-results.json', {})
    status = _load_text(run_dir / 'status.txt', 'UNKNOWN')

    dc_data = _load_json(run_dir / 'design_changes.json', [])
    # PNG 相対パス→絶対パス化
    for dc in dc_data:
        for k in ('before_png', 'after_png', 'diff_png'):
            v = dc.get(k)
            if v and not Path(v).is_absolute():
                dc[k] = str(run_dir / v)

    git_info = _get_git_info(react_app_root)

    phase_results = _derive_phase_results(run_dir, status, apply_result, diff_data)

    # ── Fallback 発動情報 (Phase 1-b-fallback) ──
    # fallback.log があれば fallback 経路発動と判定、内容を ctx に渡す
    fallback_info = _load_json(run_dir / 'fallback.log', {})
    fallback_triggered = bool(fallback_info) and bool(fallback_info.get('fallbackStatus'))

    ctx = ExcelFillContext(
        template_path=str(template),
        output_path=str(run_dir / 'report.xlsx'),
        run_ts=run_dir.name.replace('_', ' '),
        test_results=test_results,
        design_changes=dc_data,
        config=config,
        state_before=state_before,
        state_after=state_after,
        apply_result=apply_result,
        diff_summary=diff_summary,
        git_info=git_info,
        phase_results=phase_results,
        final_status=status,
        fallback_triggered=fallback_triggered,
        fallback_info=fallback_info,
    )
    fill_report(ctx)
    print(f'Generated {ctx.output_path}')


if __name__ == '__main__':
    main()
