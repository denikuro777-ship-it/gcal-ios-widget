// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar-alt;

var CONFIG = {
  // ★ 予定の文字サイズ（iOSネイティブベクター文字・ポイント単位）
  singleLineFontSize: 9.5,
  twoLineFontSize: 8.5,

  // 1日分の横幅に入る1行あたりの文字数（これを超えると自動で2行目へ折り返し）
  charsPerColLine: 5,

  // サッカー予定の学年表記（幼児,U10,11 など）を省いて会場名を優先表示するか
  compactSoccerTitle: true,

  // 最大表示段数（2行バーのため3段がベストバランス）
  maxEventRows: 3,

  // レイアウト寸法（iOSネイティブポイント単位：312pt幅）
  colWidth: 42,
  colGap: 3,
  barHeight: 26,
  barGapY: 3,
  barCornerRadius: 5,

  // 除外するカレンダー名
  excludeCalendars: [
    "RUN'S SC",
    "誕生日",
    "Birthdays",
    "Siriからの提案",
  ],

  targetCalendars: [],

  // スクショ2枚目のGoogleカレンダーダークモード配色
  calendarColorMap: {
    "みつ": "#D96B27",            // オレンジ
    "家族": "#616161",            // グレー
    "習い事関連": "#6E7CC5",      // 青紫
    "マイ カレンダー": "#6E7CC5", // 青紫
    "祝日": "#2A8C72",            // ティールグリーン
    "日本の祝日": "#2A8C72",      // ティールグリーン
  },

  // カラーテーマ
  bgColor: "#1E1E20",
  monthTextColor: "#FFFFFF",
  plusColor: "#2ECC71",
  refreshBtnBg: "#2C2C2E",
  refreshBtnText: "#AEAEB2",
  dividerColor: "#333336",
  weekdayTextColor: "#8E8E93",
  sundayColor: "#FF453A",
  saturdayColor: "#2E8CFF",
  dateTextColor: "#FFFFFF",
  todayCircleColor: "#FFFFFF",
  todayWeekdayText: "#1E1E20",
  eventTextColor: "#FFFFFF",
  overflowTextColor: "#8E8E93",

  tapUrl: "googlecalendar://",
};

var WEEKDAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

async function main() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  const periodStart = days[0];
  const periodEnd = new Date(days[6]);
  periodEnd.setHours(23, 59, 59, 999);

  const rawEvents = await fetchCalendarEvents(periodStart, periodEnd);
  const layoutData = buildEventLayout(rawEvents, days);

  const widget = buildNativeVectorWidget(days, layoutData);

  // OSが許す最短サイクル（1分後）で次回更新をリクエスト
  const nextRefresh = new Date(Date.now() + 60 * 1000);
  widget.refreshAfterDate = nextRefresh;

  Script.setWidget(widget);

  if (!config.runsInWidget) {
    const qp = (typeof args !== "undefined" && args.queryParameters) ? args.queryParameters : {};
    if (qp.action === "refresh" && typeof App !== "undefined" && App.close) {
      // ウィジェットの「↻」ボタンから呼ばれた場合はプレビューを出さずに自動でホーム画面へ戻る
      App.close();
    } else {
      await widget.presentMedium();
    }
  }
  Script.complete();
}

function isCalendarAllowed(calName) {
  if (!calName) return true;
  const trimmed = String(calName).trim();
  for (const ex of CONFIG.excludeCalendars) {
    if (trimmed === ex || trimmed.includes(ex)) return false;
  }
  if (CONFIG.targetCalendars.length === 0) return true;
  return CONFIG.targetCalendars.some((t) => trimmed === t || trimmed.includes(t));
}

function resolveCalendarColor(calName, fallbackHex) {
  if (calName) {
    const trimmed = String(calName).trim();
    if (CONFIG.calendarColorMap[trimmed]) {
      return CONFIG.calendarColorMap[trimmed];
    }
    if (trimmed.includes("祝日")) return "#2A8C72";
    if (trimmed.includes("みつ")) return "#D96B27";
    if (trimmed.includes("家族")) return "#616161";
    if (trimmed.includes("習い事")) return "#6E7CC5";
  }
  return fallbackHex || "#6E7CC5";
}

