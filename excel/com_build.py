# -*- coding: utf-8 -*-
"""
Bước 3: Excel COM dựng 3 dashboard tương tác (PivotTable + Slicer + PivotChart)
trên nền excel/model.xlsx -> excel/Dashboard.xlsx
"""
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import win32com.client as win32

BASE  = os.path.abspath('.')
MODEL = os.path.join(BASE,'excel','model.xlsx')
OUT   = os.path.join(BASE,'excel','Dashboard.xlsx')

# ---- Excel enums ----
xlDatabase=1; xlRowField=1; xlColumnField=2; xlPageField=3; xlDataField=4
xlSum=-4157; xlCount=-4112; xlAverage=-4106
xlColumnClustered=51; xlBarClustered=57; xlLineMarkers=65; xlColumnStacked=52
xlXYScatter=-4169; xlBubble=15; xlLine=4
xlThin=2; xlCenter=-4108; xlLeft=-4131; xlRight=-4152; xlTop=-4160; xlBottom=-4107
xlCellValue=1; xlGreater=5; xlLess=6; xlBetween=1
xlDescending=2; xlAscending=1; xlDataItem=4
msoTextOrientationHorizontal=1; msoShapeRectangle=1
xlValidateList=3

def rgb(r,g,b): return (b<<16)|(g<<8)|r   # Excel dùng BGR
INK=rgb(31,41,55); MUTED=rgb(107,114,128); LINE=rgb(226,232,240)
PAGEBG=rgb(248,250,252); WHITE=rgb(255,255,255); HDR=rgb(15,23,42)
BLUE=rgb(37,99,235); TEAL=rgb(13,148,136); GREEN=rgb(22,163,74)
AMBER=rgb(217,119,6); RED=rgb(220,38,38); VIOLET=rgb(124,58,237); SLATE=rgb(51,65,85)
CARD=rgb(255,255,255); NOTEBG=rgb(255,251,235); BANDBG=rgb(241,245,249)

print('Mở Excel...')
xl = win32.gencache.EnsureDispatch('Excel.Application')
xl.Visible=False; xl.DisplayAlerts=False; xl.ScreenUpdating=False
wb = xl.Workbooks.Open(MODEL)
# nếu chạy lại: xóa dashboard cũ nếu có
for _s in list(wb.Worksheets):
    if _s.Name.startswith(('1. ','2. ','3. ')):
        _s.Delete()

def ws_by(name):
    for s in wb.Worksheets:
        if s.Name==name: return s
def usedrange(name):
    ws=ws_by(name); return ws.Range(ws.UsedRange.Address)

_caches={}
def cache_for(src):
    if src not in _caches:
        _caches[src]=wb.PivotCaches().Create(SourceType=xlDatabase, SourceData=usedrange(src))
    return _caches[src]

def add_pivot(src, ws, cell, name):
    pt=cache_for(src).CreatePivotTable(TableDestination=ws.Range(cell), TableName=name)
    try: pt.TableStyle2="PivotStyleLight16"
    except: pass
    pt.ShowDrillIndicators=False
    return pt

def calc_field(pt, name, formula):
    try: pt.CalculatedFields().Add(name, formula, True)
    except Exception as e: pass
    return pt.PivotFields(name)

def new_dash(name, ncols=74):
    ws=wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count)); ws.Name=name
    ws.Cells.Interior.Color=PAGEBG
    ws.Activate()
    try: xl.ActiveWindow.DisplayGridlines=False
    except Exception as e: print('  gridline warn', e)
    for c in range(1,ncols+1): ws.Columns(c).ColumnWidth=2.4
    ws.Columns(1).ColumnWidth=1.4
    return ws

def geom(ws, cell):
    r=ws.Range(cell); return (r.Left, r.Top, r.Width, r.Height)

def set_widths(ws, start_col_letter, widths):
    c0=ws.Range(start_col_letter+"1").Column
    for i,wd in enumerate(widths): ws.Columns(c0+i).ColumnWidth=wd

def band(ws, cell, text, color=SLATE):
    r=ws.Range(cell); r.Merge(); r.Interior.Color=BANDBG
    r.Value=text; r.Font.Bold=True; r.Font.Size=10.5; r.Font.Color=color
    r.HorizontalAlignment=xlLeft; r.VerticalAlignment=xlCenter
    r.IndentLevel=1

