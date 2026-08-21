"""v11 (figma-sync 専用 6 sheet) テンプレを実データで埋込む処理。

v10 (12 sheet 汎用テスト報告書) から完全に置き換え。v5 参考テンプレ相当の
6 sheet 構成：
  01_表紙サマリ / 02_視覚エビデンス / 03_state.json差分 /
  04_コード変更 / 05_テストケース / 06_総合結果
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from openpyxl import load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Font, PatternFill


BOLD = Font(bold=True)
WRAP = Alignment(wrap_text=True, vertical='top', horizontal='left')
CENTER = Alignment(horizontal='center', vertical='center')
SECTION_FILL = PatternFill(start_color='FFE7F1FA', end_color='FFE7F1FA', fill_type='solid')
SECTION_FONT = Font(bold=True, size=12)


@dataclass
class ExcelFillContext:
    template_path: str
    output_path: str
    run_ts: str
    # Phase 4-5 outputs
    test_results: dict = field(default_factory=dict)
    design_changes: list = field(default_factory=list)
    # Phase 1-3 outputs
    config: Optional[dict] = None
    state_before: Optional[dict] = None
    state_after: Optional[dict] = None
    apply_result: Optional[dict] = None
    diff_summary: Optional[dict] = None
    git_info: Optional[dict] = None
    phase_results: Optional[dict] = None
    final_status: Optional[str] = None


def _log(msg: str) -> None:
    # Windows cp932 console で日本語 sheet 名が UnicodeEncodeError にならないよう
    # bytes に落として直接書き込む（errors='replace' で安全に）
    try:
        sys.stderr.write(msg + '\n')
        sys.stderr.flush()
    except UnicodeEncodeError:
        buf = getattr(sys.stderr, 'buffer', None)
        if buf is not None:
            buf.write((msg + '\n').encode('utf-8', errors='replace'))
            buf.flush()


def fill_report(ctx: ExcelFillContext) -> None:
    wb = load_workbook(ctx.template_path)

    steps = [
        ('01_表紙サマリ', _fill_01_cover),
        ('02_視覚エビデンス', _fill_02_visual),
        ('03_state.json差分', _fill_03_state_diff),
        ('04_コード変更', _fill_04_code_changes),
        ('05_テストケース', _fill_05_test_cases),
        ('06_総合結果', _fill_06_summary),
    ]
    total = len(steps)
    for idx, (sheet_name, fn) in enumerate(steps, start=1):
        _log(f'[Excel] Sheet {idx}/{total} {sheet_name} 生成中...')
        if sheet_name in wb.sheetnames:
            fn(wb[sheet_name], ctx)
        _log(f'[Excel] Sheet {idx}/{total} {sheet_name} 完了')

    wb.save(ctx.output_path)


# ── Sheet 01: 表紙サマリ ──
def _fill_01_cover(ws, ctx: ExcelFillContext) -> None:
    cfg = ctx.config or {}
    git = ctx.git_info or {}
    apply_res = ctx.apply_result or {}

    changed_files = apply_res.get('changedFiles') or git.get('changed_files') or []
    commit_sha = (git.get('commit_sha') or '')[:8]
    commit_msg = git.get('commit_msg', '')

    info_map = {
        4: ('プロジェクト名', 'react_sudoku_app'),
        5: ('Figma ファイル ID', cfg.get('figmaFileKey', '')),
        6: ('Figma ファイル URL', cfg.get('figmaFileUrl', '')),
        7: ('実施日 / run ts', ctx.run_ts),
        8: ('実施者', 'Claude Code'),
        9: ('final status', ctx.final_status or 'UNKNOWN'),
        10: ('検出方式', _detect_method(ctx)),
        11: ('コミット', f'{commit_sha} — {commit_msg}' if commit_sha else '(なし)'),
        12: ('変更ファイル数', f'{len(changed_files)} files'),
        13: ('成果 PR', git.get('pr_url') or '(未作成)'),
        14: ('SKILL.md version', 'v4 (REST-only、2026-08-21)'),
        15: ('備考', f'run_dir={ctx.run_ts}'),
    }
    for row, (label, val) in info_map.items():
        ws.cell(row, 1).value = label
        ws.cell(row, 1).font = BOLD
        ws.cell(row, 4).value = str(val) if val is not None else ''

    # 【テスト実施サマリ】 行 19-25
    tr = ctx.test_results or {}
    unit = tr.get('unit') or {}
    e2e = tr.get('e2e') or {}
    audit = tr.get('audit') or {}
    coverage = tr.get('coverage') or {}

    unit_pass = 'PASS' if unit.get('exitCode') == 0 else ('FAIL' if unit else 'SKIP')
    e2e_pass = 'PASS' if e2e.get('exitCode') == 0 else ('FAIL' if e2e else 'SKIP')
    audit_total = (
        (audit.get('json') or {}).get('metadata', {}).get('vulnerabilities', {}).get('total', 0)
        if audit else 0
    )
    cov_line = (coverage.get('total') or {}).get('lines', {}).get('pct', '-') if coverage else '-'

    ph = ctx.phase_results or {}
    phase_rows = [
        (1, 'Phase 1-a 検出 (detect)', 1, 'figma_get_file_versions', '', '', ph.get('phase_1a', 'N/A')),
        (2, 'Phase 1-b diff', 1, 'figma_diff_versions', '', '', ph.get('phase_1b', 'N/A')),
        (3, 'Phase 1-b-fallback', 1, 'figma_get_file_at_version', '', '', ph.get('phase_1b_fallback', 'N/A')),
        (4, 'Phase 3 apply', 1, 'get_design_context + 05-apply', '', '', ph.get('phase_3', 'N/A')),
        (5, 'Phase 4 screenshot', 1, 'Playwright + pixelmatch', '', '', ph.get('phase_4', 'N/A')),
        (6, 'Phase 5 tests', 1, f'unit={unit_pass} e2e={e2e_pass} cov={cov_line}%', '', '', unit_pass),
        (7, 'Phase 6 report', 1, 'openpyxl v11', '', '', 'PASS'),
    ]
    for i, row_data in enumerate(phase_rows):
        r = 19 + i
        for col, val in enumerate(row_data, start=1):
            ws.cell(r, col).value = val
            ws.cell(r, col).alignment = WRAP

    ws.cell(26, 1).value = '合計'
    ws.cell(26, 1).font = BOLD
    ws.cell(26, 3).value = f'{len(phase_rows)} phase'
    ws.cell(26, 7).value = ctx.final_status or 'UNKNOWN'

    # 【Figma 検出変更 概要】行 30-35
    dc = ctx.design_changes or []
    for i, c in enumerate(dc[:6]):
        r = 30 + i
        ws.cell(r, 1).value = i + 1
        ws.cell(r, 2).value = c.get('component', '')
        ws.cell(r, 3).value = c.get('node_id', '')
        ws.cell(r, 4).value = c.get('file', '')
        kinds = [ch.get('change_kind') or ch.get('kind', '') for ch in c.get('changes', [])]
        ws.cell(r, 5).value = ', '.join(set(k for k in kinds if k))
        ws.cell(r, 6).value = f"{c.get('diff_pixels', '?')} px" if c.get('diff_pixels') is not None else '-'

    ws.cell(36, 1).value = f'KEY DISCOVERY: final_status={ctx.final_status or "UNKNOWN"}、変更 {len(dc)} 件検出'
    ws.cell(36, 1).font = BOLD


def _detect_method(ctx: ExcelFillContext) -> str:
    ph = ctx.phase_results or {}
    if 'fallback' in str(ph.get('phase_1b_fallback', '')).lower() and 'CHANGED' in str(ph.get('phase_1b_fallback', '')):
        return 'figma_get_file_at_version fallback'
    return 'figma_diff_versions'


# ── Sheet 02: 視覚エビデンス ──
def _fill_02_visual(ws, ctx: ExcelFillContext) -> None:
    dc = ctx.design_changes or []
    if not dc:
        ws.cell(6, 1).value = '(視覚差分なし — screenshot 未収集 or design_changes 空)'
        return

    row = 6
    for idx, c in enumerate(dc, start=1):
        ws.cell(row, 1).value = f'変更 #{idx}  {c.get("component", "")} ({c.get("node_id", "")})'
        ws.cell(row, 1).font = BOLD
        ws.cell(row, 1).fill = SECTION_FILL
        row += 1
        # 画像埋込 (B / D 列)
        for col_letter, key in [('B', 'before_png'), ('D', 'after_png')]:
            png = c.get(key)
            cell_addr = f'{col_letter}{row}'
            if png and Path(png).exists():
                try:
                    img = XLImage(png)
                    img.width, img.height = 320, 200
                    ws.add_image(img, cell_addr)
                except Exception:
                    ws[cell_addr] = '(画像埋込失敗)'
            else:
                ws[cell_addr] = '(画像なし)'
        ws.row_dimensions[row].height = 155
        row += 1
        # 説明
        ws.cell(row, 1).value = f'概要: file={c.get("file", "")}, diff_pixels={c.get("diff_pixels", "?")}'
        ws.cell(row, 1).alignment = WRAP
        row += 2


# ── Sheet 03: state.json差分 ──
def _fill_03_state_diff(ws, ctx: ExcelFillContext) -> None:
    before = ctx.state_before or {}
    after = ctx.state_after or {}

    def _cmp(k):
        b = before.get(k, '(なし)')
        a = after.get(k, '(なし)')
        chg = '変化' if b != a else '不変'
        return b, a, chg

    # バージョン (行 6-8)
    version_fields = [
        ('last_version_id', 'Figma バージョン'),
        ('last_run_at', '最終実行時刻'),
        ('last_fallback_at', '最終 fallback 時刻'),
    ]
    for i, (fld, desc) in enumerate(version_fields, start=1):
        r = 5 + i
        b, a, chg = _cmp(fld)
        ws.cell(r, 1).value = i
        ws.cell(r, 2).value = fld
        ws.cell(r, 3).value = str(b)
        ws.cell(r, 4).value = str(a)
        ws.cell(r, 5).value = chg
        ws.cell(r, 6).value = desc

    # perFrameHash (行 11-13) — 現行 state に perFrameHash 未搭載 → N/A
    cfg = ctx.config or {}
    frames = cfg.get('frames', [])
    for i, fr in enumerate(frames[:3], start=1):
        r = 10 + i
        ws.cell(r, 1).value = i
        ws.cell(r, 2).value = f'{fr.get("nodeId", "")}  ({fr.get("component", "")})'
        ws.cell(r, 3).value = '(state v4 未搭載)'
        ws.cell(r, 4).value = '(state v4 未搭載)'
        ws.cell(r, 5).value = 'N/A'
        ws.cell(r, 6).value = 'v4 では nodeDiff で判定'

    # メタ情報 (行 17-)
    diff_sum = ctx.diff_summary or {}
    meta_rows = [
        ('nodeDiff.length', diff_sum.get('nodeDiffCount', 0)),
        ('warnings.length', len(diff_sum.get('warnings', []))),
        ('fallback_count_last_7days', after.get('fallback_count_last_7days', 0)),
        ('changedFiles', len((ctx.apply_result or {}).get('changedFiles', []))),
    ]
    for i, (fld, val) in enumerate(meta_rows, start=1):
        r = 16 + i
        b_val = before.get(fld, '(N/A)') if fld in before else '(N/A)'
        ws.cell(r, 1).value = i
        ws.cell(r, 2).value = fld
        ws.cell(r, 3).value = str(b_val)
        ws.cell(r, 4).value = str(val)
        ws.cell(r, 5).value = '変化' if str(b_val) != str(val) else '不変'
        ws.cell(r, 6).value = 'Phase 1-b 出力'

    # snapshot 変化 (行 28-30)
    ws.cell(28, 1).value = 1
    ws.cell(28, 2).value = 'snapshot 更新'
    ws.cell(28, 3).value = '(前回)'
    ws.cell(28, 4).value = '(fallback 経由で更新)' if 'fallback' in _detect_method(ctx) else '(未更新)'
    ws.cell(28, 5).value = '変化' if 'fallback' in _detect_method(ctx) else '不変'
    ws.cell(28, 6).value = 'snapshots/last-full.json'


# ── Sheet 04: コード変更 ──
def _fill_04_code_changes(ws, ctx: ExcelFillContext) -> None:
    git = ctx.git_info or {}
    apply_res = ctx.apply_result or {}
    diff_sum = ctx.diff_summary or {}
    changed_files = apply_res.get('changedFiles') or git.get('changed_files') or []
    sha = (git.get('commit_sha') or '')[:8] or '(uncommitted)'
    commit_msg = git.get('commit_msg') or ''

    # コミット / 適用ファイル (行 5-)
    for i, f in enumerate(changed_files[:4], start=1):
        r = 4 + i
        ws.cell(r, 1).value = i
        ws.cell(r, 2).value = sha
        ws.cell(r, 3).value = f
        ws.cell(r, 4).value = '値変更'
        ws.cell(r, 5).value = commit_msg[:80] or '(msg なし)'
        ws.cell(r, 6).value = 'Figma nodeDiff 経由'
        ws.cell(r, 7).value = 'PASS' if not apply_res.get('errors') else 'FAIL'

    # warnings (drift 相当) 行 11-14
    warnings = diff_sum.get('warnings', []) or []
    if not warnings:
        ws.cell(11, 1).value = 1
        ws.cell(11, 2).value = '(warnings なし)'
        ws.cell(11, 7).value = 'N/A'
    else:
        for i, w in enumerate(warnings[:4], start=1):
            r = 10 + i
            ws.cell(r, 1).value = i
            ws.cell(r, 2).value = 'diff warning'
            ws.cell(r, 3).value = str(w)[:120]
            ws.cell(r, 7).value = 'flag'

    ws.cell(15, 1).value = '合計'
    ws.cell(15, 1).font = BOLD
    ws.cell(15, 5).value = f'{len(changed_files)} files apply / {len(warnings)} warnings'


# ── Sheet 05: テストケース ──
def _fill_05_test_cases(ws, ctx: ExcelFillContext) -> None:
    ph = ctx.phase_results or {}
    ts = ctx.run_ts.split(' ')[0] if ' ' in ctx.run_ts else ctx.run_ts[:10]

    tc_defs = [
        ('TC001', 'Phase 1-a', 'detect (figma_get_file_versions)',
         'NO_CHANGE / CHANGED / NO_STATE 判定',
         ph.get('phase_1a', 'N/A'),
         'Phase 1-a 出力'),
        ('TC002', 'Phase 1-b', 'diff (figma_diff_versions)',
         'nodeDiffs 生成',
         ph.get('phase_1b', 'N/A'),
         'diff.json 生成'),
        ('TC003', 'Phase 1-b-fallback', 'get_file_at_version 全 tree',
         'INITIAL / CHANGED / NO_CHANGE',
         ph.get('phase_1b_fallback', 'N/A'),
         'fallback.log'),
        ('TC004', 'Phase 1-c', 'detail 詳細取得',
         '各 nodeDiff の node 詳細',
         ph.get('phase_1c', 'N/A'),
         'detail.json'),
        ('TC005', 'Phase 3', 'apply コード反映',
         'changedFiles 生成、errors=0',
         ph.get('phase_3', 'N/A'),
         'apply.json'),
        ('TC006', 'Phase 4', 'screenshot + pixelmatch',
         'before/after/diff.png 生成',
         ph.get('phase_4', 'N/A'),
         'screenshots/*.png'),
        ('TC007', 'Phase 5', 'tests (unit + e2e + audit)',
         'exitCode=0',
         ph.get('phase_5', 'N/A'),
         'test-results.json'),
        ('TC008', 'Phase 6', 'Excel 報告書生成',
         'report.xlsx 生成',
         'PASS (本 report 自身)',
         'report.xlsx'),
        ('TC009', 'Phase 7', '人間承認 (y/n)',
         'APPROVED / REJECTED 判定',
         ph.get('phase_7', 'N/A'),
         'status.txt'),
        ('TC010', 'Phase 8', 'git commit',
         'commit 作成',
         ph.get('phase_8', 'N/A'),
         'git log'),
        ('TC011', 'Phase 9', 'state 更新',
         '.figma-sync-state.json 更新',
         ph.get('phase_9', 'N/A'),
         'state file'),
    ]

    ws.cell(4, 2).value = '◆ figma-sync パイプライン全 Phase 実施ログ'
    ws.cell(4, 2).font = SECTION_FONT
    ws.cell(4, 2).fill = SECTION_FILL

    for i, (tc_id, phase, desc, expected, actual, evidence) in enumerate(tc_defs):
        r = 5 + i
        ws.cell(r, 2).value = tc_id
        ws.cell(r, 3).value = phase
        ws.cell(r, 4).value = desc
        ws.cell(r, 5).value = expected
        ws.cell(r, 6).value = f'{actual}'
        ws.cell(r, 7).value = ts
        ws.cell(r, 8).value = 'Claude Code'
        ws.cell(r, 9).value = ts
        ws.cell(r, 10).value = 'Bridge'
        ws.cell(r, 11).value = evidence
        for col in range(2, 12):
            ws.cell(r, col).alignment = WRAP

    # 合計行
    total_row = 5 + len(tc_defs) + 1
    ws.cell(total_row, 1).value = '合計:'
    ws.cell(total_row, 2).value = f'{len(tc_defs)} テストケース (Phase 1-a〜9)'
    ws.cell(total_row, 1).font = BOLD


# ── Sheet 06: 総合結果 ──
def _fill_06_summary(ws, ctx: ExcelFillContext) -> None:
    git = ctx.git_info or {}
    apply_res = ctx.apply_result or {}
    tr = ctx.test_results or {}
    dc = ctx.design_changes or []
    changed_files = apply_res.get('changedFiles') or []

    sha = (git.get('commit_sha') or '')[:8] or '(none)'
    pr_url = git.get('pr_url') or '(未作成)'

    # ◆ PR 確認 (行 5-11)
    pr_rows = [
        ('PR 番号', pr_url, git.get('commit_msg', '')[:80], 'Open' if pr_url != '(未作成)' else 'N/A'),
        ('コミット', sha, git.get('commit_msg', '')[:80], 'PASS' if sha != '(none)' else 'N/A'),
        ('変更ファイル数', f'{len(changed_files)} files', ', '.join(changed_files)[:200], 'PASS' if changed_files else 'N/A'),
        ('final status', ctx.final_status or 'UNKNOWN', 'runs/<ts>/status.txt', ctx.final_status or 'N/A'),
        ('検出方式', _detect_method(ctx), 'Phase 1-b or fallback', 'PASS'),
        ('Workflow run', '(local run)', 'ローカル実行のため N/A', 'N/A'),
        ('SKILL.md version', 'v4', 'REST-only 2026-08-21', 'PASS'),
    ]
    for i, row_data in enumerate(pr_rows):
        r = 5 + i
        for col, val in enumerate(row_data, start=1):
            ws.cell(r, col).value = val
            ws.cell(r, col).alignment = WRAP

    # ◆ 最終判定 (行 14-24)
    unit = tr.get('unit') or {}
    e2e = tr.get('e2e') or {}
    unit_verdict = 'PASS' if unit.get('exitCode') == 0 else ('FAIL' if unit else 'SKIP')
    e2e_verdict = 'PASS' if e2e.get('exitCode') == 0 else ('FAIL' if e2e else 'SKIP')

    ph = ctx.phase_results or {}
    verdict_rows = [
        ('Figma 変更検出', f'{len(dc)} 変更', 'design_changes.json', 'PASS' if dc else 'N/A'),
        ('コード反映 (apply)', f'{len(changed_files)} files', 'apply.json', 'PASS' if changed_files else 'N/A'),
        ('画像差分 (pixelmatch)', f'{sum(c.get("diff_pixels", 0) or 0 for c in dc)} px 合計', 'screenshots/', 'INFO'),
        ('unit test', unit_verdict, '(vitest / jest)', unit_verdict),
        ('e2e test', e2e_verdict, '(playwright)', e2e_verdict),
        ('PR 状態', pr_url, 'gh pr', 'PASS' if pr_url != '(未作成)' else 'N/A'),
        ('KEY DISCOVERY', ctx.final_status or 'UNKNOWN', 'status.txt', 'INFO'),
    ]
    for i, row_data in enumerate(verdict_rows):
        r = 14 + i
        for col, val in enumerate(row_data, start=1):
            ws.cell(r, col).value = val
            ws.cell(r, col).alignment = WRAP

    # ◆ 次回アクション (行 27-)
    status = ctx.final_status or 'UNKNOWN'
    if status == 'REJECTED':
        actions = [
            ('REJECTED の要因調査', 'design_changes.json の diff pixel を確認', 'Bridge'),
            ('state 更新なし', '次回 run で同じ diff が再検出される', 'Claude'),
        ]
    elif status == 'APPROVED':
        actions = [
            ('PR merge 判断', pr_url, 'Bridge'),
            ('main 反映後の動作確認', 'Azure SWA デプロイ後の視覚確認', 'Bridge'),
        ]
    elif status == 'INITIAL_BASELINE':
        actions = [
            ('初回 baseline 完了', 'snapshot/state seed 済み、次回から diff 判定', 'Claude'),
        ]
    else:
        actions = [
            ('status 確認', f'status.txt={status}', 'Bridge'),
        ]
    for i, (item, detail, owner) in enumerate(actions, start=1):
        r = 26 + i
        ws.cell(r, 1).value = i
        ws.cell(r, 2).value = item
        ws.cell(r, 3).value = detail
        ws.cell(r, 4).value = owner
        for col in range(1, 5):
            ws.cell(r, col).alignment = WRAP

    ws.cell(35, 1).value = f'総合判定: {status}'
    ws.cell(35, 1).font = BOLD
    ws.cell(37, 1).value = f'作成: {ctx.run_ts}  Bridge / Claude Code'
    ws.cell(37, 1).font = BOLD
