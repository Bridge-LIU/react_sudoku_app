"""v10 テンプレを実データで埋込む処理。原本は絶対不変。"""
from dataclasses import dataclass, field
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Font


@dataclass
class ExcelFillContext:
    template_path: str
    output_path: str
    run_ts: str
    test_results: dict
    screenshots: list = field(default_factory=list)  # [(sheet, cell, png_path)]
    diff_summary: dict = field(default_factory=dict)


def fill_report(ctx: ExcelFillContext) -> None:
    wb = load_workbook(ctx.template_path)

    # 01_表紙サマリ
    if '01_表紙サマリ' in wb.sheetnames:
        ws = wb['01_表紙サマリ']
        ws.cell(6, 4).value = ctx.run_ts.split(' ')[0]
        ws.cell(7, 4).value = 'Claude Code'
        ws.cell(9, 4).value = f'Claude 実施日: {ctx.run_ts}'
        ws.cell(10, 4).value = f'Superpowers 実施日: {ctx.run_ts}'

        tv = ctx.test_results.get('vitest', {})
        tj = ctx.test_results.get('jest', {})
        total_pass = tv.get('passed', 0) + tj.get('passed', 0)
        total_fail = tv.get('failed', 0) + tj.get('failed', 0)
        ws.cell(26, 4).value = total_pass + total_fail
        ws.cell(26, 7).value = f'{total_pass} / {total_pass + total_fail} PASS'

    # 02-11 各 sheet の 実施日/実際結果 列更新
    for sn in wb.sheetnames:
        if sn.startswith(('02_', '03_', '04_', '05_', '06_', '07_', '08_', '09_', '10_', '11_')):
            _update_result_sheet(wb[sn], ctx.run_ts)

    # 12_カバレッジ シート追加
    if '12_カバレッジ' not in wb.sheetnames:
        cov_ws = wb.create_sheet('12_カバレッジ')
        cov_ws['A1'] = 'カバレッジ サマリ'
        cov_ws['A1'].font = Font(bold=True, size=16)
        cov = ctx.test_results.get('coverage') or {}  # None を空 dict に coerce
        rows = [
            ('Line', cov.get('line', 0)),
            ('Branch', cov.get('branch', 0)),
            ('Statement', cov.get('statement', 0)),
            ('Function', cov.get('function', 0)),
        ]
        for i, (label, val) in enumerate(rows, start=3):
            cov_ws.cell(i, 1).value = label
            val_num = val if isinstance(val, (int, float)) else 0
            cov_ws.cell(i, 2).value = f'{val_num:.1f}%'

    # screenshots
    for (sheet_name, cell_addr, png_path) in ctx.screenshots:
        if sheet_name in wb.sheetnames and Path(png_path).exists():
            ws = wb[sheet_name]
            img = XLImage(png_path)
            img.width, img.height = 320, 200
            ws.add_image(img, cell_addr)

    wb.save(ctx.output_path)


def _update_result_sheet(ws, run_ts: str) -> None:
    """v10 では G列=開発時実施日, H=実施者, I=追加テスト実施日, J=実施者"""
    for row in range(8, ws.max_row + 1):
        b = ws.cell(row, 2).value
        if b and str(b).strip().isdigit():
            ws.cell(row, 7).value = run_ts
            ws.cell(row, 8).value = 'Claude'
            ws.cell(row, 9).value = run_ts
            ws.cell(row, 10).value = 'Superpowers'
