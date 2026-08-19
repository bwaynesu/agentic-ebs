// i18n.js — the UI text dictionaries and the lookup.
//
// A PURE MODULE: no DOM, no localStorage, no detection side effects. That is what lets tasks.js
// import it directly and lets Node import it at all. The default locale is zh-Hant, so existing
// tests do not have to set a language first. Detection and persistence live in app.js.
//
// Adding a language means one row in LOCALES and one dictionary in DICT; no other code changes.
// `i18n.test.mjs` checks that every dictionary has exactly the same set of keys as zh-Hant, so a
// missing translation fails the build. It has to, because on screen a missing translation just
// falls back to the default language with no symptom at all.
//
// UI TEXT ONLY. Prompt content meant for the agent lives under `prompts/` — English, one
// authoritative copy — and does not follow the UI language. Switching the interface to another
// language must not suddenly hand the agent an instruction in that language.

export const DEFAULT_LOCALE = "zh-Hant";

// intl = the BCP 47 tag handed to toLocaleString / toLocaleDateString
// en = the English name of the language, used to seed settings.outputLang. The instruction it
//      goes into is English, so an English name is the least likely to be misread. Users filling
//      the field in themselves may write it in their own language; see defaultOutputLang.
export const LOCALES = [
  { code: "zh-Hant", label: "繁體中文", intl: "zh-TW", en: "Traditional Chinese" },
  { code: "en", label: "English", intl: "en", en: "English" },
];

// The seed value for the output language, used for new folders and for the one-off migration of
// existing folders that lack the field. An English interface seeds an empty string: the guides the
// agent reads are English already, so an extra "reply in English" would only take up context.
// A SEED ONLY. Once it is written into settings.json the two go their own ways. An empty string is
// never interpreted as "follow the UI language" — that would grow two languages of history
// documents in one folder depending on the browser, which cancels out the reason for storing it
// in the folder in the first place.
export function defaultOutputLang(code = current) {
  const hit = LOCALES.find((l) => l.code === code);
  return !hit || hit.code === "en" ? "" : hit.en;
}

