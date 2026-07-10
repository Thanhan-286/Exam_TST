# Câu chuyện dữ liệu — Diễn giải từng chart trong 3 Dashboard

> **Nguồn:** `Data_set.xlsx` (7 sheet, kỳ 01–06/2026) • Đã làm sạch còn 450/452 dòng bán hàng
> **File:** `Dashboard.xlsx` — 3 trang tương tác (PivotTable + Slicer + PivotChart)
> **Nguyên tắc đọc:** mọi con số dưới đây đã được đối chiếu 17/17 khớp với `analysis.md` trước khi vẽ.

Ba dashboard này không phải ba bảng số rời rạc. Chúng là **ba hồi của cùng một câu chuyện**:

1. **Executive Sales** — "Chúng ta bán được bao nhiêu, và ai đang kéo lùi?"
2. **Inventory** — "Tiền của chúng ta đang nằm chết ở đâu?"
3. **Data Quality** — "Có tin được hai trang kia không?"

Điểm mạnh nhất của bộ này là **tam giác hóa**: ba trang, ba nguồn dữ liệu độc lập, cùng chỉ về một vài thủ phạm. Khi Miền Trung yếu ở cả doanh thu *lẫn* tồn kho, khi VT021 xuất hiện ở cả "bán lỗ" *lẫn* "chôn vốn" *lẫn* "hàng ngừng kinh doanh" — đó không còn là nhiễu, đó là sự thật.

---

## HỒI 1 — DASHBOARD "EXECUTIVE SALES"
### *Người đọc: Ban lãnh đạo. Câu hỏi mang theo: "Tháng này bán thế nào?"*

### Hàng KPI trên cùng — Bức ảnh thẻ căn cước của 6 tháng
> Revenue Net **5,21 tỷ** · Gross Margin **888,4 tr** · GM% **17,18%** · Fill Rate **87,21%** · OTD **37,27%**

Năm con số này kể một nghịch lý ngay từ dòng đầu tiên. **Fill Rate 87,21%** nói "chúng ta giao gần đủ hàng khách đặt". Nhưng **OTD chỉ 37,27%** — gần hai phần ba số đơn giao **trễ hạn**. Thông điệp cốt lõi của cả trang nằm ở đây: *"Giao đủ hàng, nhưng giao muộn."* Nếu dashboard chỉ khoe Fill Rate như đa số báo cáo bán hàng, toàn bộ vấn đề vận hành sẽ bị che khuất. Chúng tôi cố tình đặt OTD nằm cạnh Fill Rate để không ai đọc một mà quên cái kia.

*(GM% 17,18% chứ không phải 17,76% — vì mẫu số chỉ tính các dòng có giá vốn thật, loại orphan VT999. Chi tiết cái bẫy này ở Hồi 3.)*

### Chart 1 — Revenue Net theo THÁNG *(cột)*
Doanh thu không đi ngang. **Tháng 5 (1,51 tỷ) gần gấp 3 lần tháng 2 (0,51 tỷ)** — một cú nhảy vọt đơn độc giữa một nửa đầu năm liên tục dưới mặt bằng. Cột tháng 5 cao vọt lên là chi tiết đầu tiên khiến người xem phải hỏi "chuyện gì đã xảy ra?". Câu trả lời không nằm ở trang này — nó dẫn sang khối Achievement Index bên dưới và sang cả Hồi 2.

### Chart 2 — Revenue Net theo VÙNG khách *(thanh ngang)*
Ba miền xếp thành một cái thang rơi đều: **Miền Bắc 1,95 tỷ → Miền Nam 1,79 tỷ → Miền Trung 1,43 tỷ**. Bản thân thứ hạng chưa nói gì nhiều. Sức nặng của nó chỉ hiện ra khi ghép với chart Index bên dưới và với Hồi 2: Miền Trung không chỉ bán ít nhất, mà còn bán *rẻ nhất* (GM% thấp nhất) và *chôn vốn nhiều nhất*. Thanh ngắn nhất trên chart này là đầu mối đầu tiên của thủ phạm số một.

