# -*- coding: utf-8 -*-
"""Mở Dashboard.xlsx, refresh, export mỗi sheet dashboard ra PDF để kiểm tra."""
import os, sys, io
sys.stdout=io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import win32com.client as win32
BASE=os.path.abspath('.')
OUT=os.path.join(BASE,'excel','Dashboard.xlsx')
xl=win32.gencache.EnsureDispatch('Excel.Application')
xl.Visible=False; xl.DisplayAlerts=False
wb=xl.Workbooks.Open(OUT)
try:
    for s in wb.Worksheets:
        if s.Name[0] in '123' and '.' in s.Name[:3]:
            s.PageSetup.Orientation=2  # landscape
            s.PageSetup.Zoom=False
            s.PageSetup.FitToPagesWide=1
            s.PageSetup.FitToPagesTall=1
            pdf=os.path.join(BASE,'excel',f'preview_{s.Name[0]}.pdf')
            s.ExportAsFixedFormat(0, pdf)
            print('PDF:', pdf)
            # in vài KPI cell
    # đọc KPI DB1
    ws=wb.Worksheets("1. Executive Sales")
    for addr in ("B6","L6","V6","AD6","AL6"):
        print(addr, '=', ws.Range(addr).Text)
finally:
    wb.Close(SaveChanges=False); xl.Quit()
print('done')