def card(ws, cell, label, value_formula, color, numfmt="#,##0", vsize=18):
    r=ws.Range(cell); r.Merge()
    r.Interior.Color=CARD; r.Borders.Color=LINE; r.Borders.Weight=xlThin
    # tách label(trên) + value(dưới) trong cùng ô bằng 2 dòng text? -> dùng 2 ô
    top=ws.Range(cell.split(':')[0])
    # label ở dòng đầu, value dòng kế: ta viết vào ô góc trái-trên và ô dưới nó
    ws.Range(cell).HorizontalAlignment=xlCenter
    return r

# card gồm 2 vùng: nhãn (2 dòng trên) và số (phần dưới)
def kpi(ws, c1, c2, r_lab, r_val_top, r_val_bot, cols, label, formula, color, numfmt, vsize=17):
    # cols = (colStart,colEnd) chữ; build ranges
    lab=ws.Range(f"{cols[0]}{r_lab}:{cols[1]}{r_lab}")
    val=ws.Range(f"{cols[0]}{r_val_top}:{cols[1]}{r_val_bot}")
    box=ws.Range(f"{cols[0]}{r_lab}:{cols[1]}{r_val_bot}")
    box.Interior.Color=CARD; box.Borders.Color=LINE; box.Borders.Weight=xlThin
    lab.Merge(); lab.Value=label; lab.Font.Size=8.5; lab.Font.Color=MUTED
    lab.HorizontalAlignment=xlCenter; lab.VerticalAlignment=xlCenter
    val.Merge(); val.Formula=formula; val.Font.Size=vsize; val.Font.Bold=True
    val.Font.Color=color; val.NumberFormat=numfmt
    val.HorizontalAlignment=xlCenter; val.VerticalAlignment=xlCenter

def add_slicer(pt, field, caption, left, top, width, height, ncol=1):
    sc=wb.SlicerCaches.Add2(pt, field)
    sl=sc.Slicers.Add(SlicerDestination=pt.Parent, Name=f"{pt.Parent.Name}_{field}",
                      Caption=caption, Top=top, Left=left, Width=width, Height=height)
    try:
        sl.NumberOfColumns=ncol
        sl.Style="SlicerStyleLight2"
    except: pass
    try: pt.Parent.Shapes(sl.Name).Placement=3
    except Exception as e: print('  slicer placement warn', e)
    return sc, sl

def connect(sc, pt):
    try: sc.PivotTables.AddPivotTable(pt)
    except Exception as e: print('  connect warn', e)

xlValue=2; xlCategory=1
def pchart(ws, pt, ctype, cell_tl, cell_br, title, colors=None, axfmt='#,##0,,"tr"'):
    l,t,_,_=geom(ws, cell_tl); r2=ws.Range(cell_br)
    w=(r2.Left+r2.Width)-l; h=(r2.Top+r2.Height)-t
    sh=ws.Shapes.AddChart2(-1, ctype, l, t, w, h)
    ch=sh.Chart; ch.SetSourceData(pt.TableRange1)
    ch.HasTitle=True; ch.ChartTitle.Text=title
    ch.ChartTitle.Font.Size=11; ch.ChartTitle.Font.Bold=True; ch.ChartTitle.Font.Color=HDR
    try: ch.ShowAllFieldButtons=False
    except: pass
    try:
        ch.HasLegend=False
        ch.ChartGroups(1).GapWidth=55
    except: pass
    try:
        s=ch.SeriesCollection(1); s.Format.Fill.ForeColor.RGB=colors if colors else BLUE
    except: pass
    try:
        ax=ch.Axes(xlValue); ax.TickLabels.NumberFormat=axfmt; ax.TickLabels.Font.Size=8
        ch.Axes(xlCategory).TickLabels.Font.Size=8
    except: pass
    ch.ChartArea.Format.Line.Visible=False
    ch.ChartArea.Format.Fill.Visible=False
    ch.PlotArea.Format.Fill.Visible=False
    sh.Placement=3
    return ch

