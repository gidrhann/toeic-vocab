# 設計規格摘要（醫學知識庫）

來源：`assets/css/main.css`，數值皆直接讀自檔案。供其他專案（antigravity）參考。

## 一、設計理念

**「技術報告式排版」**：低飽和海軍藍主調、1px 細線建立層級、等寬字當標籤、白色「紙張」放在灰底上。

- **不用陰影**（`--shadow-*: none`，只有抽屜／modal 例外）。
- **圓角一律 ≤ 4px**，避免卡片感。
- **全站只有一個高彩度暖色**（`--kb-accent`），其餘都是低飽和色。到處用高彩度色，層級會塌掉。

## 二、版面

| 項目 | 規格 |
|---|---|
| 結構 | 三欄：左 sidebar 260px、中間內容、右 TOC 220px |
| Header | 高 56px、sticky、白底、下方 1px 線 |
| 內容區 `.site-main` | 白底、1px 框、4px 圓角、外距 24px、內距 40px |
| 內文最大寬 | 800px |
| 斷點 | ≤1024px 隱藏 TOC（改底部抽屜）；≤767px sidebar 變抽屜、內容區取消外框與留白 |
| 手機表格 | 加 `table-cards` class 後，每列變成一張卡片（第一欄當標題） |

## 三、字體

| 用途 | 字型 |
|---|---|
| 內文 | IBM Plex Sans + Noto Sans TC（後備：微軟正黑體） |
| **標籤字** | **IBM Plex Mono**：章節編號、元件小標、表頭、圖說、meta、footer |

**內文：** 15.5px、行高 1.78、`text-wrap: pretty`。這是長文久讀的取捨，一般短篇可用 15px。

| 元素 | 規格 |
|---|---|
| h1 | 34px、600、字距 -0.02em、行高 1.24 |
| h2 | 23px、600、上距 48px。左側有自動編號晶片 |
| h3 | 17px、600、左側 3px × 16px 藍色直條 |
| h4 | 14.5px、600 |
| 標籤字（等寬） | 12px、全大寫、字距 0.08–0.14em |
| 表格內文 | 14px |
| clinical-block 內文 | 14.5px |

**中文可讀性下限：** 含中文的文字不低於 12px。等寬字對中文不生效，會退回後備字型，所以含中文的標籤要比純英文標籤大 0.5–1px（footer 12.5px）。

## 四、色票

### 語意色（`--kb-*`）

| 變數 | 淺色 | 深色 | 用途 |
|---|---|---|---|
| surface | `#FFFFFF` | `#16202F` | 內容白卡 |
| surface-2 | `#F2F4F7` | `#1C2839` | 斑馬列、chip、程式碼底 |
| navy | `#1E3050` | `#405A85` | 表頭橫槓 |
| navy-2 | `#2C4E7A` | `#7FA9D9` | 連結、主色 |
| blue | `#3E6392` | `#6E9BCB` | h3 直條、引用 |
| olive | `#6E7F58` | `#93A87A` | 藥物劑量、成功 |
| brick | `#9C5B52` | `#C87F72` | 警示、錯誤 |
| gold | `#A8873F` | `#C7A55A` | 重點（Pearl） |
| **accent** | `#C4693C` | `#E08B52` | **全站唯一暖色** |

### 底色與文字

| | 淺色 | 深色 |
|---|---|---|
| 頁面背景 | `#EAEDF1` | `#0E1723` |
| Sidebar／Footer | `#E5EAF0` | `#111C29` |
| 邊框 | `#D2D9E2`（淺：`#E2E7ED`） | `#2B3B4F`（淺：`#22303F`） |
| 內文 | `#1B2735` | `#C9D4E0` |
| 次要文字 | `#52667A` | `#93A3B5` |
| 最淡文字 | `#8493A5` | `#6B7C90` |

**暖色 accent 只用在三處：** h2 編號晶片、標題上方 22×2px 短線、TOC 目前位置標記。TOC 與 sidebar 的編號一律用灰色。

**深色模式配色要算對比，不能憑感覺。** 初版 navy 用 `#24334A`，對卡片底只有 1.29:1，表頭橫槓等於消失。改成 `#405A85` 後橫槓 2.36:1、欄名文字 5.36:1。計算用 WCAG 相對亮度公式。

## 五、元件規格

### Clinical block（臨床提示框）

白底、1px 細框、**3px 左側色邊**、4px 圓角、內距 16×20px。小標用等寬字 12px 全大寫，不用 emoji。

| 類型 | 左側色邊 |
|---|---|
| Pearl（重點） | gold |
| Warning（警示） | brick |
| Guideline（指引） | blue |
| Dose（劑量） | olive |
| Note（備註） | 灰 `#8493A5` |

### 表格

- 外框 1px，表頭是 navy 實色橫槓，欄名用等寬字 12px 全大寫，字色 `#DCE3E7`。
- 儲存格內距 11×14px，列間 1px 淺線，hover 時換 surface-2。
- 比畫面寬時，左右邊緣出現陰影提示可橫向滑動。

### 其他元件

- **章節編號：** 純 CSS counter 產生 `01` `02`…，HTML 不用寫。編號是 1px accent 框的等寬字小晶片。
- **圖說：** 等寬字 12px，上方 1px 分隔線，灰色。
- **圖片：** `width: 100%; max-width: 720px`，不寫固定寬度。
- **摺疊區 `<details>`：** 摘要列是等寬字大寫，底色 surface-2。
- **引用 `[N]`：** 藍色上標，點擊後對應參考文獻條目高亮。

## 六、核心 CSS 變數（可直接複製）

```css
:root {
  --font-sans: 'IBM Plex Sans','Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif;
  --font-mono: 'IBM Plex Mono',ui-monospace,monospace;
  --radius-md: 4px;  --radius-sm: 3px;
  --kb-surface:#FFFFFF; --kb-surface-2:#F2F4F7;
  --kb-navy:#1E3050; --kb-navy-2:#2C4E7A; --kb-blue:#3E6392;
  --kb-olive:#6E7F58; --kb-brick:#9C5B52; --kb-gold:#A8873F;
  --kb-accent:#C4693C;
  --color-bg:#EAEDF1; --color-border:#D2D9E2; --color-border-light:#E2E7ED;
  --color-text:#1B2735; --color-text-muted:#52667A; --color-text-subtle:#8493A5;
}
[data-theme="dark"] {
  --kb-surface:#16202F; --kb-surface-2:#1C2839;
  --kb-navy:#405A85; --kb-navy-2:#7FA9D9; --kb-blue:#6E9BCB;
  --kb-olive:#93A87A; --kb-brick:#C87F72; --kb-gold:#C7A55A;
  --kb-accent:#E08B52;
  --color-bg:#0E1723; --color-border:#2B3B4F; --color-border-light:#22303F;
  --color-text:#C9D4E0; --color-text-muted:#93A3B5; --color-text-subtle:#6B7C90;
}
```

## 未驗證

響應式斷點數字取自專案 `CLAUDE.md`，未逐一對照 `main.css` 的 media query。