const zhHant = {
  // ---- Header & global ----
  "app.title": "Agentic EBS",
  "app.dirNone": "未連結任務資料夾",
  "app.dirConnected": "任務資料夾：{name}",
  "app.themeToggle": "切換主題（淺色 / 灰階 / 深色）",
  "app.langLabel": "介面語言",
  "app.settings": "設定",
  "app.pickDir": "選擇任務資料夾",
  "app.pickDirRelink": "重新連結任務資料夾",
  "app.collapseAll": "全部區塊收合",
  "app.refresh": "重新整理（重讀資料夾）",
  "app.toTop": "回到最上方",

  // ---- Welcome (no folder linked yet) ----
  // docsUrl points at the language's own manual on GitHub, which renders the md; the copy served
  // next to index.html is raw text in a browser.
  "welcome.lead": "以歷史工時校正 AI agent 估時的任務卡工具。",
  "welcome.needTitle": "開始前需要",
  "welcome.needBrowser": "Chrome 或 Edge（需要 File System Access API）",
  "welcome.needAgent": "一個可在開發專案目錄下執行的 AI agent（本工具不呼叫任何 API）",
  "welcome.needFolder": "一個存放任務資料的資料夾",
  // Shown at both places that open the picker (welcome screen, settings). One copy, so the two
  // cannot drift apart into two different pieces of advice.
  "folder.note": "在開發專案下新建一個空資料夾存放任務資料，例如 ebs-data。",
  "pick.confirmForeign":
    "「{name}」裡已經有其他檔案，看起來不是任務資料夾。繼續會在裡面建立 settings.json、tasks/、prompts/。要用這個資料夾嗎？",
  "welcome.docs": "操作說明",
  "welcome.docsUrl": "https://github.com/bwaynesu/agentic-ebs/blob/main/App/README.zh-Hant.md",
  "welcome.local": "資料儲存於本機資料夾，不經任何伺服器。",

  // ---- Common actions ----
  "act.save": "儲存",
  "act.cancel": "取消",
  "act.delete": "刪除",
  "act.remove": "移除",
  "act.confirm": "確認",
  "act.backToList": "返回列表",

  // ---- Errors & toasts ----
  "err.endAfterStart": "結束時間需晚於開始時間",
  "err.fileMissing": "找不到 {path}",
  "err.needTitle": "請填寫標題",
  "err.pickDateFirst": "請先選日期",
  "err.connectFailed": "連結失敗：{message}",
  "err.folderGone": "遺失「{name}」資料夾路徑",
  "err.unsupported":
    "此瀏覽器不支援 File System Access API，請改用桌面版 Chrome / Edge 開啟（VS Code 內建瀏覽器、Firefox、Safari 皆不支援）。",
  "toast.saved": "已儲存",
  "toast.savedFile": "已儲存 {path}",
  "toast.resetDone": "已還原為內建預設",
  "toast.settingsSaved": "設定已儲存",
  "toast.deleted": "已刪除「{title}」",
  "toast.copied": "已複製",

  // ---- Task status ----
  "status.draft": "草稿",
  "status.estimated": "已估時",
  "status.active": "進行中",
  "status.interrupted": "被插斷",
  "status.done": "已完成",
  "sep.tags": "、",
  "fmt.hoursDays": "{h}（約 {days} 天）",

  // ---- Task tags (values are codes, see TAG_CODES in tasks.js; the category list itself lives in analyze-task.md) ----
  "tag.frontend-ui": "前端UI",
  "tag.backend-logic": "後端邏輯",
  "tag.data-processing": "資料處理",
  "tag.refactor": "重構",
  "tag.debugging": "除錯",
  "tag.infrastructure": "基礎建設",
  "tag.unfamiliar-domain": "不熟悉領域",

  // ---- Dates ----
  "date.weekdays": ["日", "一", "二", "三", "四", "五", "六"],
  "date.dayLabel": "{date}（{weekday}）",
  "date.inProgress": "（進行中）",

  // ---- Home reminders ----
  "reminder.confirmDays": "待確認工時：以下日子有任務進行，請確認當天的上班時窗或標為休假",
  "reminder.confirmAllDefault": "全部依預設確認",
  "reminder.offHours": "待確認：以下已完成的卡有上班時窗外的工時，請決定是否計入 velocity",
  "reminder.inOutHours": "時窗內 {win} h ＋ 時窗外 {off} h",
  "reminder.countIn": "計入",
  "reminder.countOut": "不計入",
  "reminder.offSegment": "　└ {start} → {end}（時窗外 {hours} h）",

  // ---- Notice: a prompt differs from the bundled default ----
  // The home page only says that this exists; the decision always happens in Settings,
  // because that is the only place where both versions are visible.
  "notice.title": "{n} 個 prompt 檔和 App 內建的版本不一樣",
  "notice.body":
    "這些檔沒有被自動覆寫。可能是你自己改的，也可能是舊版留下來的——到設定頁比對兩份內容之後再決定要不要換成新版。",
  "notice.goSettings": "到設定頁比對",
  "notice.dismiss": "這次不用",
  "notice.hint": "關掉之後設定按鈕上仍會保留提示點。",
  "notice.take": "採用新版（覆蓋目前內容）",
  "prompts.keepMine": "保留我的版本",
  "toast.keptMine": "已保留你的版本；下次有更新的版本時會再問一次",
  "notice.changesSince": "自 v{version} 之後的改動：",
  "notice.entry": "v{version}：{text}",
  "notice.originUnknown":
    "這個檔在 App 開始記錄之前就存在，無法判斷是你改的還是舊版殘留。請直接比對下面兩份內容。",
  "prompts.yourVersion": "這個資料夾目前的內容（可編輯）",
  "prompts.newVersion": "App 內建的新版（唯讀）",
  "settings.updateBadge": "與內建不同",
  "app.settingsUpdate": "設定（有 prompt 和內建不同）",

  // ---- Settings ----
  "settings.title": "設定",
  "settings.unknown": "（未知）",
  "settings.current": "目前：{name}",
  "settings.changeFolder": "更換任務資料夾",
  "group.folder": "資料夾與路徑",
  "group.workTime": "工作時間",
  "group.git": "Git",
  "group.prompts": "Prompt 客製化",
  "badge.confirm": "請確認",
  "badge.suggested": "建議填寫",
  "field.dataDir": "任務資料夾",
  "field.dataDirPath": "任務資料夾相對路徑",
  "field.timezone": "時區（IANA 名稱）",
  "field.workStart": "上班時間",
  "field.workEnd": "下班時間",
  "field.workdays": "工作日",
  "field.breaks": "休息時段（不計入工時）",
  "field.calendar": "工作日曆",
  "cal.note": "單日上下班時段覆寫。影響當日計入工時與 velocity。",
  "field.gitAuthor": "Git 使用者名稱（篩選 commit）",
  "ph.gitAuthor": "git 使用者名稱或 email",
  "ph.dataDirPath": "例如 ./ebs-data 或 docs/ebs-data",
  "ph.taskTitle": "任務標題",
  "break.label": "休息",
  "break.add": "＋ 新增休息時段",
  "cal.addOrJump": "新增／跳到該日",
  "cal.emptyMonth": "（本月無單日覆寫，都用預設規則）",
  "cal.otherMonths": "其他月份另有 {n} 筆覆寫，用上方月份選擇器切換",
  "cal.dayOff": "休假",

  // ---- Prompt editors (order = top-to-bottom flow on the task page) ----
  "field.outputLang": "產出語言",
  "ph.outputLang": "例：繁體中文、日本語、Traditional Chinese（留空＝英文）",
  "outputLang.note": "agent 寫任務文件與對談時用的語言。檔名與代碼（status / tags）不受影響。",
  "prompts.note": "編輯僅影響「{name}」資料夾任務",
  "prompts.reset": "還原預設",
  "prompts.confirmReset": "還原「{label}」為內建預設？會覆蓋目前內容。",
  "prompt.template.label": "① 分析 Prompt（template.md）",
  "prompt.analyze.label": "② 分析規則（analyze-task.md）",
  "prompt.steps.label": "③ 產生步驟卡 Prompt（steps-template.md）",
  "prompt.stepsGuide.label": "④ 步驟卡規則（steps-guide.md）",
  "prompt.implement.label": "⑤ 實作規則（implement.md）",
  "prompt.wrap.label": "⑥ 收尾 Prompt（wrap-up-template.md）",
  "prompt.wrapGuide.label": "⑦ 收尾規則（wrap-up-guide.md）",

  // ---- List ----
  "list.empty": "尚無任務",
  "list.emptyOpen": "尚無進行中任務",
  "list.newTask": "新增任務",
  "card.created": "建立 {time}",
  "card.totalSpent": "　總花費 {hours} h",
  "card.velocity": "　velocity {velocity}",
  "card.excluded": "未納入統計：{why}",
  "confirm.deleteTask": "刪除任務「{title}」？此動作會刪除整個任務資料夾。",
  "confirm.startNow": "立即開工開始計時？",
  "confirm.startNowInterrupt": "立即開工？「{title}」會被插斷，這張完工後自動恢復。",
  "unsaved.body": "尚有未儲存的變更，離開將會遺失。",
  "unsaved.save": "儲存並離開",
  "unsaved.discard": "捨棄並離開",

  // ---- Done section & velocity pool stats ----
  "done.velocityMedian": "velocity 中位數 ",
  "done.actualTimes": "　實際約為估計的 {n} 倍",
  "done.bufferRatio": "緩衝倍率 ",
  "done.bufferHint": "　向別人承諾時使用的倍率（P95 ÷ P50），越小越收斂",
  "done.counts": "{done} 張已完成，其中 {pool} 張進入 velocity 統計",
  "done.lowSamples": "樣本不足，估時分佈仍混用預設值",
  "done.excludedSummary": "未納入：{list}",
  "done.excludedItem": "{why}（{n}）",
  "done.showMore": "顯示更多（還有 {n} 張）",
  "done.countBadge": "{n} 張",

  // ---- Reasons for exclusion from velocity, and how to fix each one ----
  "excl.noCompletedAt.why": "沒有完成時間",
  "excl.noCompletedAt.fix": "資料異常，重新按一次開工／完工即可補上",
  "excl.noEstimate.why": "沒有 agent 估時",
  "excl.noEstimate.fix": "完成後才補估時會被實際結果污染，這張只能放著",
  "excl.openInterval.why": "已完成卻還在計時",
  "excl.openInterval.fix": "舊版遺留的壞資料，按一次「重新開工」再按「完工」就會關掉",
  "excl.noApproach.why": "未選定解法",
  "excl.noApproach.fix": "開卡到「時程評估」勾一個解法",
  "excl.approachMissing.why": "選定的解法不在估時檔裡，或它的工時不是可用的數字",
  "excl.approachMissing.fix": "開卡重新勾一個解法，或請 agent 把 hours 改成數字",
  "excl.tooOld.why": "完成時間超過統計有效期",
  "excl.tooOld.fix": "正常淘汰，不需處理",
  "excl.dayUnconfirmed.why": "當天上班時窗尚未確認",
  "excl.dayUnconfirmed.fix": "先在首頁「待確認工時」確認那幾天的時窗，窗外工時才問得準",
  "excl.offHoursPending.why": "時窗外工時尚未裁決",
  "excl.offHoursPending.fix": "開卡決定那段時間算不算工時",
  "excl.noActualHours.why": "計入工時為 0",
  "excl.noActualHours.fix": "時間全落在上班時窗外：改工作日曆、修區間時間，或勾選計入窗外工時",

  // ---- Detail side rail ----
  "rail.back": "← 返回列表",
  "rail.collapse": "收合側欄",
  "rail.expand": "展開側欄",
  "rail.start": "開工",
  "rail.complete": "完工",
  "rail.restart": "重新開工",
  "rail.noApproachWarn": "尚未選定解法——結束前記得在時程評估勾選",
  "rail.noWrapWarn": "尚未產出收尾文件——結束前記得到「統整與收尾」補上",
  "rail.interruptedBy": "被「{title}」插斷中，該卡完成時自動恢復",
  "rail.badStatus": "狀態值異常：task.json 的 status 是「{status}」，不是本系統認得的狀態（多半是 agent 寫壞的）",
  "rail.fixStatus": "依卡片資料修回「{status}」",
  "rail.currentRun": "本次 ",
  "rail.elapsed": "經過 {hours} h",
  "rail.counted": "計入 {hours} h",
  "rail.velocity": "velocity {velocity}",

  // ---- Detail section titles ----
  "sec.req": "需求描述",
  "sec.analyze": "交給 Agent 分析",
  "sec.understanding": "Agent 需求理解",
  "sec.approaches": "Agent 解法分析",
  "sec.estimate": "時程評估・選解法",
  "sec.steps": "實作步驟卡",
  "sec.wrap": "統整與收尾",
  "sec.finalSpec": "最終定案規格",
  "sec.specDiff": "與原規格差異",
  "sec.logic": "程式運作邏輯",
  "sec.time": "時間紀錄",
  "sec.done": "已完成",

  // ---- Detail content ----
  "detail.createdAt": "建立於 {time}",
  "detail.notFound": "找不到任務。",
  "detail.waitingAgent": "（等待 agent 產出）",
  "req.empty": "尚未填寫",
  "req.editAria": "編輯需求描述",
  "title.editAria": "編輯標題",
  "analyze.copyPrompt": "複製 Prompt",
  "analyze.hint": "讀寫位置 {path}",
  "analyze.needReq": "請先填寫需求描述。",
  "approach.pickedTag": "✔ 採用",
  "approach.pickedPrefix": "✔ 採用　",

  // ---- Estimate ----
  "est.coldStart": "歷史資料不足（目前 {n} 筆），分佈混入預設樣本，僅供參考",
  "est.breakdown": "（實作 {impl} ＋ 分析/討論 {plan}）",
  "est.badHours": " 估時值無效（{value}）——請 agent 把 estimate.json 的 hours 改成數字，這個解法目前算不出分佈",
  "est.idealHours": " 理想工時 {hours}h{breakdown}",
  "est.approachName": "{name}（{id}）",
  "dist.p50": "最可能 {hours}h",
  "dist.idealTitle": "理想工時 {hours}h",
  "legend.ideal": "理想工時（agent 估）",
  "legend.band": "九成機率區間",
  "legend.p50": "最可能",

  // ---- Chart reading hint ----
  "hint.title": "怎麼用這張圖",
  "hint.p50": "一半機率會超過。排自己接下來的時間看這個。",
  "hint.band": "要跟別人承諾日期，抓右端那個數字。",
  "hint.ideal": "agent 估的原始值，沒有校正。它到實線的距離就是你的 velocity 在修正的量。",
  "hint.compare": "比較解法時看實線的差距：省下的時間若和規格妥協不成比例，就別換。",
  "hint.notes": "備註",
  "hint.note1": "條的長短代表你過去估得準不準，不是這張卡的難度。所以同一張卡的每條看起來都差不多長，只是按各自的估時縮放。",
  "hint.note2": "⚠ 那行是 agent 提醒的風險，圖上不會反映，要自己讀。",
  "hint.note3": "單位是投入工時，只算上班時窗內，不是日曆時間。",

  // ---- Implementation steps ----
  "steps.copyGen": "複製步驟卡 Prompt",
  "steps.copyGenAgain": "複製步驟卡 Prompt（重跑）",
  "steps.copyImpl": "複製實作 Prompt",
  "steps.noSteps": "尚未產出步驟卡",
  "steps.hintPicked": "尚未產出。以下 prompt 依選定的解法產生步驟卡：",
  "steps.hintNoPick": "尚未產出。請先勾選要採用的解法。",

  // ---- Wrap up ----
  "wrap.copy": "複製 Prompt",
  "wrap.copyAgain": "複製 Prompt（重跑）",
  "wrap.doneAny": "已完成。要重跑收尾請先按左側「重新開工」——收尾也是工時，計時中做才會算進 velocity。",
  "wrap.doneNone": "已完成但沒有收尾文件。要補請先按左側「重新開工」——收尾也是工時，計時中做才會算進 velocity。",
  "wrap.hintAny": "程式碼又改過的話可以重跑，agent 會依最新的程式碼覆寫這三份文件。",
  "wrap.hintNone": "實作定案、不再調整後，用下面的 prompt 請 agent 依最終程式碼補齊定案文件。",
  "wrap.hintNoSteps": "尚未輪到。請先到「實作步驟卡」請 agent 產生步驟卡並完成實作，才能請 agent 收尾。",

  // ---- Time log ----
  "time.addInterval": "手動新增區間",
  "time.running": "進行中：{start} →（計時中）",
  "time.elapsed": "累計經過：{hours} h",
  "time.counted": "計入工時：{hours} h（僅上班時窗內，用於 velocity）",
  "time.taskVelocity": "本卡 velocity: {velocity}（估 {ideal}h ÷ 實 {actual}h{legacy}）",
  "time.legacySuffix": "＋舊制討論",
  "time.legacyTitle": "分析/討論（舊制紀錄）",
  "off.checkbox": "有 {hours} h 落在上班時窗外，也算進工時",
  "off.explain":
    "這 {hours} h 在上班時窗外（午休、下班後或假日），但緊貼你按下開工／完工的時刻，通常是真的在工作。勾選則計入工時。",
  "off.unconfirmed":
    "這幾天的上班時窗還沒確認，窗外工時只是用預設時窗算的暫定值；先到首頁確認時窗再裁決。本卡暫不進入 velocity 歷史。",
  "off.undecided": "尚未決定，本卡暫不進入 velocity 歷史。",
};