def normal_chart(ws, srcrange, ctype, cell_tl, cell_br, title, color=BLUE, axfmt='#,##0,,"tr"'):
    l,t,_,_=geom(ws,cell_tl); r2=ws.Range(cell_br)
    w=(r2.Left+r2.Width)-l; h=(r2.Top+r2.Height)-t
    sh=ws.Shapes.AddChart2(-1, ctype, l, t, w, h); ch=sh.Chart
    ch.SetSourceData(srcrange)
    ch.HasTitle=True; ch.ChartTitle.Text=title; ch.ChartTitle.Font.Size=11
    ch.ChartTitle.Font.Bold=True; ch.ChartTitle.Font.Color=HDR
    try: ch.HasLegend=False
    except: pass
    try:
        s=ch.SeriesCollection(1); s.Format.Fill.ForeColor.RGB=color
    except: pass
    try:
        ax=ch.Axes(xlValue); ax.TickLabels.NumberFormat=axfmt; ax.TickLabels.Font.Size=8
        ch.Axes(xlCategory).TickLabels.Font.Size=8
    except: pass
    ch.ChartArea.Format.Line.Visible=False
    ch.ChartArea.Format.Fill.Visible=False
    sh.Placement=3
    return ch

def note(ws, cell_tl, cell_br, lines):
    l,t,_,_=geom(ws,cell_tl); r2=ws.Range(cell_br)
    w=(r2.Left+r2.Width)-l; h=(r2.Top+r2.Height)-t
    tb=ws.Shapes.AddTextbox(msoTextOrientationHorizontal, l, t, w, h)
    tf=tb.TextFrame2.TextRange; tf.Text="\n".join(lines)
    tf.Font.Size=7.8; tf.Font.Fill.ForeColor.RGB=SLATE
    tb.Fill.ForeColor.RGB=NOTEBG; tb.Line.ForeColor.RGB=AMBER; tb.Line.Weight=1.0
    tb.TextFrame2.WordWrap=True; tb.TextFrame2.MarginTop=3; tb.TextFrame2.MarginLeft=5
    tb.TextFrame2.VerticalAnchor=1
    tb.Placement=3
    return tb

