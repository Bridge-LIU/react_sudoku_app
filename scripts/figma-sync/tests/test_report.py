"""v11 (figma-sync 専用 6 sheet) テスト。

v10 の 12 sheet アサートは全廃。v11 の 6 sheet 存在 + 主要 cell 値を検証。
"""
import sys
from pathlib import Path

import pytest
from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.lib.excel_fill import fill_report, ExcelFillContext  # noqa: E402


TEMPLATE = Path(__file__).parent.parent / 'templates' / 'sudoku_figma-sync実施報告書_2026-08-21_v11.xlsx'

EXPECTED_SHEETS = [
    '01_表紙サマリ',
    '02_視覚エビデンス',
    '03_state.json差分',
    '04_コード変更',
    '05_テストケース',
    '06_総合結果',
]


def _base_ctx(tmp_path, **overrides):
    kwargs = dict(
        template_path=str(TEMPLATE),
        output_path=str(tmp_path / 'report.xlsx'),
        run_ts='2026-08-21T10-00-00-000Z',
        test_results={
            'unit': {'exitCode': 0},
            'e2e': {'exitCode': 0},
            'audit': {'json': {'metadata': {'vulnerabilities': {'total': 0}}}},
            'coverage': {'total': {'lines': {'pct': 92.3}}},
        },
        design_changes=[],
        config={
            'figmaFileKey': 'testKey123',
            'figmaFileUrl': 'https://figma.com/design/testKey123/',
            'frames': [
                {'nodeId': '11:1896', 'file': 'src/app/index.tsx', 'component': 'Home'},
                {'nodeId': '18:6', 'file': 'src/app/play/[difficulty].tsx', 'component': 'Play'},
            ],
        },
        state_before={'last_version_id': 'OLD_ID', 'last_run_at': '2026-08-20T00:00:00Z'},
        state_after={'last_version_id': 'NEW_ID', 'last_run_at': '2026-08-21T10:00:00Z'},
        apply_result={'changedFiles': ['src/app/play/[difficulty].tsx'], 'errors': []},
        diff_summary={'nodeDiffCount': 1, 'warnings': []},
        git_info={
            'commit_sha': 'abcdef1234567890',
            'commit_msg': 'feat(figma-sync): apply nodeDiff',
            'changed_files': ['src/app/play/[difficulty].tsx'],
            'pr_url': None,
        },
        phase_results={
            'phase_1a': 'CHANGED',
            'phase_1b': '1 NodeDiff',
            'phase_1b_fallback': 'SKIP',
            'phase_3': '1 files apply, 0 errors',
            'phase_5': 'unit=PASS e2e=PASS',
            'phase_7': 'APPROVED',
        },
        final_status='APPROVED',
    )
    kwargs.update(overrides)
    return ExcelFillContext(**kwargs)


def test_template_exists_with_6_sheets():
    """v11 template ファイルが正しく 6 sheet 構成"""
    assert TEMPLATE.exists(), f'Template must exist: {TEMPLATE}'
    wb = load_workbook(str(TEMPLATE))
    assert wb.sheetnames == EXPECTED_SHEETS, f'Sheet names mismatch: {wb.sheetnames}'


def test_fill_report_creates_file_with_6_sheets(tmp_path):
    """fill_report 実行後、出力ファイルに 6 sheet が全部存在"""
    ctx = _base_ctx(tmp_path)
    fill_report(ctx)
    assert Path(ctx.output_path).exists()
    wb = load_workbook(str(ctx.output_path))
    for sn in EXPECTED_SHEETS:
        assert sn in wb.sheetnames, f'Sheet missing: {sn}'


def test_sheet_01_cover_populates_config_and_status(tmp_path):
    """01_表紙サマリ に config / status / git commit が入る"""
    ctx = _base_ctx(tmp_path)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['01_表紙サマリ']
    # 行 5 D列 = Figma ファイル ID
    assert str(ws.cell(5, 4).value) == 'testKey123'
    # 行 9 D列 = final status
    assert str(ws.cell(9, 4).value) == 'APPROVED'
    # 行 11 D列 = コミット sha[:8]
    assert 'abcdef12' in str(ws.cell(11, 4).value)
    # 合計行
    assert ws.cell(26, 1).value == '合計'


