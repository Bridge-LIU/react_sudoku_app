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
    assert '01_表紙サマリ' in wb.sheetnames
    ws = wb['01_表紙サマリ']
    # 担当者行に Claude が含まれることを確認 (row 9 or 7)
    joined = str(ws.cell(9, 4).value or '') + str(ws.cell(7, 4).value or '')
    assert 'Claude' in joined