# ============================================================
#  DASHBOARD 1 — EXECUTIVE SALES
# ============================================================
def build_db1():
    print('DB1...')
    ws=new_dash("1. Executive Sales")
    ws.Range("B2").Value="Executive Sales — Doanh thu 6 tháng (01–06/2026)"
    ws.Range("B2").Font.Size=20; ws.Range("B2").Font.Bold=True; ws.Range("B2").Font.Color=HDR
    ws.Range("B3").Value="Nguồn: Data_set.xlsx • Đã làm sạch (450/452 dòng) • Region = vùng KHÁCH HÀNG"
    ws.Range("B3").Font.Size=9.5; ws.Range("B3").Font.Color=MUTED

    # --- staging KPI pivot (ẩn, cột xa) ---
    stg=add_pivot('fact_sales', ws, "BR2", "db1_kpi")
    calc_field(stg,"cfGM","=GPHasCost/RevHasCost")
    calc_field(stg,"cfFill","=QtyDelivFill/QtyOrderFill")
    calc_field(stg,"cfOTD","=OnTimeNum/OnTimeDen")
    stg.AddDataField(stg.PivotFields("RevenueNet"),"Revenue Net",xlSum)
    stg.AddDataField(stg.PivotFields("GPHasCost"),"Gross Margin",xlSum)
    stg.AddDataField(stg.PivotFields("cfGM"),"GM %",xlSum)
    stg.AddDataField(stg.PivotFields("cfFill"),"Fill Rate",xlSum)
    stg.AddDataField(stg.PivotFields("cfOTD"),"OTD",xlSum)
    stg.AddDataField(stg.PivotFields("ReturnVal"),"Return Val",xlSum)

    def gpd(name): return f'=GETPIVOTDATA("{name}",\'1. Executive Sales\'!$BR$2)'
    # KPI cards hàng 5-8
    kpi(ws,None,None,5,6,8,("B","J"),"REVENUE NET (VNĐ)", gpd("Revenue Net"), BLUE, "#,##0",16)
    kpi(ws,None,None,5,6,8,("L","T"),"GROSS MARGIN (VNĐ)", gpd("Gross Margin"), TEAL, "#,##0",16)
    kpi(ws,None,None,5,6,8,("V","AB"),"GROSS MARGIN %", gpd("GM %"), TEAL, "0.00%",16)
    kpi(ws,None,None,5,6,8,("AD","AJ"),"FILL RATE", gpd("Fill Rate"), GREEN, "0.00%",16)
    kpi(ws,None,None,5,6,8,("AL","AR"),"ON-TIME DELIVERY", gpd("OTD"), AMBER, "0.00%",16)

    # --- slicers ---
    l0,t0,_,_=geom(ws,"B10")
    add_slicer(stg,"Month","Tháng", l0, t0, 120, 108, 2)
    add_slicer(stg,"CustRegion","Vùng khách", l0+128, t0, 120, 108, 1)
    add_slicer(stg,"Channel","Kênh", l0+256, t0, 120, 108, 1)

    # --- pivot theo tháng (chart) ---
    ptM=add_pivot('fact_sales', ws, "BR20", "db1_month")
    ptM.PivotFields("Month").Orientation=xlRowField
    ptM.AddDataField(ptM.PivotFields("RevenueNet"),"Revenue Net",xlSum)
    # --- pivot theo vùng ---
    ptR=add_pivot('fact_sales', ws, "BX20", "db1_region")
    ptR.PivotFields("CustRegion").Orientation=xlRowField
    ptR.AddDataField(ptR.PivotFields("RevenueNet"),"Revenue Net",xlSum)
    # --- pivot theo nhóm hàng ---
    ptC=add_pivot('fact_sales', ws, "CD20", "db1_cat")
    ptC.PivotFields("CategoryName").Orientation=xlRowField
    ptC.AddDataField(ptC.PivotFields("RevenueNet"),"Revenue Net",xlSum)
    ptC.PivotFields("CategoryName").AutoSort(xlDescending,"Revenue Net")
    # --- pivot top sản phẩm theo Gross Profit ---
    ptP=add_pivot('fact_sales', ws, "CJ20", "db1_prod")
    ptP.PivotFields("ItemName").Orientation=xlRowField
    ptP.AddDataField(ptP.PivotFields("GPHasCost"),"Gross Profit",xlSum)
    ptP.PivotFields("ItemName").AutoSort(xlDescending,"Gross Profit")
    try:
        ptP.PivotFields("ItemName").PivotFilters.Add2(Type=1, DataField=ptP.PivotFields("Gross Profit"), Value1=10)  # top10
    except Exception as e: print('  top10 warn', e)

    # nối slicer tới tất cả pivot cùng cache
    for sc in wb.SlicerCaches:
        for pt in (ptM,ptR,ptC,ptP):
            connect(sc, pt)

    # --- charts ---
    band(ws,"B18:AR18","Doanh thu theo lát cắt (phản ứng theo Slicer)")
    pchart(ws, ptM, xlColumnClustered, "B20","T33","Revenue Net theo THÁNG", BLUE)
    pchart(ws, ptP, xlBarClustered,    "B34","T47","Top 10 sản phẩm theo Gross Profit", GREEN)
    pchart(ws, ptR, xlBarClustered,    "V20","AR32","Revenue Net theo VÙNG khách", TEAL)
    pchart(ws, ptC, xlBarClustered,    "V33","AR47","Revenue Net theo NHÓM HÀNG", VIOLET)

    # --- Achievement Index block (tĩnh, cấp tổng hợp) ---
    band(ws,"B49:AR49","Achievement Index — chỉ đọc cấp tổng hợp (100 = mặt bằng 6,07%). KHÔNG theo Slicer.")
    am=usedrange('ach_month'); ar=usedrange('ach_region'); ac=usedrange('ach_cat')
    # chart cột Index theo tháng
    def idx_chart(srcname, cell_tl, cell_br, title, color):
        wsx=ws_by(srcname); last=wsx.UsedRange.Rows.Count
        # cột Group (A) và Index (E)
        rng=wsx.Range(f"A1:A{last},E1:E{last}")
        normal_chart(ws, rng, xlColumnClustered, cell_tl, cell_br, title, color, axfmt='0')
    idx_chart('ach_month',"B51","M63","Index theo THÁNG", BLUE)
    idx_chart('ach_region',"N51","Y63","Index theo VÙNG", TEAL)
    idx_chart('ach_cat',"Z51","AR63","Index theo NHÓM HÀNG", VIOLET)

    # --- note bắt buộc (nguyên văn analysis §4.5) ---
    note(ws,"B65","AR76",[
      "CHÚ THÍCH BẮT BUỘC:",
      "• Region = vùng KHÁCH HÀNG (Dashboard 2 dùng vùng KHO — khác nhau).",
      "• Achievement Index = tỷ lệ đạt kế hoạch chuẩn hóa, 100 = mặt bằng chung (6,07%). Chỉ đọc ở cấp vùng / nhóm hàng / tháng. KHÔNG đọc ở từng ô (~3,7 đơn/ô).",
      "• Kênh Nội bộ (24,5% doanh thu) ĐƯỢC tính vào Revenue Net.",
      "• Plan và fact không cùng phạm vi (fact là mẫu ~6%).",
      "• Đã loại 1 dòng trùng, 1 dòng QtyOrder = 900. VT999 không có COGS ⇒ loại khỏi GM.",
    ])
    # ẩn cột staging
    ws.Columns("BQ:CZ").Hidden=True
    ws.Range("A1").Select()
    print('DB1 done')