function formatEventTitle(rawTitle) {
  if (!rawTitle) return "(タイトルなし)";
  let t = String(rawTitle)
    .replace(/^[\[【]?サッカー[\]】]?\s*/g, "⚽️")
    .replace(/[\[【]?サッカー[\]】]?/g, "⚽️");

  if (CONFIG.compactSoccerTitle && t.includes("⚽️")) {
    t = t
      .replace(/(?:幼児[\s,、・+]*)?[uU][\d\-_,+/、・~〜α＆&\s]*\d+\s*/g, "")
      .replace(/\s+/g, "");
  }
  return t;
}

async function fetchCalendarEvents(startDate, endDate) {
  let calendars = await Calendar.forEvents();
  calendars = calendars.filter((c) => isCalendarAllowed(c.title));

  const events = await CalendarEvent.between(startDate, endDate, calendars);
  const seenKey = new Set();
  const result = [];

  for (const ev of events) {
    const title = formatEventTitle(ev.title);
    const sKey = `${ev.startDate.getFullYear()}-${ev.startDate.getMonth()}-${ev.startDate.getDate()}_${title}`;
    if (seenKey.has(sKey)) continue;
    seenKey.add(sKey);

    const calName = ev.calendar ? ev.calendar.title : "";
    const rawColor = ev.calendar && ev.calendar.color ? `#${ev.calendar.color.hex}` : "#6E7CC5";
    result.push({
      title,
      startDate: ev.startDate,
      endDate: ev.endDate,
      isAllDay: ev.isAllDay,
      colorHex: resolveCalendarColor(calName, rawColor),
    });
  }
  return result;
}

function buildEventLayout(events, days) {
  const dayStartMs = days.map((d) => d.getTime());
  const dayEndMs = days.map((d) => {
    const e = new Date(d);
    e.setHours(23, 59, 59, 999);
    return e.getTime();
  });

  const normalized = [];
  for (const ev of events) {
    const evStart = ev.startDate.getTime();
    let evEnd = ev.endDate.getTime();
    if (ev.isAllDay && evEnd > evStart) {
      evEnd -= 1000;
    } else if (
      ev.endDate.getHours() === 0 &&
      ev.endDate.getMinutes() === 0 &&
      ev.endDate.getSeconds() === 0 &&
      evEnd > evStart
    ) {
      evEnd -= 1000;
    }

    let startCol = -1;
    let endCol = -1;
    for (let col = 0; col < 7; col++) {
      if (evEnd >= dayStartMs[col] && evStart <= dayEndMs[col]) {
        if (startCol === -1) startCol = col;
        endCol = col;
      }
    }

    if (startCol !== -1 && endCol !== -1) {
      normalized.push({
        ...ev,
        startCol,
        endCol,
        span: endCol - startCol + 1,
      });
    }
  }

  normalized.sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    if (b.span !== a.span) return b.span - a.span;
    if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
    return a.startDate.getTime() - b.startDate.getTime();
  });

  const grid = [];
  const overflowCountByCol = [0, 0, 0, 0, 0, 0, 0];

  for (const ev of normalized) {
    let targetRow = 0;
    while (true) {
      if (!grid[targetRow]) {
        grid[targetRow] = [null, null, null, null, null, null, null];
      }
      let canFit = true;
      for (let c = ev.startCol; c <= ev.endCol; c++) {
        if (grid[targetRow][c] !== null) {
          canFit = false;
          break;
        }
      }
      if (canFit) break;
      targetRow++;
    }

    for (let c = ev.startCol; c <= ev.endCol; c++) {
      grid[targetRow][c] = ev;
    }

    if (targetRow >= CONFIG.maxEventRows) {
      for (let c = ev.startCol; c <= ev.endCol; c++) {
        overflowCountByCol[c]++;
      }
    }
  }

  return { grid, overflowCountByCol };
}

function splitIntoTwoLines(str, maxPerLine) {
  if (!str) return [""];
  let segments;
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const seg = new Intl.Segmenter("ja", { granularity: "grapheme" });
    segments = Array.from(seg.segment(str), (s) => s.segment);
  } else {
    segments = Array.from(str);
  }

  if (segments.length <= maxPerLine) {
    return [segments.join("")];
  }
  const line1 = segments.slice(0, maxPerLine).join("");
  const line2 = segments.slice(maxPerLine, maxPerLine * 2).join("");
  return [line1, line2];
}