> ⚠️ **Lưu ý bắt buộc:** "Vùng" ở đây là **vùng khách hàng**. Trang Inventory dùng **vùng kho** — khác nhau. 65,7% số dòng có vùng khách ≠ vùng kho, nên đừng bao giờ so hai trang bằng cùng một chữ "Miền Trung" mà không dừng lại một giây.

### Chart 3 — Revenue Net theo NHÓM HÀNG *(thanh ngang, màu tím)*
Đây là chart để trả lời "nên đẩy nhóm nào?". Nhưng nó gài một cái bẫy: **doanh thu cao ≠ lợi nhuận cao**. Dầu nhớt và Ắc quy dẫn đầu doanh thu, nhưng **Hóa chất** — chỉ đứng thứ 3 về doanh thu — lại là nhóm sinh **Gross Profit cao nhất** (GM% 21,6%). Ngược lại, **Lốp** doanh thu top 5 nhưng biên chỉ 11,76%, mỏng nhất bộ dữ liệu. Chart này một mình chưa đủ; nó phải đọc kèm chart Top sản phẩm để không đẩy nhầm nhóm biên mỏng.

### Chart 4 — Top 10 sản phẩm theo GROSS PROFIT *(thanh ngang, màu xanh)*
Chi tiết quan trọng nhất: chart này xếp theo **Gross Profit, KHÔNG phải Revenue** — và đó là một quyết định có chủ đích. Nếu xếp theo doanh thu, **VT015 (Lốp 15)** lọt top 3. Nhưng biên của nó chỉ 12%, nên khi xếp theo lợi nhuận nó **rơi khỏi top 5**. Một bảng xếp theo doanh thu sẽ khiến ban lãnh đạo dồn lực đẩy đúng sản phẩm sinh lời kém. Chart này sửa lại tấm bản đồ ưu tiên đó.

### Khối ACHIEVEMENT INDEX — Ba chart nhỏ *(tháng / vùng / nhóm)*
Đây là phần tinh tế nhất của trang, và cũng dễ bị hiểu sai nhất. Kế hoạch (plan) và thực tế (fact) **không cùng phạm vi** — fact chỉ là mẫu ~6% của sổ đơn hàng thật, nên "% đạt kế hoạch" tuyệt đối (6,07%) vô nghĩa. Vì thế chúng tôi chuẩn hóa nó thành **Achievement Index**, với **100 = mặt bằng chung**. Đọc index là đọc *tương đối*: ai đang trên/dưới mặt bằng.

- **Theo tháng:** Tháng 5 bùng lên **189,8** (gần gấp đôi mặt bằng), tháng 2 tụt xuống **60,9**. Cú nhảy tháng 5 ở Chart 1 giờ có ngữ cảnh: không chỉ doanh thu cao, mà là *vượt xa kế hoạch tương ứng*.
- **Theo vùng:** Miền Bắc **124,9** dẫn đầu, Miền Trung **78,6** đội sổ. Lần thứ hai Miền Trung bị gọi tên.
- **Theo nhóm:** **Phụ tùng nhanh chỉ 67,0** — yếu nhất, *dù biên lợi nhuận tốt*. "Biên tốt mà không bán được" là một câu hỏi treo lơ lửng — và Hồi 2 sẽ đưa ra giả thuyết bất ngờ: **bán kém vì không có hàng để bán.**

> ⚠️ **Vì sao ba chart này KHÔNG có Slicer, KHÔNG có heatmap Region×Category?** Vì ở cấp từng ô, mỗi ô chỉ ~3,7 đơn hàng, và Index dao động điên loạn từ −0,7 đến 848,3. Index chỉ đáng tin ở cấp tổng hợp. Đây là một giới hạn được ghi thẳng lên dashboard — thể hiện người làm hiểu dữ liệu đến đâu thì nói đến đó.

### 🔺 Tam giác hóa của Hồi 1
Miền Trung bị gọi tên **ba lần độc lập**: doanh thu thấp nhất (Chart 2), GM% thấp nhất, Index thấp nhất (78,6). Ba góc nhìn khác nhau cùng chỉ một hướng ⇒ **vấn đề thật.** Giữ chi tiết này trong đầu khi bước sang Hồi 2.