# ============================================================
#  DASHBOARD 2 — INVENTORY & SLOW MOVING
# ============================================================
def render_table(ws, srcname, dest_cell, header, widths, money_cols=(), hdr_color=SLATE):
    """Đặt bảng tĩnh với độ rộng cột tường minh (không autofit), format số tiền."""
    src=ws_by(srcname); n=src.UsedRange.Rows.Count; m=src.UsedRange.Columns.Count
    d=ws.Range(dest_cell); c0=d.Column; r0=d.Row
    if widths:
        for i,wd in enumerate(widths[:m]):
            ws.Columns(c0+i).ColumnWidth=wd
    if header:
        hb=ws.Range(ws.Cells(r0,c0), ws.Cells(r0,c0+m-1))
        hb.Merge(); hb.Interior.Color=BANDBG; hb.Value=header
        hb.Font.Bold=True; hb.Font.Size=10; hb.Font.Color=hdr_color
        hb.HorizontalAlignment=xlLeft; hb.VerticalAlignment=xlCenter; hb.IndentLevel=1
        br0=r0+1
    else:
        br0=r0
    src.UsedRange.Copy()
    ws.Range(ws.Cells(br0,c0),ws.Cells(br0,c0)).Select()
    ws.Paste(Destination=ws.Cells(br0,c0))
    xl.CutCopyMode=False
    body=ws.Range(ws.Cells(br0,c0), ws.Cells(br0+n-1,c0+m-1))
    body.Font.Size=8.5; body.Borders.Color=LINE; body.Borders.Weight=xlThin
    body.VerticalAlignment=xlCenter
    hdr=ws.Range(ws.Cells(br0,c0), ws.Cells(br0,c0+m-1))
    hdr.Font.Bold=True; hdr.Interior.Color=rgb(226,232,240); hdr.Font.Color=SLATE
    for mc in money_cols:
        ws.Range(ws.Cells(br0+1,c0+mc), ws.Cells(br0+n-1,c0+mc)).NumberFormat="#,##0"
    return body
copy_table=None  # deprecated

