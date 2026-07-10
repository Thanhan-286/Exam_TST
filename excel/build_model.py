# -*- coding: utf-8 -*-
"""
Bước 1: Làm sạch Data_set.xlsx theo analysis.md + ERRATA.md, tính metric,
xây data model phẳng cho Excel, và VERIFY khớp các con số chốt.
Xuất: excel/model.xlsx (data model) — chưa có dashboard.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import pandas as pd
import numpy as np

SRC = 'data/Data_set.xlsx'
OUT = 'excel/model.xlsx'

xl = pd.ExcelFile(SRC)
fs   = xl.parse('fact_sales_orders')
inv  = xl.parse('fact_inventory_EOM')
prod = xl.parse('dim_product')
cust = xl.parse('dim_customer')
wh   = xl.parse('dim_warehouse')
plan = xl.parse('plan_monthly_sales')

# src_row_index để truy vết (0-based như analysis.md)
fs = fs.reset_index(drop=True)
fs['src_row_index'] = fs.index

# ---------- LÀM SẠCH fact_sales ----------
# Ràng buộc CLAUDE.md #1: KHÔNG dedupe theo (OrderNo,LineNo).
#   Chỉ xóa dòng trùng thật index 450 (giữ 20) + dòng Qty=900 index 451.
DROP = [450, 451]
fs_clean = fs[~fs['src_row_index'].isin(DROP)].copy()
assert len(fs_clean) == 450, f"Expect 450 rows, got {len(fs_clean)}"

# ---------- JOIN DIM ----------
fs_clean = fs_clean.merge(
    cust[['CustomerCode','CustomerName','Region','Channel','CustomerStatus']]
        .rename(columns={'Region':'CustRegion','Salesperson':'AcctSalesperson'}),
    on='CustomerCode', how='left')
fs_clean = fs_clean.merge(
    prod[['ItemCode','ItemName','CategoryCode','CategoryName','StandardCost',
          'ListPrice','ItemStatus','ABC_Class']],
    on='ItemCode', how='left')
fs_clean = fs_clean.merge(
    wh[['WarehouseCode','WarehouseName','Region']].rename(columns={'Region':'WhRegion'}),
    on='WarehouseCode', how='left')

# Vùng khách cho DB1 (Unknown nếu KH999)
fs_clean['CustRegion'] = fs_clean['CustRegion'].fillna('(Unknown)')
fs_clean['CategoryName'] = fs_clean['CategoryName'].fillna('(Unknown)')

# ---------- METRIC DÒNG ----------
fs_clean['Month'] = pd.to_datetime(fs_clean['DocDate']).dt.strftime('%Y-%m')
# Revenue Net: mọi dòng != Cancelled. (Cancelled có QtyDelivered=0)
fs_clean['RevenueNet'] = np.where(
    fs_clean['DocStatus'].ne('Cancelled'),
    fs_clean['QtyDelivered'] * fs_clean['UnitPrice'] * (1 - fs_clean['DiscountPct']),
    0.0)
# COGS chỉ khi có StandardCost (VT999 = NULL)
fs_clean['COGS'] = np.where(
    fs_clean['DocStatus'].ne('Cancelled') & fs_clean['StandardCost'].notna(),
    fs_clean['QtyDelivered'] * fs_clean['StandardCost'], np.nan)
fs_clean['GrossProfit'] = fs_clean['RevenueNet'] - fs_clean['COGS'].fillna(0)
fs_clean['HasCost'] = fs_clean['StandardCost'].notna()
# On-time: chỉ dòng đã có ActualDeliveryDate
add = pd.to_datetime(fs_clean['ActualDeliveryDate'], errors='coerce')
due = pd.to_datetime(fs_clean['DeliveryDueDate'], errors='coerce')
fs_clean['Delivered'] = add.notna()
fs_clean['OnTime'] = np.where(add.notna(), (add <= due), np.nan)
fs_clean['DaysLate'] = (add - due).dt.days
# Fill Rate scope + positive orders
fs_clean['FillScope'] = fs_clean['DocStatus'].isin(['Completed','Open']) & (fs_clean['QtyOrder']>0)
fs_clean['IsReturn'] = fs_clean['DocStatus'].eq('Return')

# --- Cột phụ để KPI ratio biểu diễn được bằng Calculated Field trong Pivot ---
# (calc field = SUM(tử)/SUM(mẫu) → tự phản ứng theo Slicer)
fs_clean['RevHasCost'] = np.where(fs_clean['HasCost'], fs_clean['RevenueNet'], 0.0)   # mẫu GM%
fs_clean['GPHasCost']  = np.where(fs_clean['HasCost'], fs_clean['GrossProfit'], 0.0)  # tử GM%
fs_clean['QtyDelivFill'] = np.where(fs_clean['FillScope'], fs_clean['QtyDelivered'], 0.0)
fs_clean['QtyOrderFill'] = np.where(fs_clean['FillScope'], fs_clean['QtyOrder'], 0.0)
fs_clean['OnTimeNum'] = np.where(fs_clean['Delivered'] & (fs_clean['OnTime']==1), 1.0, 0.0)
fs_clean['OnTimeDen'] = np.where(fs_clean['Delivered'], 1.0, 0.0)
fs_clean['ReturnVal'] = np.where(fs_clean['IsReturn'], fs_clean['RevenueNet'], 0.0)
# GrossProfit hiển thị Top/Bottom sản phẩm chỉ tính dòng có cost
fs_clean['GPForRank'] = fs_clean['GPHasCost']

# ================= VERIFY DB1 =================
def vfy(name, got, exp, tol=1.0):
    ok = abs(got-exp) <= tol
    print(f"[{'OK ' if ok else 'FAIL'}] {name}: got={got:,.2f} exp={exp:,.2f}")
    return ok
results=[]
rev = fs_clean['RevenueNet'].sum()
results.append(vfy('Revenue Net', rev, 5_208_670_650))
gm = fs_clean.loc[fs_clean['HasCost'],'GrossProfit'].sum()
results.append(vfy('Gross Margin', gm, 888_400_150))
gm_denom = fs_clean.loc[fs_clean['HasCost'],'RevenueNet'].sum()
results.append(vfy('GM denom', gm_denom, 5_171_840_150))
gmp = gm/gm_denom*100
results.append(vfy('GM %', gmp, 17.18, 0.02))
fr = (fs_clean.loc[fs_clean['FillScope'],'QtyDelivered'].sum()
      / fs_clean.loc[fs_clean['FillScope'],'QtyOrder'].sum())*100
results.append(vfy('Fill Rate %', fr, 87.21, 0.05))
otd = fs_clean.loc[fs_clean['Delivered'],'OnTime'].mean()*100
results.append(vfy('OTD %', otd, 37.27, 0.05))
ret = fs_clean.loc[fs_clean['IsReturn'],'RevenueNet'].sum()
results.append(vfy('Return value', ret, -107_785_450))

# Revenue theo tháng (đối chiếu §4.3)
mrev = fs_clean.groupby('Month')['RevenueNet'].sum()
results.append(vfy('Rev 2026-05', mrev.get('2026-05',0), 1_512_309_680))
# Revenue theo vùng khách
rrev = fs_clean.groupby('CustRegion')['RevenueNet'].sum()
results.append(vfy('Rev Mien Bac', rrev.get('Miền Bắc',0), 1_947_827_200))

# ---------- ACHIEVEMENT INDEX ----------
# Actual trong phạm vi plan: có CustRegion hợp lệ VÀ có Category (loại KH999,VT999)
in_scope = fs_clean[(fs_clean['CustRegion']!='(Unknown)') &
                    (fs_clean['CategoryName']!='(Unknown)')].copy()
act_total = in_scope['RevenueNet'].sum()
tgt_total = plan['TargetRevenue'].sum()
base = act_total/tgt_total
results.append(vfy('Achievement base %', base*100, 6.07, 0.02))
results.append(vfy('Plan total', tgt_total, 84_602_000_000))

# Index theo region
plan_r = plan.groupby('Region')['TargetRevenue'].sum()
act_r  = in_scope.groupby('CustRegion')['RevenueNet'].sum()
idx_r  = (act_r/plan_r)/base*100
print('\nAchievement Index theo vùng:')
print(idx_r.round(1).to_string())

print('\n================= INVENTORY (DB2) =================')
# EOM mới nhất
inv['MonthEnd'] = pd.to_datetime(inv['MonthEnd'])
latest = inv['MonthEnd'].max()
inv_latest = inv[inv['MonthEnd']==latest].copy()
# convert serial date
inv['LastReceiptDate_conv'] = pd.to_datetime('1899-12-30') + pd.to_timedelta(inv['LastReceiptDate'], 'D')
inv_latest['LastReceiptDate_conv'] = pd.to_datetime('1899-12-30') + pd.to_timedelta(inv_latest['LastReceiptDate'],'D')
# loại VT999 orphan cho tổng
inv_valid = inv_latest[inv_latest['ItemCode']!='VT999'].copy()
inv_valid = inv_valid.merge(prod[['ItemCode','ItemName','CategoryName','StandardCost',
                                  'ListPrice','ItemStatus','ABC_Class']], on='ItemCode', how='left')
inv_valid = inv_valid.merge(wh[['WarehouseCode','WarehouseName','Region']]
                            .rename(columns={'Region':'WhRegion'}), on='WarehouseCode', how='left')
tot_inv = inv_valid['InventoryValue'].sum()
results.append(vfy('Tong gia tri ton (loai VT999)', tot_inv, 6_391_770_000))
results.append(vfy('Tong so luong ton', inv_valid['OnHandQty'].sum(), 10_175))

# sold6m theo item: DocStatus in (Completed, Return) — ERRATA E2
sold6m = (fs[fs['DocStatus'].isin(['Completed','Return'])]
          .groupby('ItemCode')['QtyDelivered'].sum())
# item-level inventory (sum qua kho)
item_inv = inv_valid.groupby(['ItemCode','ItemName','CategoryName','ABC_Class','ItemStatus'], as_index=False).agg(
    OnHandQty=('OnHandQty','sum'), InventoryValue=('InventoryValue','sum'))
item_inv['Sold6m'] = item_inv['ItemCode'].map(sold6m).fillna(0)
item_inv['MOC'] = np.where(item_inv['Sold6m']>0, item_inv['OnHandQty']/(item_inv['Sold6m']/6), np.nan)
median_val = item_inv['InventoryValue'].median()
print(f"Median InventoryValue (item-level) = {median_val:,.0f} (exp 127.610.000)")
item_inv['SlowHeavy'] = (item_inv['InventoryValue']>median_val) & (item_inv['MOC']>12)
sh = item_inv[item_inv['SlowHeavy']]
results.append(vfy('Slow&Heavy count', len(sh), 9, 0))
results.append(vfy('Slow&Heavy value', sh['InventoryValue'].sum(), 2_402_800_000))

# Tồn âm tại EOM mới nhất
neg = inv_valid[inv_valid['OnHandQty']<0]
results.append(vfy('Tồn âm (dòng) tại 30/06', len(neg), 4, 0))
# Discontinued còn tồn
disc = item_inv[(item_inv['ItemStatus']=='Discontinued') & (item_inv['OnHandQty']>0)]
results.append(vfy('Discontinued value', disc['InventoryValue'].sum(), 580_050_000))

print('\n=== KẾT QUẢ VERIFY:', sum(results), '/', len(results), 'PASS ===')

# ================= GHI MODEL =================
import os
os.makedirs('excel', exist_ok=True)
# row-level inventory latest (cho ma trận kho×nhóm, tồn âm)
inv_row = inv_valid[['ItemCode','ItemName','CategoryName','ABC_Class','ItemStatus',
                     'WarehouseCode','WarehouseName','WhRegion','OnHandQty','InventoryValue',
                     'SafetyStock','LastReceiptDate_conv']].copy()
inv_row['BelowSafety'] = inv_row['OnHandQty'] < inv_row['SafetyStock']
inv_row['Negative'] = inv_row['OnHandQty'] < 0
# map cờ item-level xuống row-level để KPI pivot phản ứng theo Slicer
sh_items = set(sh['ItemCode'])
inv_row['SlowHeavy'] = inv_row['ItemCode'].isin(sh_items)
inv_row['SlowHeavyValue'] = np.where(inv_row['SlowHeavy'], inv_row['InventoryValue'], 0.0)
inv_row['DiscStock'] = (inv_row['ItemStatus']=='Discontinued') & (inv_row['OnHandQty']>0)
inv_row['DiscStockValue'] = np.where(inv_row['DiscStock'], inv_row['InventoryValue'], 0.0)
inv_row['BelowSafetyN'] = inv_row['BelowSafety'].astype(int)
inv_row['NegN'] = inv_row['Negative'].astype(int)

# ---------- BẢNG TỔNG HỢP ACHIEVEMENT INDEX (chỉ đọc cấp tổng hợp) ----------
def ach_table(dim_fact, dim_plan):
    a = in_scope.groupby(dim_fact)['RevenueNet'].sum().rename('Actual')
    t = plan.groupby(dim_plan)['TargetRevenue'].sum().rename('Target')
    d = pd.concat([a, t], axis=1).dropna()
    d['PctAchieved'] = d['Actual']/d['Target']*100
    d['Index'] = (d['Actual']/d['Target'])/base*100
    return d.reset_index().rename(columns={dim_fact:'Group'})
# Month plan key khác định dạng → build riêng
_pm = plan.copy(); _pm['Month'] = pd.to_datetime(_pm['MonthStart']).dt.strftime('%Y-%m')
a_m = in_scope.groupby('Month')['RevenueNet'].sum().rename('Actual')
t_m = _pm.groupby('Month')['TargetRevenue'].sum().rename('Target')
ach_month = pd.concat([a_m,t_m],axis=1).dropna()
ach_month['PctAchieved']=ach_month['Actual']/ach_month['Target']*100
ach_month['Index']=(ach_month['Actual']/ach_month['Target'])/base*100
ach_month=ach_month.reset_index().rename(columns={'Month':'Group'})
ach_region = ach_table('CustRegion','Region')
_cat = plan.groupby('CategoryName')['TargetRevenue'].sum().rename('Target')
a_c = in_scope.groupby('CategoryName')['RevenueNet'].sum().rename('Actual')
ach_cat = pd.concat([a_c,_cat],axis=1).dropna()
ach_cat['PctAchieved']=ach_cat['Actual']/ach_cat['Target']*100
ach_cat['Index']=(ach_cat['Actual']/ach_cat['Target'])/base*100
ach_cat=ach_cat.reset_index().rename(columns={'CategoryName':'Group'})
print('\nAch Index tháng:', dict(zip(ach_month['Group'],ach_month['Index'].round(1))))
print('Ach Index nhóm :', dict(zip(ach_cat['Group'],ach_cat['Index'].round(1))))

# audit table DB3 (từ analysis §6.3)
audit = pd.DataFrame([
 [1,'No','Không có khóa tự nhiên','SO','toàn bộ','-293,1 tr nếu dedupe sai','H1'],
 [2,'Yes','Dòng trùng thật SO2602-0137|1','SO','2','-11.956.000','H2'],
 [3,'Yes','Orphan FK KH999/VT999','SO,INV','6','74,5 tr ngoài grain plan','H3'],
 [4,'Yes','UnitPrice = 0','SO','1','Biên âm','H4'],
 [5,'Yes','DiscountPct = 65%','SO','1','917.700','S1'],
 [6,'Yes','QtyOrder = 900 (bất khả thi)','SO','1','-135.000.000','H7+H9'],
 [7,'Yes','Tồn âm 14 dòng (4 còn âm 30/06)','INV','14','-','H5'],
 [8,'Yes','LastReceiptDate là Excel serial','INV','865','Aging sai','H6'],
 [9,'No','fact.Salesperson != dim.Salesperson (76%)','SO','344','Báo cáo NV sai','D1'],
 [10,'No','Plan & fact khác phạm vi (16,48x)','PLAN','108','KPI ko đọc được','D2'],
 [11,'No','InventoryValue là cột dẫn xuất','INV','865','Cột thừa','D3'],
], columns=['No','Hint','Issue','Table','Rows','MoneyImpact','Rule'])

# PV score theo nhân viên (§6.5b)
pv = pd.DataFrame([
 ['NV Dũng',109,21],['NV Bình',114,17],['NV An',115,14],['NV Chi',114,11]
], columns=['Salesperson','Sales','Violations'])
pv['Pct'] = (pv['Violations']/pv['Sales']*100).round(1)

# waterfall DB3 (§3.2)
wf = pd.DataFrame([
 ['A. Gross Revenue',5_463_412_100],
 ['B. Trừ dòng trùng',-11_956_000],
 ['C. Trừ Qty=900',-135_000_000],
 ['D. Trừ hàng trả',-107_785_450],
], columns=['Step','Value'])

# Top/Bottom sản phẩm theo Gross Profit (dòng có cost)
prod_gp = (fs_clean[fs_clean['HasCost']].groupby(['ItemCode','ItemName'], as_index=False)
           .agg(RevenueNet=('RevenueNet','sum'), GrossProfit=('GPHasCost','sum')))
prod_gp['GMpct'] = prod_gp['GrossProfit']/prod_gp['RevenueNet']*100
prod_gp['SlowHeavy'] = prod_gp['ItemCode'].isin(sh_items)
prod_gp = prod_gp.sort_values('GrossProfit', ascending=False)

# scatter slow&heavy (cột liền nhau cho bubble chart): MOC, InventoryValue, OnHandQty, ItemName, ABC
scatter = item_inv[['MOC','InventoryValue','OnHandQty','ItemName','ABC_Class','SlowHeavy']].copy()
scatter = scatter.dropna(subset=['MOC'])

# reconciliation cumulative (DB3)
recon = pd.DataFrame([
 ['A. Gross Revenue', 5_463_412_100],
 ['B. − Dòng trùng',  5_451_456_100],
 ['C. − Qty=900',     5_316_456_100],
 ['D. − Hàng trả',    5_208_670_650],
], columns=['Step','Cumulative'])
scenarios = pd.DataFrame([
 ['Làm sạch ĐÚNG', 5_208_670_650],
 ['KHÔNG làm sạch', 5_355_626_650],
 ['Dedupe SAI',     4_915_616_000],
], columns=['Scenario','RevenueNet'])
# checklist rule
checklist = pd.DataFrame([
 ['H1','Hard','Fact table phải có surrogate primary key'],
 ['H2','Hard','Chặn insert bản ghi giống hệt bản đã tồn tại'],
 ['H3','Hard','FK Customer/Item/Warehouse phải tồn tại trong dim'],
 ['H4','Hard','UnitPrice > 0'],
 ['H5','Hard','OnHandQty ≥ 0 tại thời điểm chốt sổ'],
 ['H6','Hard','Ép kiểu date cho mọi cột ngày tại ETL'],
 ['H7','Hard','Chặn mã đơn có hậu tố sentinel (9999, 0000)'],
 ['H8','Hard','Không cho chọn master Status ≠ Active khi tạo đơn'],
 ['H9','Hard','QtyDelivered ≤ OnHandQty(Item,Warehouse) — cross 2 fact'],
 ['S1','Soft','DiscountPct > 20% (P95=P99=10%)'],
 ['S2','Soft','QtyOrder > 3 × P99 theo item'],
 ['S3','Soft','UnitPrice×(1−Disc) < StandardCost (bán dưới vốn)'],
 ['S4','Soft','ActualDeliveryDate > DeliveryDueDate (giao trễ)'],
], columns=['Rule','Type','Description'])
# ma trận 3 tầng lỗi
tiers = pd.DataFrame([
 ['Dữ liệu','Có ghi đúng cái đã xảy ra không?','DQ Score','97,79% (SO) / 98,27% (INV)','Người nhập liệu / ETL'],
 ['Quy trình','Cái đã xảy ra có được phép không?','PV Score','13,94%','Quản lý bán hàng'],
 ['Thiết kế','Hệ thống có đúng không?','Không đo bằng %','—','IT / kiến trúc dữ liệu'],
], columns=['Tier','Question','Metric','Value','Owner'])
# bảng tồn âm & discontinued (DB2)
neg_tbl = inv_row[inv_row['Negative']][['ItemCode','ItemName','WarehouseName','OnHandQty','SafetyStock']].copy()
disc_tbl = item_inv[(item_inv['ItemStatus']=='Discontinued') & (item_inv['OnHandQty']>0)][
    ['ItemCode','ItemName','OnHandQty','InventoryValue']].copy()

with pd.ExcelWriter(OUT, engine='openpyxl') as w:
    fs_clean.to_excel(w, sheet_name='fact_sales', index=False)
    item_inv.to_excel(w, sheet_name='inv_item', index=False)
    inv_row.to_excel(w, sheet_name='inv_row', index=False)
    plan.to_excel(w, sheet_name='plan', index=False)
    prod.to_excel(w, sheet_name='dim_product', index=False)
    cust.to_excel(w, sheet_name='dim_customer', index=False)
    wh.to_excel(w, sheet_name='dim_warehouse', index=False)
    prod_gp.to_excel(w, sheet_name='prod_gp', index=False)
    ach_month.to_excel(w, sheet_name='ach_month', index=False)
    ach_region.to_excel(w, sheet_name='ach_region', index=False)
    ach_cat.to_excel(w, sheet_name='ach_cat', index=False)
    scatter.to_excel(w, sheet_name='scatter', index=False)
    recon.to_excel(w, sheet_name='recon', index=False)
    scenarios.to_excel(w, sheet_name='scenarios', index=False)
    checklist.to_excel(w, sheet_name='checklist', index=False)
    tiers.to_excel(w, sheet_name='tiers', index=False)
    neg_tbl.to_excel(w, sheet_name='neg_tbl', index=False)
    disc_tbl.to_excel(w, sheet_name='disc_tbl', index=False)
    audit.to_excel(w, sheet_name='audit', index=False)
    pv.to_excel(w, sheet_name='pv_score', index=False)
    wf.to_excel(w, sheet_name='waterfall', index=False)
print(f"\nĐã ghi {OUT}")
print('fact_sales rows:', len(fs_clean), '| inv_item:', len(item_inv), '| inv_row:', len(inv_row))