def test_sheet_03_state_diff_shows_before_after(tmp_path):
    """03_state.json差分 で version_id の前後変化が「変化」として記録"""
    ctx = _base_ctx(tmp_path)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['03_state.json差分']
    # 行 6 = last_version_id row
    assert ws.cell(6, 2).value == 'last_version_id'
    assert ws.cell(6, 3).value == 'OLD_ID'
    assert ws.cell(6, 4).value == 'NEW_ID'
    assert ws.cell(6, 5).value == '変化'


def test_sheet_04_code_changes_reflects_apply(tmp_path):
    """04_コード変更 に apply_result.changedFiles / commit sha が入る"""
    ctx = _base_ctx(tmp_path)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['04_コード変更']
    # 行 5 = 最初の changed file
    assert ws.cell(5, 1).value == 1
    assert 'abcdef12' in str(ws.cell(5, 2).value)
    assert ws.cell(5, 3).value == 'src/app/play/[difficulty].tsx'
    assert ws.cell(5, 7).value == 'PASS'


def test_sheet_05_test_cases_lists_phases(tmp_path):
    """05_テストケース に Phase 1-a〜9 の TC が入る"""
    ctx = _base_ctx(tmp_path)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['05_テストケース']
    # 行 5 = TC001 = Phase 1-a
    assert ws.cell(5, 2).value == 'TC001'
    assert ws.cell(5, 3).value == 'Phase 1-a'
    # 行 15 = TC011 = Phase 9
    assert ws.cell(15, 2).value == 'TC011'
    assert ws.cell(15, 3).value == 'Phase 9'


def test_sheet_06_summary_final_verdict(tmp_path):
    """06_総合結果 に final_status / commit / PR / 判定が入る"""
    ctx = _base_ctx(tmp_path)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['06_総合結果']
    # 総合判定 行 35
    assert 'APPROVED' in str(ws.cell(35, 1).value)
    # 行 5 = PR 番号 row
    assert ws.cell(5, 1).value == 'PR 番号'
    # 行 6 = コミット row
    assert ws.cell(6, 1).value == 'コミット'
    assert 'abcdef12' in str(ws.cell(6, 2).value)


def test_sheet_02_visual_empty_shows_no_data(tmp_path):
    """design_changes 空なら 02_視覚エビデンス に「なし」表示"""
    ctx = _base_ctx(tmp_path, design_changes=[])
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['02_視覚エビデンス']
    assert '(視覚差分なし' in str(ws.cell(6, 1).value)


def test_sheet_02_visual_with_design_changes_no_png(tmp_path):
    """PNG 存在なしでも design_changes データがあれば block が展開"""
    dc = [{
        'component': 'Play',
        'file': 'src/app/play/[difficulty].tsx',
        'node_id': '18:6',
        'changes': [{'property': 'fills[0]', 'kind': 'removed'}],
        'before_png': None,
        'after_png': None,
        'diff_pixels': 3580,
    }]
    ctx = _base_ctx(tmp_path, design_changes=dc)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['02_視覚エビデンス']
    # 変更 #1 header
    assert '変更 #1' in str(ws.cell(6, 1).value)
    assert 'Play' in str(ws.cell(6, 1).value)
    # BEFORE / AFTER cell に「画像なし」
    assert ws['B7'].value == '(画像なし)'
    assert ws['D7'].value == '(画像なし)'