def bubble_chart(ws, cell_tl, cell_br, title):
    l,t,_,_=geom(ws,cell_tl); r2=ws.Range(cell_br)
    w=(r2.Left+r2.Width)-l; h=(r2.Top+r2.Height)-t
    sh=ws.Shapes.AddChart2(-1, xlBubble, l,t,w,h); ch=sh.Chart
    sc=ws_by('scatter'); n=sc.UsedRange.Rows.Count
    while ch.SeriesCollection().Count>0: ch.SeriesCollection(1).Delete()
    s=ch.SeriesCollection().NewSeries()
    s.XValues=sc.Range(f"A2:A{n}"); s.Values=sc.Range(f"B2:B{n}")
    try: s.BubbleSizes=sc.Range(f"C2:C{n}")
    except Exception as e: print('  bubble size warn',e)
    s.Name="Item"; s.Format.Fill.ForeColor.RGB=BLUE
    try: s.Format.Fill.Transparency=0.35
    except: pass
    ch.HasTitle=True; ch.ChartTitle.Text=title; ch.ChartTitle.Font.Size=10.5
    ch.ChartTitle.Font.Bold=True; ch.ChartTitle.Font.Color=HDR; ch.HasLegend=False
    try:
        axx=ch.Axes(xlCategory); axx.HasTitle=True; axx.AxisTitle.Text="MOC (tháng)"
        axx.AxisTitle.Font.Size=8; axx.TickLabels.Font.Size=8; axx.MinimumScale=0
        axy=ch.Axes(xlValue); axy.HasTitle=True; axy.AxisTitle.Text="Giá trị tồn"
        axy.AxisTitle.Font.Size=8; axy.TickLabels.NumberFormat='#,##0,,"tr"'; axy.TickLabels.Font.Size=8
        axy.MinimumScale=0
    except Exception as e: print('  bubble ax warn',e)
    ch.ChartArea.Format.Line.Visible=False; ch.ChartArea.Format.Fill.Visible=False
    sh.Placement=3
    return ch

