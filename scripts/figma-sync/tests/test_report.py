import json
import os
import sys
from pathlib import Path
from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.lib.excel_fill import fill_report, ExcelFillContext


def test_fill_report_creates_file_with_12_sheets(tmp_path):
    root = Path(__file__).parent.parent
    template = root / 'templates' / 'sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx'
    output = tmp_path / 'report.xlsx'

    ctx = ExcelFillContext(
        template_path=str(template),
        output_path=str(output),
        run_ts='2026-08-19 14:30',
        test_results={
            'vitest': {'total': 93, 'passed': 93, 'failed': 0, 'cases': []},
            'jest': {'total': 14, 'passed': 14, 'failed': 0, 'cases': []},
            'coverage': {'line': 92.3, 'branch': 87.1, 'statement': 91.0, 'function': 88.5},
        },
        screenshots=[],
        diff_summary={'added': 0, 'modified': 1, 'removed': 0},
    )
    fill_report(ctx)

    wb = load_workbook(str(output))
    assert '12_カバレッジ' in wb.sheetnames, '12_カバレッジ sheet must be added'
    assert '13_デザイン変更差分' in wb.sheetnames, '13_デザイン変更差分 sheet must be added'
    assert '01_表紙サマリ' in wb.sheetnames
    ws = wb['01_表紙サマリ']
    # 担当者行に Claude が含まれることを確認 (row 9 or 7)
    joined = str(ws.cell(9, 4).value or '') + str(ws.cell(7, 4).value or '')
    assert 'Claude' in joined


def _base_ctx(tmp_path, design_changes):
    root = Path(__file__).parent.parent
    template = root / 'templates' / 'sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx'
    return ExcelFillContext(
        template_path=str(template),
        output_path=str(tmp_path / 'report.xlsx'),
        run_ts='2026-08-21 10:00',
        test_results={
            'vitest': {'total': 0, 'passed': 0, 'failed': 0, 'cases': []},
            'jest': {'total': 0, 'passed': 0, 'failed': 0, 'cases': []},
            'coverage': None,
        },
        screenshots=[],
        diff_summary={'added': 0, 'modified': 0, 'removed': 0},
        design_changes=design_changes,
    )


def test_design_diff_sheet_empty_shows_no_changes(tmp_path):
    ctx = _base_ctx(tmp_path, [])
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    assert '13_デザイン変更差分' in wb.sheetnames
    ws = wb['13_デザイン変更差分']
    assert ws['A1'].value == 'デザイン変更差分'
    assert str(ws['A2'].value).startswith('run:')
    assert ws.cell(4, 1).value == '#'
    assert ws.cell(4, 6).value == 'Before'
    assert ws.cell(5, 1).value == '(変更なし)'


def test_design_diff_sheet_with_data_and_null_images(tmp_path):
    design_changes = [
        {
            'component': 'Play',
            'file': 'src/app/play/[difficulty].tsx',
            'node_id': '18:6',
            'changes': [
                {'node_id': '147:2', 'node_name': 'div.css-view-g5y9jx',
                 'property': 'fills[0]', 'kind': 'removed'},
                {'node_id': '147:2', 'node_name': 'div.css-view-g5y9jx',
                 'property': 'minWidth', 'kind': 'removed'},
            ],
            'before_png': None,
            'after_png': None,
            'diff_png': None,
            'diff_pixels': None,
        },
        {
            'component': 'Home',
            'file': 'src/app/index.tsx',
            'node_id': '20:1',
            'changes': [
                {'node_id': '200:5', 'node_name': 'button',
                 'property': 'strokes[0]', 'kind': 'added'},
            ],
            'before_png': str(tmp_path / 'nonexistent.png'),  # 存在しないパス
            'after_png': None,
            'diff_png': None,
            'diff_pixels': 42,
        },
    ]
    ctx = _base_ctx(tmp_path, design_changes)
    fill_report(ctx)
    wb = load_workbook(str(ctx.output_path))
    ws = wb['13_デザイン変更差分']
    # row 5 = 1件目
    assert ws.cell(5, 1).value == 1
    assert ws.cell(5, 2).value == 'Play'
    assert ws.cell(5, 3).value == 'src/app/play/[difficulty].tsx'
    assert '147:2' in str(ws.cell(5, 4).value)
    assert 'fills[0]' in str(ws.cell(5, 5).value)
    assert 'removed' in str(ws.cell(5, 5).value)
    # 画像なし → テキスト
    assert ws.cell(5, 6).value == '(画像なし)'
    assert ws.cell(5, 7).value == '(画像なし)'
    assert ws.cell(5, 8).value == '(画像なし)'
    # row 6 = 2件目
    assert ws.cell(6, 1).value == 2
    assert ws.cell(6, 2).value == 'Home'
    assert 'strokes[0]' in str(ws.cell(6, 5).value)
    # 存在しないパスも「(画像なし)」扱い
    assert ws.cell(6, 6).value == '(画像なし)'


def test_design_diff_sheet_idempotent(tmp_path):
    """既に 13_デザイン変更差分 が存在する場合、上書きされず（そもそも二重 fill_report は想定しないが _add_design_diff_sheet 単体で確認）"""
    from scripts.lib.excel_fill import _add_design_diff_sheet
    from openpyxl import Workbook
    wb = Workbook()
    ctx = _base_ctx(tmp_path, [])
    _add_design_diff_sheet(wb, ctx)
    _add_design_diff_sheet(wb, ctx)  # 2回目は no-op
    count = sum(1 for n in wb.sheetnames if n == '13_デザイン変更差分')
    assert count == 1
