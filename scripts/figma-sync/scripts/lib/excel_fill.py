"""v10 テンプレを実データで埋込む処理。原本は絶対不変。"""
from dataclasses import dataclass, field
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter


@dataclass
class ExcelFillContext:
    template_path: str
    output_path: str
    run_ts: str
    test_results: dict
    screenshots: list = field(default_factory=list)  # [(sheet, cell, png_path)]
    diff_summary: dict = field(default_factory=dict)
    design_changes: list = field(default_factory=list)  # [{component, file, node_id, changes[], before_png, after_png, diff_png, diff_pixels}]


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

    # 13_デザイン変更差分 シート追加（programmatic、template には触らない）
    _add_design_diff_sheet(wb, ctx)

    wb.save(ctx.output_path)


def _add_design_diff_sheet(wb, ctx: ExcelFillContext) -> None:
    """13_デザイン変更差分 sheet を programmatic に作成（idempotent）"""
    if '13_デザイン変更差分' in wb.sheetnames:
        return
    ws = wb.create_sheet('13_デザイン変更差分')

    # タイトル
    ws['A1'] = 'デザイン変更差分'
    ws['A1'].font = Font(bold=True, size=16)
    ws['A2'] = f'run: {ctx.run_ts}'

    # header row (row 4)
    headers = ['#', '対象コンポーネント', 'ファイル', '変更ノード', '変更 property', 'Before', 'After', 'Diff']
    header_fill = PatternFill(start_color='FFD9D9D9', end_color='FFD9D9D9', fill_type='solid')
    for col_idx, h in enumerate(headers, start=1):
        c = ws.cell(4, col_idx)
        c.value = h
        c.font = Font(bold=True)
        c.fill = header_fill
        c.alignment = Alignment(horizontal='center', vertical='center')

    # 列幅
    widths = {'A': 5, 'B': 20, 'C': 40, 'D': 30, 'E': 35, 'F': 45, 'G': 45, 'H': 45}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    changes_list = ctx.design_changes or []

    if not changes_list:
        ws.cell(5, 1).value = '(変更なし)'
        ws.cell(5, 1).alignment = Alignment(horizontal='left', vertical='center')
        return

    # データ行
    row = 5
    for idx, dc in enumerate(changes_list, start=1):
        # 変更ノード / property を改行連結
        node_lines = []
        prop_lines = []
        for ch in dc.get('changes', []) or []:
            n_id = ch.get('node_id', '')
            n_name = ch.get('node_name', '')
            node_lines.append(f'{n_id} ({n_name})' if n_name else str(n_id))
            prop = ch.get('property', '')
            kind = ch.get('kind', '')
            prop_lines.append(f'{prop} {kind}'.strip())

        ws.cell(row, 1).value = idx
        ws.cell(row, 2).value = dc.get('component', '')
        ws.cell(row, 3).value = dc.get('file', '')
        ws.cell(row, 4).value = '\n'.join(node_lines) if node_lines else ''
        ws.cell(row, 5).value = '\n'.join(prop_lines) if prop_lines else ''

        # 画像列 F/G/H
        for col_letter, key in [('F', 'before_png'), ('G', 'after_png'), ('H', 'diff_png')]:
            png = dc.get(key)
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

        # wrap text + 行高（画像 200px ~ 150 ポイント相当）
        for col_idx in range(1, len(headers) + 1):
            ws.cell(row, col_idx).alignment = Alignment(
                wrap_text=True, vertical='top', horizontal='left'
            )
        ws.row_dimensions[row].height = 155
        row += 1


def _update_result_sheet(ws, run_ts: str) -> None:
    """v10 では G列=開発時実施日, H=実施者, I=追加テスト実施日, J=実施者"""
    for row in range(8, ws.max_row + 1):
        b = ws.cell(row, 2).value
        if b and str(b).strip().isdigit():
            ws.cell(row, 7).value = run_ts
            ws.cell(row, 8).value = 'Claude'
            ws.cell(row, 9).value = run_ts
            ws.cell(row, 10).value = 'Superpowers'