def build_db2():
    print('DB2...')
    ws=new_dash("2. Inventory")
    ws.Range("B2").Value="Inventory & Slow Moving — Tồn kho EOM 30/06/2026"
    ws.Range("B2").Font.Size=20; ws.Range("B2").Font.Bold=True; ws.Range("B2").Font.Color=HDR
    ws.Range("B3").Value="Ảnh chụp kỳ mới nhất • Region = vùng KHO • Đã loại orphan VT999 • MOC dùng filter Completed+Return"
    ws.Range("B3").Font.Size=9.5; ws.Range("B3").Font.Color=MUTED

    stg=add_pivot('inv_row', ws, "BR2", "db2_kpi")
    stg.AddDataField(stg.PivotFields("InventoryValue"),"Ton",xlSum)
    stg.AddDataField(stg.PivotFields("SlowHeavyValue"),"MacKet",xlSum)
    stg.AddDataField(stg.PivotFields("DiscStockValue"),"Disc",xlSum)
    stg.AddDataField(stg.PivotFields("NegN"),"TonAm",xlSum)
    stg.AddDataField(stg.PivotFields("BelowSafetyN"),"DuoiSafety",xlSum)
    def gpd(n): return f'=GETPIVOTDATA("{n}",\'2. Inventory\'!$BR$2)'
    kpi(ws,None,None,5,6,8,("B","J"),"TỔNG GIÁ TRỊ TỒN (VNĐ)", gpd("Ton"), BLUE, "#,##0",15)
    kpi(ws,None,None,5,6,8,("L","T"),"VỐN MẮC KẸT (Slow&Heavy)", gpd("MacKet"), RED, "#,##0",15)
    kpi(ws,None,None,5,6,8,("V","AB"),"DISCONTINUED CÒN TỒN", gpd("Disc"), AMBER, "#,##0",15)
    kpi(ws,None,None,5,6,8,("AD","AJ"),"TỒN ÂM (dòng)", gpd("TonAm"), RED, "#,##0",15)
    kpi(ws,None,None,5,6,8,("AL","AR"),"DƯỚI SAFETY (dòng)", gpd("DuoiSafety"), VIOLET, "#,##0",15)

    l0,t0,_,_=geom(ws,"B10")
    add_slicer(stg,"WarehouseName","Kho", l0, t0, 118, 112, 1)
    add_slicer(stg,"CategoryName","Nhóm hàng", l0+124, t0, 130, 112, 1)
    add_slicer(stg,"ABC_Class","ABC", l0+260, t0, 70, 112, 1)
    add_slicer(stg,"ItemStatus","Status", l0+336, t0, 92, 112, 1)

    ptWh=add_pivot('inv_row', ws, "BX20","db2_wh")
    ptWh.PivotFields("WarehouseName").Orientation=xlRowField
    ptWh.AddDataField(ptWh.PivotFields("InventoryValue"),"Tồn",xlSum)
    ptCat=add_pivot('inv_row', ws, "CD20","db2_cat")
    ptCat.PivotFields("CategoryName").Orientation=xlRowField
    ptCat.AddDataField(ptCat.PivotFields("InventoryValue"),"Tồn",xlSum)
    ptCat.PivotFields("CategoryName").AutoSort(xlDescending,"Tồn")

    for sc in wb.SlicerCaches:
        for pt in (ptWh,ptCat):
            try: sc.PivotTables.AddPivotTable(pt)
            except: pass

    band(ws,"B18:AR18","Bản đồ chôn vốn — Scatter góc phần tư (trái tim của trang)")
    bubble_chart(ws,"B20","T40","MOC vs Giá trị tồn (bubble=OnHandQty) — góc trên-phải MOC>12 & >127,6tr = Slow&Heavy")
    pchart(ws, ptWh, xlBarClustered, "V20","AR29","Tồn theo KHO", TEAL)
    pchart(ws, ptCat, xlBarClustered, "V30","AR40","Tồn theo NHÓM HÀNG", VIOLET)

    band(ws,"B42:S42","Ma trận Kho × Nhóm hàng (VNĐ) — màu đậm = tồn cao")
    ptHeat=add_pivot('inv_row', ws, "B44","db2_heat")
    ptHeat.PivotFields("CategoryName").Orientation=xlRowField
    ptHeat.PivotFields("WarehouseName").Orientation=xlColumnField
    ptHeat.AddDataField(ptHeat.PivotFields("InventoryValue"),"Tồn",xlSum)
    for sc in wb.SlicerCaches:
        try: sc.PivotTables.AddPivotTable(ptHeat)
        except: pass
    try:
        body=ptHeat.DataBodyRange; body.NumberFormat='#,##0,,"tr"'; body.Font.Size=8.5
        cs=body.FormatConditions.AddColorScale(3)
        cs.ColorScaleCriteria(1).FormatColor.Color=rgb(198,239,206)
        cs.ColorScaleCriteria(2).FormatColor.Color=rgb(255,235,156)
        cs.ColorScaleCriteria(3).FormatColor.Color=rgb(255,153,153)
    except Exception as e: print('  heatmap cs warn',e)

    set_widths(ws,"V",[8,20,14,12,10])
    render_table(ws,'neg_tbl',"V44","Tồn âm tại 30/06/2026 (KHÔNG set = 0)", None, money_cols=(), hdr_color=RED)
    render_table(ws,'disc_tbl',"V52","Discontinued còn tồn (thanh lý)", None, money_cols=(3,), hdr_color=AMBER)

    note(ws,"B64","AR75",[
      "CHÚ THÍCH BẮT BUỘC:",
      "• Region ở trang này = vùng KHO (Dashboard 1 dùng vùng KHÁCH HÀNG).",
      "• Đã loại dòng orphan VT999 (WH_HN, 50 đv, 5.000.000 VNĐ).",
      "• Slow & Heavy = Giá trị tồn > trung vị (127.610.000) VÀ MOC > 12 tháng. Xếp hạng chỉ theo MOC sẽ cho cảnh báo sai (VT033: MOC 65,7 nhưng chỉ 72,8 tr vốn).",
      "• Tồn âm KHÔNG được set = 0 — là dấu hiệu lỗi quy trình, cần điều tra.",
    ])
    ws.Columns("BQ:CZ").Hidden=True
    ws.Range("A1").Select()
    print('DB2 done')