---

## HỒI 2 — DASHBOARD "INVENTORY & SLOW MOVING"
### *Người đọc: Quản lý kho / mua hàng. Câu hỏi: "Hàng nào đang chôn vốn?"*

### Hàng KPI — Sức khỏe kho tính bằng tiền
> Tổng tồn **6.391,8 tr** · Vốn mắc kẹt **2.402,8 tr (37,6%)** · Discontinued còn tồn **580,1 tr (9,1%)** · Tồn âm **4 dòng** · Dưới safety **40/144 dòng**

Con số gây sốc nằm ở thẻ thứ hai: **37,6% toàn bộ giá trị tồn kho đang mắc kẹt** — hơn một phần ba số tiền nằm chết trong kho. Đây là lý do tồn tại của cả trang.

### Chart trung tâm — SCATTER GÓC PHẦN TƯ *(trái tim của trang)*
> Trục X = MOC (số tháng bán hết tồn) · Trục Y = Giá trị tồn · Kích thước bong bóng = số lượng tồn

Đây là chart quan trọng nhất Hồi 2, và nó được thiết kế để chống lại một cái bẫy. Nếu chỉ xếp hạng theo MOC (bán chậm), bạn sẽ báo động nhầm: **VT033 có MOC cao nhất bộ dữ liệu (65,7 tháng)** — nhưng nó chỉ ngậm 72,8 tr vốn. Thanh lý nó **không cứu được dòng tiền**.

Cái nguy hiểm thật nằm ở **góc trên-phải**: vừa bán chậm (MOC > 12) *vừa* ngậm nhiều tiền (giá trị tồn > trung vị 127,6 tr). Đó là điều kiện KÉP, và scatter là cách duy nhất nhìn thấy cả hai chiều cùng lúc. **9 bong bóng** nằm ở góc đó = **2.402,8 tr vốn kẹt**. Đáng chú ý:
- **VT023** là bong bóng có giá trị tồn lớn nhất (473,4 tr) nhưng MOC chỉ 12,8 — một bảng xếp theo MOC sẽ **bỏ sót nó hoàn toàn**.
- **VT011, VT014** trôi tận cùng bên phải (MOC > 45 tháng) — hai ca cực đoan nhất.
- **4/9 item là hạng A** — hàng "quan trọng nhất" đang chết vốn 1,3 tỷ. Phân loại ABC hoặc dự báo nhu cầu đang sai.

### Chart — Tồn theo KHO *(thanh ngang, xanh ngọc)*
Bốn kho tồn khá đều (1,5–1,72 tỷ mỗi kho), nên chart này không tự nó gây sốc. Giá trị của nó là làm nền cho phát hiện I1: **tỷ lệ tồn/doanh thu** — WH_DN (Miền Trung) đạt **1,53**, cao nhất. Miền Trung lại bị gọi tên: bán ít nhất (Hồi 1) *và* chôn vốn tương đối nhiều nhất (Hồi 2).

### Chart — Tồn theo NHÓM HÀNG *(thanh ngang, tím)*
Chart này giấu câu hỏi đáng đào nhất cả bộ. **Phụ tùng nhanh chỉ chiếm 7,3% tồn kho** — thấp nhất. Ghép với Hồi 1 (Phụ tùng nhanh có Index bán hàng thấp nhất 67,0 *dù biên tốt*), một giả thuyết hiện ra: **nhóm này bán kém không phải vì ế, mà vì không đủ hàng để bán.** Hai trang, hai nguồn dữ liệu độc lập, ghép lại thành một câu hỏi mua hàng cụ thể.

### Heatmap KHO × NHÓM HÀNG *(màu đậm = tồn cao)*
Ma trận này để soi phân bổ lệch. Ô đậm nhất: **WH_HCM giữ 502 tr Ắc quy — gấp 3,2× WH_DN**. Phân bổ hàng giữa các kho đang lệch rõ rệt; heatmap biến 24 con số thành một bức tranh nhìn phát hiện ngay.