const en = {
  // ---- Header & global ----
  "app.title": "Agentic EBS",
  "app.dirNone": "No task data folder linked",
  "app.dirConnected": "Task data folder: {name}",
  "app.themeToggle": "Switch theme (light / gray / dark)",
  "app.langLabel": "Interface language",
  "app.settings": "Settings",
  "app.pickDir": "Pick task data folder",
  "app.pickDirRelink": "Relink task data folder",
  "app.collapseAll": "Collapse all sections",
  "app.refresh": "Refresh (re-read the folder)",
  "app.toTop": "Back to top",

  // ---- Welcome (no folder linked yet) ----
  "welcome.lead": "Task cards whose agent estimates are corrected by the hours you actually spend.",
  "welcome.needTitle": "Before you start",
  "welcome.needBrowser": "Chrome or Edge (the File System Access API is required)",
  "welcome.needAgent": "An AI agent that runs in your project directory (this tool calls no API of its own)",
  "welcome.needFolder": "A folder to hold the task data",
  "folder.note": "Create an empty folder inside your project for the task data, e.g. ebs-data.",
  "pick.confirmForeign":
    "“{name}” already holds other files and does not look like a task data folder. Continuing creates settings.json, tasks/ and prompts/ inside it. Use it anyway?",
  "welcome.docs": "Documentation",
  "welcome.docsUrl": "https://github.com/bwaynesu/agentic-ebs/blob/main/App/README.md",
  "welcome.local": "Data is stored in a local folder. Nothing is sent to a server.",

  // ---- Common actions ----
  "act.save": "Save",
  "act.cancel": "Cancel",
  "act.delete": "Delete",
  "act.remove": "Remove",
  "act.confirm": "Confirm",
  "act.backToList": "Back to list",

  // ---- Errors & toasts ----
  "err.endAfterStart": "End time must be later than start time",
  "err.fileMissing": "{path} not found",
  "err.needTitle": "Please enter a title",
  "err.pickDateFirst": "Pick a date first",
  "err.connectFailed": "Link failed: {message}",
  "err.folderGone": "Lost the path to “{name}”",
  "err.unsupported":
    "This browser does not support the File System Access API. Open it in desktop Chrome / Edge (VS Code's built-in browser, Firefox and Safari are not supported).",
  "toast.saved": "Saved",
  "toast.savedFile": "Saved {path}",
  "toast.resetDone": "Restored to the built-in default",
  "toast.settingsSaved": "Settings saved",
  "toast.deleted": "Deleted “{title}”",
  "toast.copied": "Copied",

  // ---- Task status ----
  "status.draft": "Draft",
  "status.estimated": "Estimated",
  "status.active": "In progress",
  "status.interrupted": "Interrupted",
  "status.done": "Done",
  "sep.tags": ", ",
  "fmt.hoursDays": "{h} (~{days}d)",

  // ---- Task tags (values are codes, see TAG_CODES in tasks.js) ----
  "tag.frontend-ui": "Frontend UI",
  "tag.backend-logic": "Backend logic",
  "tag.data-processing": "Data processing",
  "tag.refactor": "Refactor",
  "tag.debugging": "Debugging",
  "tag.infrastructure": "Infrastructure",
  "tag.unfamiliar-domain": "Unfamiliar domain",

  // ---- Dates ----
  "date.weekdays": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  "date.dayLabel": "{date} ({weekday})",
  "date.inProgress": "(running)",

  // ---- Home reminders ----
  "reminder.confirmDays":
    "Hours to confirm: tasks ran on these days — confirm the working window or mark the day off",
  "reminder.confirmAllDefault": "Confirm all with defaults",
  "reminder.offHours":
    "To decide: these finished tasks have hours outside the working window — count them toward velocity?",
  "reminder.inOutHours": "in-window {win} h + out-of-window {off} h",
  "reminder.countIn": "Count",
  "reminder.countOut": "Exclude",
  "reminder.offSegment": "　└ {start} → {end} (out of window, {hours} h)",

  // ---- Notice: a prompt differs from the bundled default ----
  // The home page only says that this exists; the decision always happens in Settings,
  // because that is the only place where both versions are visible.
  "notice.title": "{n} prompt file(s) differ from the version bundled with the App",
  "notice.body":
    "They were not overwritten. They may be your own edits, or leftovers from an older version — compare both texts in Settings before deciding whether to take the new one.",
  "notice.goSettings": "Compare in Settings",
  "notice.dismiss": "Not this time",
  "notice.hint": "After dismissing, the dot on the Settings button stays.",
  "notice.take": "Take the new version (overwrites current)",
  "prompts.keepMine": "Keep mine",
  "toast.keptMine": "Kept your version; we'll ask again when a newer one ships",
  "notice.changesSince": "Changes since v{version}:",
  "notice.entry": "v{version}: {text}",
  "notice.originUnknown":
    "This file predates the App's records, so we cannot tell whether you edited it or it is an old leftover. Compare the two texts below.",
  "prompts.yourVersion": "What is in this folder now (editable)",
  "prompts.newVersion": "Bundled with the App (read-only)",
  "settings.updateBadge": "differs",
  "app.settingsUpdate": "Settings (prompts differ from bundled)",

  // ---- Settings ----
  "settings.title": "Settings",
  "settings.unknown": "(unknown)",
  "settings.current": "Current: {name}",
  "settings.changeFolder": "Change task data folder",
  "group.folder": "Folder & paths",
  "group.workTime": "Working hours",
  "group.git": "Git",
  "group.prompts": "Prompt customisation",
  "badge.confirm": "check this",
  "badge.suggested": "worth filling in",
  "field.dataDir": "Task data folder",
  "field.dataDirPath": "Relative path from your project root",
  "field.timezone": "Time zone (IANA name)",
  "field.workStart": "Work starts",
  "field.workEnd": "Work ends",
  "field.workdays": "Workdays",
  "field.breaks": "Breaks (excluded from working hours)",
  "field.calendar": "Work calendar",
  "cal.note": "Per-day working window overrides. Affects that day's counted hours and velocity.",
  "field.gitAuthor": "Git user name (filters commits)",
  "ph.gitAuthor": "git user name or email",
  "ph.dataDirPath": "e.g. ./ebs-data or docs/ebs-data",
  "ph.taskTitle": "Task title",
  "break.label": "Break",
  "break.add": "+ Add break",
  "cal.addOrJump": "Add / jump to day",
  "cal.emptyMonth": "(no per-day overrides this month; defaults apply)",
  "cal.otherMonths": "{n} more override(s) in other months — switch with the month picker above",
  "cal.dayOff": "Day off",

  // ---- Prompt editors (order = top-to-bottom flow on the task page) ----
  "field.outputLang": "Output language",
  "ph.outputLang": "e.g. Traditional Chinese, 日本語, Deutsch (empty = English)",
  "outputLang.note": "Language the agent writes task documents and replies in. File names and code values (status / tags) are unaffected.",
  "prompts.note": "Edits affect tasks in “{name}” only",
  "prompts.reset": "Restore default",
  "prompts.confirmReset": "Restore “{label}” to the built-in default? This overwrites the current content.",
  "prompt.template.label": "① Analysis prompt (template.md)",
  "prompt.analyze.label": "② Analysis rules (analyze-task.md)",
  "prompt.steps.label": "③ Step-card prompt (steps-template.md)",
  "prompt.stepsGuide.label": "④ Step-card rules (steps-guide.md)",
  "prompt.implement.label": "⑤ Implementation rules (implement.md)",
  "prompt.wrap.label": "⑥ Wrap-up prompt (wrap-up-template.md)",
  "prompt.wrapGuide.label": "⑦ Wrap-up rules (wrap-up-guide.md)",

  // ---- List ----
  "list.empty": "No tasks yet",
  "list.emptyOpen": "No tasks in progress",
  "list.newTask": "New task",
  "card.created": "Created {time}",
  "card.totalSpent": " · spent {hours} h",
  "card.velocity": " · velocity {velocity}",
  "card.excluded": "Not in statistics: {why}",
  "confirm.deleteTask": "Delete task “{title}”? This removes the whole task folder.",
  "confirm.startNow": "Start the clock now?",
  "confirm.startNowInterrupt": "Start now? “{title}” will be interrupted and resumes when this one is done.",
  "unsaved.body": "You have unsaved changes. Leaving will discard them.",
  "unsaved.save": "Save and leave",
  "unsaved.discard": "Discard and leave",

  // ---- Done section & velocity pool stats ----
  "done.velocityMedian": "Median velocity ",
  "done.actualTimes": " · actual is about {n}× the estimate",
  "done.bufferRatio": "Buffer ratio ",
  "done.bufferHint": " · the multiple to use when committing to others (P95 ÷ P50); smaller is tighter",
  "done.counts": "{done} done, {pool} of them in the velocity pool",
  "done.lowSamples": "Not enough samples — the distribution still mixes in default values",
  "done.excludedSummary": "Excluded: {list}",
  "done.excludedItem": "{why} ({n})",
  "done.showMore": "Show more ({n} left)",
  "done.countBadge": "{n}",

  // ---- Reasons for exclusion from velocity ----
  "excl.noCompletedAt.why": "No completion time",
  "excl.noCompletedAt.fix": "Data glitch — press Start then Complete once more to fill it in",
  "excl.noEstimate.why": "No agent estimate",
  "excl.noEstimate.fix": "Estimating after the fact is polluted by the outcome; this one has to stay out",
  "excl.openInterval.why": "Marked done but the clock is still running",
  "excl.openInterval.fix": "Leftover from an old version — press Restart then Complete once to close it",
  "excl.noApproach.why": "No approach selected",
  "excl.noApproach.fix": "Open the task and pick one under “Estimate”",
  "excl.approachMissing.why": "Selected approach is not in the estimate file, or its hours are not a usable number",
  "excl.approachMissing.fix": "Open the task and pick an approach again, or ask the agent to write hours as a number",
  "excl.tooOld.why": "Completed beyond the statistics validity window",
  "excl.tooOld.fix": "Normal expiry, nothing to do",
  "excl.dayUnconfirmed.why": "Working window for that day not confirmed",
  "excl.dayUnconfirmed.fix":
    "Confirm those days under “Hours to confirm” on the home page first, so out-of-window hours can be judged",
  "excl.offHoursPending.why": "Out-of-window hours not decided",
  "excl.offHoursPending.fix": "Open the task and decide whether that stretch counts",
  "excl.noActualHours.why": "Counted hours are 0",
  "excl.noActualHours.fix":
    "All time fell outside the working window: adjust the work calendar, fix the intervals, or count out-of-window hours",

  // ---- Detail side rail ----
  "rail.back": "← Back to list",
  "rail.collapse": "Collapse rail",
  "rail.expand": "Expand rail",
  "rail.start": "Start",
  "rail.complete": "Complete",
  "rail.restart": "Restart",
  "rail.noApproachWarn": "No approach selected — pick one under Estimate before you finish",
  "rail.noWrapWarn": "No wrap-up docs yet — produce them under “Wrap up” before you finish",
  "rail.interruptedBy": "Interrupted by “{title}”; resumes when that task completes",
  "rail.badStatus": "Bad status: task.json says “{status}”, which is not a status this app knows (an agent most likely wrote it)",
  "rail.fixStatus": "Repair to “{status}” from the card's data",
  "rail.currentRun": "This run ",
  "rail.elapsed": "Elapsed {hours} h",
  "rail.counted": "Counted {hours} h",
  "rail.velocity": "velocity {velocity}",

  // ---- Detail section titles ----
  "sec.req": "Requirement",
  "sec.analyze": "Hand to Agent",
  "sec.understanding": "Agent's understanding",
  "sec.approaches": "Agent's approaches",
  "sec.estimate": "Estimate · pick an approach",
  "sec.steps": "Implementation steps",
  "sec.wrap": "Wrap up",
  "sec.finalSpec": "Final spec",
  "sec.specDiff": "Diff against the original spec",
  "sec.logic": "How the code works",
  "sec.time": "Time log",
  "sec.done": "Done",

  // ---- Detail content ----
  "detail.createdAt": "Created {time}",
  "detail.notFound": "Task not found.",
  "detail.waitingAgent": "(waiting for the agent)",
  "req.empty": "Not written yet",
  "req.editAria": "Edit requirement",
  "title.editAria": "Edit title",
  "analyze.copyPrompt": "Copy Prompt",
  "analyze.hint": "Reads and writes under {path}",
  "analyze.needReq": "Write the requirement first.",
  "approach.pickedTag": "✔ chosen",
  "approach.pickedPrefix": "✔ chosen  ",

  // ---- Estimate ----
  "est.coldStart": "Not enough history ({n} sample(s)) — the distribution mixes in defaults, treat it as indicative",
  "est.breakdown": " (impl {impl} + analysis/discussion {plan})",
  "est.badHours": " Unusable estimate ({value}) — ask the agent to write `hours` in estimate.json as a number; this approach has no distribution",
  "est.idealHours": " ideal {hours}h{breakdown}",
  "est.approachName": "{name} ({id})",
  "dist.p50": "likely {hours}h",
  "dist.idealTitle": "ideal hours {hours}h",
  "legend.ideal": "Ideal hours (agent's estimate)",
  "legend.band": "90% probability range",
  "legend.p50": "Most likely",

  // ---- Chart reading hint ----
  "hint.title": "How to read this chart",
  "hint.p50": "Half the time you will exceed it. Use it to plan your own next few days.",
  "hint.band": "Committing a date to someone else? Take the right-hand number.",
  "hint.ideal":
    "The agent's raw estimate, uncorrected. Its distance to the solid bar is exactly what your velocity is correcting.",
  "hint.compare":
    "When comparing approaches, look at the gap between the solid bars: if the time saved is out of proportion to the spec you give up, don't switch.",
  "hint.notes": "Notes",
  "hint.note1":
    "Bar length reflects how accurate your past estimates were, not how hard this task is. That is why every bar on one task looks similar — each is just scaled by its own estimate.",
  "hint.note2": "The ⚠ lines are risks the agent flagged; the chart does not reflect them, read them yourself.",
  "hint.note3": "The unit is effort hours inside the working window, not calendar time.",

  // ---- Implementation steps ----
  "steps.copyGen": "Copy step-card prompt",
  "steps.copyGenAgain": "Copy step-card prompt (re-run)",
  "steps.copyImpl": "Copy implementation prompt",
  "steps.noSteps": "No step cards yet",
  "steps.hintPicked": "Not produced yet. The prompt below turns the chosen approach into step cards:",
  "steps.hintNoPick": "Not produced yet. Pick an approach first.",

  // ---- Wrap up ----
  "wrap.copy": "Copy Prompt",
  "wrap.copyAgain": "Copy Prompt (re-run)",
  "wrap.doneAny":
    "Already done. To re-run the wrap-up, press “Restart” on the left first — wrapping up is work too, and only counts toward velocity while the clock runs.",
  "wrap.doneNone":
    "Done, but there are no wrap-up docs. To add them press “Restart” on the left first — wrapping up is work too, and only counts toward velocity while the clock runs.",
  "wrap.hintAny": "If the code changed again you can re-run; the agent overwrites all three docs from the latest code.",
  "wrap.hintNone":
    "Once the implementation is settled, use the prompt below to have the agent write the final docs from the final code.",
  "wrap.hintNoSteps":
    "Not your turn yet. Have the agent generate step cards under “Implementation steps” and finish the work first, then it can wrap up.",

  // ---- Time log ----
  "time.addInterval": "Add interval manually",
  "time.running": "Running: {start} → (counting)",
  "time.elapsed": "Total elapsed: {hours} h",
  "time.counted": "Counted hours: {hours} h (working window only, used for velocity)",
  "time.taskVelocity": "Task velocity: {velocity} (est {ideal}h ÷ actual {actual}h{legacy})",
  "time.legacySuffix": " + legacy discussion",
  "time.legacyTitle": "Analysis/discussion (legacy record)",
  "off.checkbox": "{hours} h fell outside the working window — count them anyway",
  "off.explain":
    "These {hours} h are outside the working window (lunch, after hours or a day off) but sit right against when you pressed Start / Complete, so they are usually real work. Tick to count them as working hours.",
  "off.unconfirmed":
    "The working windows for those days are not confirmed, so out-of-window hours are only provisional. Confirm the windows on the home page first. This task stays out of the velocity history for now.",
  "off.undecided": "Not decided yet; this task stays out of the velocity history for now.",
};