def test_sheet_01_fallback_banner_shows_when_triggered(tmp_path):
    """fallback_triggered=True の run で 01_表紙サマリ A3 に赤字 banner が入る"""
    fi = {
        'ts': '2026-08-21T05-21-14-075Z',
        'reason': 'DIFF_EMPTY',
        'fromVersion': 'V_OLD',
        'headVersionId': 'V_NEW',
        'fallbackStatus': 'CHANGED',
        'nodeDiffCount': 1,
    }
    ctx = _base_ctx(tmp_path, fallback_triggered=True, fallback_info=fi)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['01_表紙サマリ']
    banner = str(ws.cell(3, 1).value or '')
    assert 'FALLBACK' in banner
    assert 'DIFF_EMPTY' in banner
    assert '1' in banner  # nodeDiffCount


def test_sheet_01_fallback_banner_absent_when_not_triggered(tmp_path):
    """通常経路 (fallback_triggered=False) では banner が空"""
    ctx = _base_ctx(tmp_path)  # default fallback_triggered=False
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['01_表紙サマリ']
    assert ws.cell(3, 1).value in (None, '')


def test_sheet_03_fallback_section_populated(tmp_path):
    """fallback 発動時、03_state.json差分 に「◆ Fallback 発動情報」section と詳細"""
    fi = {
        'reason': 'DIFF_EMPTY',
        'fromVersion': 'V_OLD',
        'headVersionId': 'V_NEW',
        'fallbackStatus': 'CHANGED',
        'nodeDiffCount': 3,
    }
    ctx = _base_ctx(tmp_path, fallback_triggered=True, fallback_info=fi)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['03_state.json差分']
    assert 'Fallback' in str(ws.cell(3, 1).value or '')
    # 右側 (H/J 列) に発動理由と node 数
    labels = [str(ws.cell(r, 8).value or '') for r in range(4, 9)]
    values = [str(ws.cell(r, 10).value or '') for r in range(4, 9)]
    assert any('reason' in l for l in labels)
    assert any('DIFF_EMPTY' in v for v in values)
    assert any('3' == v for v in values)  # nodeDiffCount


def test_sheet_04_detection_route_column_added(tmp_path):
    """04_コード変更 の H 列に「検出経路」ヘッダーと fallback 行がある"""
    fi = {'reason': 'DIFF_EMPTY', 'fallbackStatus': 'CHANGED', 'nodeDiffCount': 1}
    ctx = _base_ctx(tmp_path, fallback_triggered=True, fallback_info=fi)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['04_コード変更']
    # 行 4 H 列 = ヘッダー「検出経路」
    assert str(ws.cell(4, 8).value or '') == '検出経路'
    # 行 5 H 列 = fallback ラベル
    assert 'fallback' in str(ws.cell(5, 8).value or '').lower()


def test_sheet_06_fallback_verdict_row(tmp_path):
    """06_総合結果 判定表に「Fallback 経路発動: YES」行がある"""
    fi = {'reason': 'DIFF_EMPTY', 'fallbackStatus': 'CHANGED', 'nodeDiffCount': 2}
    ctx = _base_ctx(tmp_path, fallback_triggered=True, fallback_info=fi)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['06_総合結果']
    # verdict table 行 14〜のどこかに Fallback 経路発動 = YES
    found = False
    for r in range(14, 26):
        label = str(ws.cell(r, 1).value or '')
        if 'Fallback' in label and '発動' in label:
            assert 'YES' in str(ws.cell(r, 2).value or '')
            assert '2' in str(ws.cell(r, 3).value or '')  # nodeDiffCount detail
            found = True
            break
    assert found, 'Fallback 経路発動 row not found in verdict table'


def test_rejected_status_generates_appropriate_actions(tmp_path):
    """REJECTED 状態で 次回アクション行に「要因調査」系メッセージ"""
    ctx = _base_ctx(tmp_path, final_status='REJECTED', git_info={
        'commit_sha': '', 'commit_msg': '', 'changed_files': [], 'pr_url': None,
    })
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['06_総合結果']
    # 行 27 = 最初のアクション
    action_text = str(ws.cell(27, 2).value or '')
    assert '要因調査' in action_text or 'REJECTED' in action_text or '確認' in action_text