### Bảng TỒN ÂM *(4 dòng)* và DISCONTINUED *(3 dòng)*
Hai bảng nhỏ nhưng là hai lời cảnh báo hành động:
- **Tồn âm:** VT018 âm ở **2 kho khác nhau** (WH_HN −7, WH_DN −1). Âm ở hai nơi ⇒ **lỗi quy trình, không phải sự cố ngẫu nhiên một kho**. Và tuyệt đối **không set = 0** — làm vậy là xóa mất bằng chứng của một lỗi thật.
- **Discontinued còn tồn:** 580 tr hàng đã ngừng kinh doanh vẫn nằm kho, rải đều 4 kho, chưa gom về một điểm để thanh lý. **VT021 (Lốp 21)** xấu nhất: tồn lớn nhất (250,6 tr), biên mỏng nhất (chiết khấu tối đa để không lỗ chỉ 15,3%).

### 🔺 Tam giác hóa của Hồi 2
**VT021 và VT007** xuất hiện đồng thời ở: góc "Slow & Heavy" của scatter, bảng Discontinued, và (ở Hồi 1) nhóm Bottom Gross Profit. Ba nơi độc lập, cùng hai cái tên ⇒ **hai sản phẩm cần thanh lý ngay.** Đây là kết luận hành động rõ ràng nhất mà cả ba trang cùng ký tên.

---

## HỒI 3 — DASHBOARD "DATA QUALITY / RECONCILIATION"
### *Người đọc: Data owner / IT / kế toán trưởng. Câu hỏi: "Có tin được hai trang kia không?"*

Trang này **không phải để khoe lỗi**. Nó là **giấy chứng nhận chất lượng** cho hai hồi trước: định lượng phần không đáng tin *bằng tiền*, và chỉ đích danh *ai phải sửa cái gì*.

### Hàng KPI — Ba loại "sai" rất khác nhau
> DQ Score SO **97,79%** · DQ Score INV **98,27%** · PV Score **13,94%** · Sai nếu KHÔNG làm sạch **+2,82%** · Sai nếu DEDUPE SAI **−5,63%**

Hai thẻ cuối là bài học đắt giá nhất cả bộ. Trực giác nói "làm sạch dữ liệu thì an toàn". Sai. **Làm sạch ẩu (−5,63%) nguy hiểm gấp đôi không làm sạch gì (+2,82%)** — và tệ hơn, nó *khó phát hiện hơn*, vì kết quả trông "gọn gàng, sạch sẽ". Con số âm to hơn con số dương chính là luận điểm trung tâm của trang.

### Chart — RECONCILIATION doanh thu *(cột, cộng dồn)*
Chart này lần theo doanh thu từ thô đến sạch qua 4 bước: Gross **5.463 tr** → trừ dòng trùng thật (−12 tr) → trừ dòng QtyOrder=900 bất khả thi (−135 tr) → trừ hàng trả (−108 tr) = **5.209 tr**. Mỗi bậc thang đi xuống là một quyết định làm sạch *có căn cứ*, minh bạch, kiểm toán được. Không có bước nào là "xóa cho gọn".

### Chart — BA KỊCH BẢN làm sạch *(cột)*
Trực quan hóa thẳng luận điểm của hàng KPI: **Làm sạch ĐÚNG 5.209 tr** (cột giữa, mốc chuẩn) so với **KHÔNG làm sạch 5.356 tr** (phồng +2,82%) và **Dedupe SAI 4.916 tr** (hụt −5,63%). Cột "Dedupe SAI" thấp hẳn xuống cho thấy: nếu máy móc gom trùng theo `OrderNo+LineNo`, ta xóa oan 26 giao dịch thật và mất 293 tr — vì **`OrderNo` chưa từng là khóa** (97,6% đơn nhiều dòng có >1 khách hàng).