# ============================================================
#  DASHBOARD 3 — DATA QUALITY / RECONCILIATION
# ============================================================
def build_db3():
    print('DB3...')
    ws=new_dash("3. Data Quality")
    ws.Range("B2").Value="Data Quality / Reconciliation — Giấy chứng nhận chất lượng"
    ws.Range("B2").Font.Size=20; ws.Range("B2").Font.Bold=True; ws.Range("B2").Font.Color=HDR
    ws.Range("B3").Value="Chứng minh số liệu DB1 & DB2 đáng tin đến mức nào, định lượng phần không tin bằng tiền, chỉ ra ai sửa gì."
    ws.Range("B3").Font.Size=9.5; ws.Range("B3").Font.Color=MUTED

    kpi(ws,None,None,5,6,8,("B","H"),"DQ SCORE — fact_sales", "=97.79/100", GREEN, "0.00%",15)
    kpi(ws,None,None,5,6,8,("J","P"),"DQ SCORE — inventory", "=98.27/100", GREEN, "0.00%",15)
    kpi(ws,None,None,5,6,8,("R","X"),"PV SCORE (nhân viên)", "=13.94/100", AMBER, "0.00%",15)
    kpi(ws,None,None,5,6,8,("Z","AF"),"Sai nếu KHÔNG làm sạch", "=2.82/100", AMBER, "+0.00%;-0.00%",15)
    kpi(ws,None,None,5,6,8,("AH","AR"),"Sai nếu DEDUPE SAI", "=-5.63/100", RED, "+0.00%;-0.00%",15)

    band(ws,"B10:AR10","Q4+Q5 — Reconciliation doanh thu: làm sạch SAI (−5,63%) nguy hiểm gấp đôi không làm sạch (+2,82%)")
    rc=ws_by('recon'); n=rc.UsedRange.Rows.Count
    normal_chart(ws, rc.Range(f"A1:B{n}"), xlColumnClustered, "B12","T27","Reconciliation (cộng dồn)", BLUE)
    scn=ws_by('scenarios'); n2=scn.UsedRange.Rows.Count
    normal_chart(ws, scn.Range(f"A1:B{n2}"), xlColumnClustered, "V12","AR27","3 kịch bản làm sạch", AMBER)

    band(ws,"B29:AR29","Q6+Q8 — Ma trận 3 tầng lỗi · Q7 — Reconciliation tồn kho")
    set_widths(ws,"B",[10,32,30,24,20,22,9])
    render_table(ws,'tiers',"B31","3 tầng lỗi — 3 chỉ số — 3 người sửa", None, hdr_color=SLATE)
    ws.Range("B36").Value="Q7 — Reconciliation tồn kho: InventoryValue = OnHandQty × StandardCost"
    ws.Range("B36").Font.Bold=True; ws.Range("B36").Font.Color=SLATE; ws.Range("B36").Font.Size=9.5
    ws.Range("B37").Value="→ 864 / 865 = 99,88% khớp. Dòng lệch duy nhất: VT999 (không có StandardCost)."
    ws.Range("B37").Font.Size=9.5; ws.Range("B37").Font.Color=INK

    band(ws,"B40:AR40","Q1+Q2+Q3 — Bảng audit 11 vấn đề (cột Hint: 5/11 do phân tích tự tìm)")
    render_table(ws,'audit',"B42","", None, hdr_color=SLATE)

    band(ws,"B58:AR58","Q9 — PV Score theo nhân viên (χ²=4,716; p=0,194 — chênh lệch KHÔNG có ý nghĩa thống kê)")
    pv=ws_by('pv_score'); npv=pv.UsedRange.Rows.Count
    normal_chart(ws, pv.Range(f"A1:A{npv},D1:D{npv}"), xlColumnClustered, "B60","T74","Vi phạm % theo nhân viên", VIOLET, axfmt='0"%"')
    set_widths(ws,"V",[6,8,54])
    render_table(ws,'checklist',"V60","Q10+Q11 — Checklist rule (9 Hard · 4 Soft)", None, hdr_color=SLATE)

    note(ws,"B76","AR87",[
      "NGUYÊN TẮC & GIỚI HẠN:",
      "• Gắn cờ (flag), KHÔNG xóa (delete) — trừ dòng trùng hoàn toàn index 450. Xóa dòng fact làm sai tổng doanh thu và mất bằng chứng quy trách nhiệm.",
      "• 48 dòng cùng OrderNo+LineNo khác nội dung KHÔNG phải lỗi — OrderNo chưa từng là khóa.",
      "• Trang này KHÔNG trả lời được: vì sao VT018 tồn âm, ai nhập UnitPrice=0, vì sao QtyOrder=900 (thiếu CreatedBy/log hệ thống).",
    ])
    ws.Range("A1").Select()
    print('DB3 done')

try:
    build_db1()
    build_db2()
    build_db3()
    xl.ScreenUpdating=True
    if os.path.exists(OUT): os.remove(OUT)
    wb.SaveAs(OUT, FileFormat=51)
    print('Saved', OUT)
finally:
    try: wb.Close(SaveChanges=False)
    except: pass
    xl.Quit()
    print('Excel closed')