function getRunScriptUrl() {
  let base = "scriptable:///";
  try {
    if (typeof URLScheme !== "undefined" && URLScheme.forRunningScript) {
      base = URLScheme.forRunningScript();
    } else if (typeof Script !== "undefined" && Script.name) {
      base = "scriptable:///run?scriptName=" + encodeURIComponent(Script.name());
    }
  } catch (_) {}
  const sep = base.includes("?") ? "&" : "?";
  return base + sep + "action=refresh";
}

function buildNativeVectorWidget(days, { grid }) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color(CONFIG.bgColor);
  widget.url = CONFIG.tapUrl;
  widget.setPadding(8, 10, 8, 10);

  const colW = CONFIG.colWidth;
  const gapX = CONFIG.colGap;
  const totalWidth = colW * 7 + gapX * 6;

  // 1. ヘッダー行（左: 10月 / 右: ↻更新ボタン ＋ 予定追加ボタン）
  // ※ addSpacer() は最小幅を食うため使わず、固定Size＋centerAlignContentで幅100%維持＆中央揃え
  const headerRow = widget.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();
  headerRow.size = new Size(totalWidth, 18);

  const firstMonth = days[0].getMonth() + 1;
  const monthTxt = headerRow.addText(`${firstMonth}月`);
  monthTxt.font = Font.boldSystemFont(14);
  monthTxt.textColor = new Color(CONFIG.monthTextColor);

  headerRow.addSpacer();

  // ↻ 更新ボタン（addSpacerを使わずSizeとcenterAlignContentで中央配置）
  const refreshBtn = headerRow.addStack();
  refreshBtn.layoutHorizontally();
  refreshBtn.centerAlignContent();
  refreshBtn.size = new Size(28, 17);
  refreshBtn.cornerRadius = 8;
  refreshBtn.backgroundColor = new Color(CONFIG.refreshBtnBg);
  refreshBtn.url = getRunScriptUrl();
  const refreshTxt = refreshBtn.addText("↻");
  refreshTxt.font = Font.boldSystemFont(12);
  refreshTxt.textColor = new Color(CONFIG.refreshBtnText);
  refreshTxt.centerAlignText();

  headerRow.addSpacer(8);

  // ＋ ボタン（Googleカレンダーを開く）
  const plusBtn = headerRow.addStack();
  plusBtn.layoutHorizontally();
  plusBtn.centerAlignContent();
  plusBtn.size = new Size(20, 17);
  plusBtn.url = CONFIG.tapUrl;
  const plusTxt = plusBtn.addText("＋");
  plusTxt.font = Font.mediumSystemFont(15);
  plusTxt.textColor = new Color(CONFIG.plusColor);
  plusTxt.centerAlignText();

  widget.addSpacer(2);

  // 2. 曜日行（addSpacerを使わず colW の横幅を100%使って中央揃え）
  const weekdayRow = widget.addStack();
  weekdayRow.layoutHorizontally();
  weekdayRow.size = new Size(totalWidth, 13);

  for (let col = 0; col < 7; col++) {
    const cell = weekdayRow.addStack();
    cell.layoutHorizontally();
    cell.centerAlignContent();
    cell.size = new Size(colW, 13);

    const dow = days[col].getDay();
    const wTxt = cell.addText(WEEKDAYS_JP[dow]);
    wTxt.font = Font.mediumSystemFont(9.5);
    wTxt.textColor = new Color(CONFIG.weekdayTextColor);
    wTxt.centerAlignText();

    if (col < 6) weekdayRow.addSpacer(gapX);
  }

  widget.addSpacer(2);

  // 3. 区切り線
  const divider = widget.addStack();
  divider.size = new Size(totalWidth, 1);
  divider.backgroundColor = new Color(CONFIG.dividerColor);

  widget.addSpacer(3);

  // 4. 日付行（白丸の「30」が潰れないよう addSpacer を排除し Size + centerAlignContent で中央配置）
  const dateRow = widget.addStack();
  dateRow.layoutHorizontally();
  dateRow.centerAlignContent();
  dateRow.size = new Size(totalWidth, 20);

  for (let col = 0; col < 7; col++) {
    const cell = dateRow.addStack();
    cell.layoutHorizontally();
    cell.centerAlignContent();
    cell.size = new Size(colW, 20);

    const d = days[col];
    const dow = d.getDay();
    const isToday = col === 0;

    let textColor = CONFIG.dateTextColor;
    if (dow === 0) {
      textColor = CONFIG.sundayColor;
    } else if (dow === 6) {
      textColor = CONFIG.saturdayColor;
    } else if (isToday) {
      textColor = CONFIG.todayWeekdayText;
    }

    if (isToday) {
      const circle = cell.addStack();
      circle.layoutHorizontally();
      circle.centerAlignContent();
      circle.size = new Size(20, 20);
      circle.cornerRadius = 10;
      circle.backgroundColor = new Color(CONFIG.todayCircleColor);

      const dTxt = circle.addText(String(d.getDate()));
      dTxt.font = Font.boldSystemFont(11);
      dTxt.textColor = new Color(textColor);
      dTxt.centerAlignText();
    } else {
      const dTxt = cell.addText(String(d.getDate()));
      dTxt.font = Font.regularSystemFont(11);
      dTxt.textColor = new Color(textColor);
      dTxt.centerAlignText();
    }

    if (col < 6) dateRow.addSpacer(gapX);
  }

  widget.addSpacer(4);

  // 5. 予定バー行（addSpacerによる横幅侵食をゼロにしつつ、各行を horizontal Stack + size(barW) で完全中央揃え）
  for (let r = 0; r < CONFIG.maxEventRows; r++) {
    const rowCells = grid[r] || [null, null, null, null, null, null, null];
    const evRow = widget.addStack();
    evRow.layoutHorizontally();
    evRow.centerAlignContent();
    evRow.size = new Size(totalWidth, CONFIG.barHeight);

    let col = 0;
    while (col < 7) {
      const ev = rowCells[col];
      if (!ev) {
        const emptyCell = evRow.addStack();
        emptyCell.size = new Size(colW, CONFIG.barHeight);
        col++;
        if (col < 7) evRow.addSpacer(gapX);
      } else {
        const span = ev.span;
        const barW = colW * span + gapX * (span - 1);

        const bar = evRow.addStack();
        bar.layoutVertically();
        bar.centerAlignContent();
        bar.size = new Size(barW, CONFIG.barHeight);
        bar.backgroundColor = new Color(ev.colorHex);
        bar.cornerRadius = CONFIG.barCornerRadius;
        bar.setPadding(1, 0, 1, 0);

        const maxPerLine = CONFIG.charsPerColLine * span;
        const lines = splitIntoTwoLines(ev.title, maxPerLine);

        if (lines.length === 1) {
          const lineRow = bar.addStack();
          lineRow.layoutHorizontally();
          lineRow.centerAlignContent();
          lineRow.size = new Size(barW, CONFIG.barHeight - 2);

          const t1 = lineRow.addText(lines[0]);
          t1.font = Font.boldSystemFont(CONFIG.singleLineFontSize);
          t1.textColor = new Color(CONFIG.eventTextColor);
          t1.centerAlignText();
          t1.lineLimit = 1;
          t1.minimumScaleFactor = 0.75;
        } else {
          for (let i = 0; i < 2; i++) {
            const lineRow = bar.addStack();
            lineRow.layoutHorizontally();
            lineRow.centerAlignContent();
            lineRow.size = new Size(barW, 12);

            const t = lineRow.addText(lines[i]);
            t.font = Font.boldSystemFont(CONFIG.twoLineFontSize);
            t.textColor = new Color(CONFIG.eventTextColor);
            t.centerAlignText();
            t.lineLimit = 1;
            t.minimumScaleFactor = 0.75;
          }
        }

        col += span;
        if (col < 7) evRow.addSpacer(gapX);
      }
    }

    if (r < CONFIG.maxEventRows - 1) {
      widget.addSpacer(CONFIG.barGapY);
    }
  }

  widget.addSpacer();
  return widget;
}

await main();