const DICT = { "zh-Hant": zhHant, en };

let current = DEFAULT_LOCALE;

export function setLocale(code) {
  current = DICT[code] ? code : DEFAULT_LOCALE;
  return current;
}

export function getLocale() {
  return current;
}

// The tag for toLocaleString / toLocaleDateString. Dates and weekday names follow the UI language.
export function intlLocale() {
  return LOCALES.find((l) => l.code === current)?.intl ?? "en";
}

export function has(key) {
  return DICT[DEFAULT_LOCALE][key] !== undefined;
}

// Look up one string. A missing key falls back to the default locale, and a key missing there too
// comes back as itself. That looks bad but does not break, and looking bad is the point: it is
// what tells you a translation is missing, though i18n.test.mjs should have caught it before the
// commit. Values that are not strings, such as the weekday name array, are returned as they are.
export function t(key, params) {
  const s = DICT[current][key] ?? DICT[DEFAULT_LOCALE][key] ?? key;
  if (typeof s !== "string" || !params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : params[k]));
}

// Pick a language: a stored preference first, then the browser languages, then the default.
// Pure function, so it is easy to test.
// ponytail: only the primary subtag is compared, so zh-Hans lands on zh-Hant. Split it further
// once a Simplified Chinese dictionary actually exists.
export function pickLocale(stored, languages = []) {
  if (DICT[stored]) return stored;
  for (const lang of languages) {
    const primary = String(lang).toLowerCase().split("-")[0];
    const hit = LOCALES.find((l) => l.code.toLowerCase().split("-")[0] === primary);
    if (hit) return hit.code;
  }
  return DEFAULT_LOCALE;
}