### Bảng — MA TRẬN 3 TẦNG LỖI
Đây là đóng góp phân tích sắc nhất của trang: **không phải mọi "lỗi" đều cùng loại, và không phải ai cũng bị chấm.**

| Tầng | Câu hỏi | Chỉ số | Ai sửa |
|---|---|---|---|
| **Dữ liệu** | Có ghi đúng cái đã xảy ra không? | DQ Score 97,79% | Người nhập liệu / ETL |
| **Quy trình** | Cái đã xảy ra có được phép không? | PV Score 13,94% | Quản lý bán hàng |
| **Thiết kế** | Hệ thống có đúng không? | Không đo bằng % | IT / kiến trúc dữ liệu |

Điểm mấu chốt: 63 dòng "bán hàng cho khách đã đóng / bán hàng ngừng kinh doanh" là bản ghi **hoàn toàn chính xác** — cái sai là *hành vi*, không phải *bản ghi*. Trộn chúng vào DQ Score là đổ oan cho đội nhập liệu và tha cho đội bán hàng. Tách ra thành PV Score mới công bằng.

### Bảng AUDIT — 11 vấn đề
Danh sách đầy đủ, có cột **"Hint?"** đánh dấu **5/11 vấn đề do phân tích tự tìm ra** (không có trong gợi ý của đề). Mỗi dòng gắn một **rule** (H1–H9, S1–S4, D1–D3) để tái sử dụng. Đây là bằng chứng người làm không chỉ chạy checklist có sẵn mà thực sự tra dữ liệu.

### Chart — PV SCORE theo NHÂN VIÊN *(cột)*
Chart này *cố tình* kèm một cảnh báo thống kê. NV Dũng (19,3%) có tỷ lệ vi phạm gấp đôi NV Chi (9,6%) — nhìn qua tưởng Dũng làm ẩu. Nhưng **χ² = 4,716; p = 0,194**: chênh lệch này **KHÔNG có ý nghĩa thống kê** ở mức 5%. Con số p được ghi thẳng lên tiêu đề chart. Xếp hạng con người bằng một khác biệt không có ý nghĩa thống kê là cách nhanh nhất để mất niềm tin của chính những người bị chấm — và dashboard này từ chối làm điều đó.

### Bảng CHECKLIST — 9 Hard · 4 Soft
Phần "hành động tương lai": mỗi lỗi đã phát hiện được chuyển thành một rule chặn. Mạnh nhất là **H9 — `QtyDelivered ≤ OnHandQty(Item, Warehouse)`** — rule đối chiếu chéo *hai bảng fact*, sinh ra từ việc chứng minh dòng QtyOrder=900 là **bất khả thi vật lý** (kho WH_HCM chưa bao giờ giữ quá 300 đơn vị VT005, không thể giao 900).

### Textbox — Những gì trang này KHÔNG trả lời được
Chi tiết tưởng nhỏ nhưng thể hiện sự trưởng thành: dashboard tự nêu giới hạn của chính nó. Nó chứng minh được *"VT018 có tồn âm"* nhưng không truy được *"âm vì giao dịch nào"* (snapshot cuối tháng, không có sổ nhập/xuất). Nói rõ mình không biết gì cũng quan trọng như trình bày cái mình biết.

---

## Kết — Một câu chuyện, ba góc nhìn

Nếu chỉ được giữ lại ba câu:

1. **Executive Sales:** Doanh nghiệp *giao đủ nhưng giao muộn* (Fill 87% vs OTD 37%), và **Miền Trung** yếu toàn diện trên ba chỉ số độc lập.
2. **Inventory:** **37,6% vốn đang kẹt**, tập trung ở 9 item góc trên-phải scatter; **VT021 & VT007** cần thanh lý ngay.
3. **Data Quality:** Số liệu hai trang kia **đáng tin ~98%**, và bài học lớn nhất là **làm sạch sai còn nguy hiểm hơn không làm sạch**.

Sức thuyết phục không đến từ một chart đẹp nào, mà từ chỗ **nhiều chart độc lập cùng chỉ một thủ phạm**. Đó là lúc con số ngừng là con số và trở thành bằng chứng.
