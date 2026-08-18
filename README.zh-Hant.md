# Agentic EBS

[English](README.md)

> 將過去工時作為證據，推算新任務工時，而非憑感覺。

[Evidence Based Scheduling](https://www.joelonsoftware.com/2007/10/26/evidence-based-scheduling/)，由 Joel Spolsky 2007 年提出。而 Agentic EBS 將最大的阻力（拆解任務與估時）交給 AI agent，再由工具記錄工時，隨之累積的歷史資料再回頭修正 agent 的估計。

**立即嘗試：<https://bwaynesu.github.io/agentic-ebs/>**  
- 單機靜態網頁，資料存放於本機
- 無後端、無框架、無 build step，不對外傳送任何資訊
- 僅限 Chrome 或 Edge
- 本工具不呼叫任何 API，需自行準備能在專案目錄下執行的 AI agent

## 操作流程

```
1. 建卡與啟動計時
2. 撰寫需求
3. 交由 agent 分析（需求理解 / 多種解法 / 評估工時）
4. 使用者選定解法
5. agent 拆實作步驟卡
6. 實作
7. agent 產出收尾文件
8. 停止計時與完工
```

在任務頁寫下需求後，可透過頁面直接複製要交給 agent 的 prompt。貼給任何能在專案目錄下執行的 agent，agent 將會查找專案程式碼、git log，以及過去的任務卡，產出：

- `understanding.md` — 需求理解、採用的假設、尚待釐清的問題
- `approaches.md` — 多種解法，寫到「改哪個檔、加哪個函式、動哪個設定」的粒度
- `estimate.json` — 每種解法一個理想工時

選定解法後，agent 把它拆成可獨立領取的步驟卡；實作定案，再依**最終的程式碼**產出收尾文件（最終規格、與原規格的差異及原因、運作邏輯）。

完工後由歷史 velocity（估計 ÷ 實際）把理想工時換算成 P5 / P50 / P95。

## 設計依據

EBS 原本要求開發者自己持續拆解、估時、記錄工時，這正是它難以維持的地方。這裡前兩件交給 agent，第三件交給工具。

三項刻意的決定：

1. 校正屬 velocity 的職責，agent 只估「不被打擾的理想工時」，不做自我校正。
2. 被會議或雜事打斷時**不用暫停計時**，那段膨脹正是 velocity 要捕捉的訊號。
3. 緊急任務採插斷堆疊，工時只歸最上層的卡，並且不必人為額外操作前一任務的計時器。

## 研究方向

估計者從開發者本人換成「agent ＋ 一名負責審閱的人」之後，EBS 的假設是否仍然成立？

- `estimate.json` 記了 `model` 與 `templateVersion`。換 model 或大幅改寫 prompt，算不算換了一個估計者？
- `steps.md` 的步驟數是現成的自變數，拆得多細，和估得多準有關係嗎？
- 新卡分析時 agent 讀得到舊卡的前因後果，是否會讓估計變準，還是只提高了主觀信心？
- 依 tags 分池之後，分佈會不會更貼近該類任務？

## 目前觀察

資料仍在累積，有兩件當初不在設計目標內的效果：

1. 任務頁由上往下走一遍，問題會在動手之前被講清楚。這正好對應 Joel 所說 16 小時規則的真正用意，統計反而是附帶的。

2. understanding、approaches、steps 與收尾文件都留在卡內，幾個月後仍查得到「當時為什麼選這個做法」，開新卡時 agent 能夠讀到這些資料，更加理解專案現況。

尚未兌現的部分為機率分佈：工具現在只算得出**單張卡的耗時，而非一批卡的交付日期**；後者需使用蒙地卡羅將多張卡加總（風險互相抵消），`ebs.monteCarlo()` 已實作並通過測試，但尚未有任何呼叫端。

## 執行方式

1. 線上版 <https://bwaynesu.github.io/agentic-ebs/>：使用 Chrome 或 Edge 開啟網址即可使用。

2. 本地端：clone 專案或直接下載 `App/` 資料夾

```
cd App
python -m http.server 8765
```

開啟 <http://localhost:8765>。File System Access API 需要 secure context。沒有 Python 時任何靜態伺服器皆可，例如 `npx http-server -p 8765`。

提醒：
- 瀏覽器限 Chrome 或 Edge（Firefox 與 Safari 不支援 File System Access API）
- 本工具不呼叫任何 API，需自行準備能在專案目錄下執行的 AI agent
- 任務卡累積二十餘張之前，估時分佈會偏寬是預期行為，分佈需要一定數據才會開始有效

## 首次設定

第一次使用時，除了指定存放任務的資料夾，還需在設定頁進行幾項設定。見 [App/README.zh-Hant.md](App/README.zh-Hant.md)。

## 開發

```
App/
├── js/ebs.js       EBS 統計計算與工作日曆推導（純函式）
├── js/timer.js     計時與插斷堆疊狀態機（純函式）
├── js/tasks.js     任務卡資料邏輯：排序、id、狀態文案（純函式）
├── js/i18n.js      UI 文字字典（繁中 / 英文）
├── js/store.js     File System Access 存取層與 prompt 升級判斷
├── js/app.js       UI（區塊局部更新，不整頁重繪）
├── style.css       三檔主題（淺色 / 灰階 / 深色）與版面
└── prompts/        給 agent 的規則書與模板（初始化時複製到資料夾）
Docs/data-format.md  所有 JSON schema 與規則（單一事實來源，英文）
Docs/design.md       現況的設計決策與理由（英文）
```

```
node --test "App/js/*.test.mjs"
```

純函式皆有測試，不使用測試框架，只用 Node 內建的 `assert`；`style.css`（三主題變數集合、`color-scheme`、不得寫死色碼）與 `prompts/`（篇幅預算、清單同步）另有靜態契約檢查。`app.js` 只組 DOM，以 `node --check App/js/app.js` 檢查語法。

## 授權

尚未設定 LICENSE 檔，視同保留所有權利。未經同意請勿轉載、散布、修改或用於商業用途。歡迎閱讀、star 與透過 issue 討論。
