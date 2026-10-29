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

  // 除外カレンダーのFNV-1aハッシュ（RUN'S SC / 誕生日 / Birthdays / Siriからの提案）
  excludeCalendarHashes: [
    0x37596a62,
    0x729b5c08,
    0x9110782d,
    0x0fd877fa,
  ],

  // カレンダー名ハッシュ別カラーマップ（Googleカレンダーダークモード配色）
  calendarColorHashes: {
    0x72b61c9e: "#D96B27", // オレンジ
    0x06a85db2: "#616161", // グレー
    0xf2d5b5b7: "#6E7CC5", // 青紫
    0xc49b0997: "#6E7CC5", // 青紫（マイカレンダー）
    0x77cd2a57: "#2A8C72", // ティールグリーン（祝日）
    0x36c0b034: "#2A8C72", // ティールグリーン（日本の祝日）
  },

  // 端末内カレンダーから動的鍵を導出するための対象ハッシュ順序
  keySlotHashes: [0x72b61c9e, 0x06a85db2, 0xf2d5b5b7],

  // 端末固有カレンダー名で暗号化されたGoogle Calendar APIダイレクト認証ペイロード
  encryptedAuthHex:
    "4345201017f7e5633213b11305c40bcce5367f80762621245a07cf4c30ed72e37a3e52d237d97f120e111bc185d6f6863527cf8dc6f669b1f029fe0dbb48e6db3a61890db5757667ca28d1e8bf456b8c2b3e66b273d905227d6a56f2043f2922e6b2d52d3a203b9125d3ee6c054ed3021568d44a74c270e77271b8aadc7e27e62c743ddfc90ff94aadeedbec9b6fb5532a9752b5f0a575e98b1db0fe5c1b7a3a9cc772a5abaa40c06da703e1a7af566bb62082d3705fe7841db74d0575ce326ba3c06fb3d282338750859063c13fd94f9871f93552e12f9cc9db7fe2c945a173dcad21e95c20ef36",

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

function fnv1aHash(str) {
  let h = 0x811c9dc5;
  const s = String(str || "").trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function utf8Bytes(str) {
  const encoded = encodeURIComponent(str);
  const bytes = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === "%") {
      bytes.push(parseInt(encoded.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return bytes;
}

function utf8Decode(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += "%" + ("0" + (bytes[i] & 0xff).toString(16)).slice(-2);
  }
  return decodeURIComponent(hex);
}

function decryptWithKey(hexCipher, keyStr) {
  const keyBytes = utf8Bytes(keyStr);
  if (keyBytes.length === 0) return null;

  const S = new Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }

  let i = 0;
  j = 0;
  const out = [];
  for (let idx = 0; idx < hexCipher.length; idx += 2) {
    const b = parseInt(hexCipher.substr(idx, 2), 16);
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    const k = S[(S[i] + S[j]) & 0xff];
    out.push(b ^ k);
  }

  const jsonStr = utf8Decode(out);
  return JSON.parse(jsonStr);
}

function getLocalCachePath(filename) {
  const fm = FileManager.local();
  return { fm, path: fm.joinPath(fm.documentsDirectory(), filename) };
}

async function unlockGoogleAuth() {
  const { fm, path } = getLocalCachePath("gcal_direct_auth.json");
  if (fm.fileExists(path)) {
    try {
      const cached = JSON.parse(fm.readString(path));
      if (cached && cached.c && cached.s && cached.r) {
        return cached;
      }
    } catch (_) {}
  }

  // 初回のみiPhone内のカレンダー一覧から鍵を自動生成して復号
  const iosCals = await Calendar.forEvents();
  const slotMap = {};
  for (const c of iosCals) {
    const title = String(c.title || "").trim();
    const h = fnv1aHash(title);
    slotMap[h] = title;
  }

  const parts = CONFIG.keySlotHashes.map((h) => slotMap[h]);
  if (parts.some((p) => !p)) {
    return null;
  }

  const keyStr = parts.join("|");
  const unlocked = decryptWithKey(CONFIG.encryptedAuthHex, keyStr);
  if (unlocked && unlocked.c && unlocked.s && unlocked.r) {
    try {
      fm.writeString(path, JSON.stringify(unlocked));
    } catch (_) {}
    return unlocked;
  }
  return null;
}

async function getValidAccessToken(auth) {
  const nowMs = Date.now();
  if (auth.accessToken && auth.expiresAt && nowMs < auth.expiresAt - 60000) {
    return auth.accessToken;
  }

  const req = new Request("https://oauth2.googleapis.com/token");
  req.method = "POST";
  req.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  req.body =
    "client_id=" + encodeURIComponent(auth.c) +
    "&client_secret=" + encodeURIComponent(auth.s) +
    "&refresh_token=" + encodeURIComponent(auth.r) +
    "&grant_type=refresh_token";
  req.timeoutInterval = 8;

  const res = await req.loadJSON();
  if (!res || !res.access_token) {
    throw new Error("Failed to obtain access_token");
  }

  auth.accessToken = res.access_token;
  auth.expiresAt = nowMs + (res.expires_in || 3600) * 1000;

  try {
    const { fm, path } = getLocalCachePath("gcal_direct_auth.json");
    fm.writeString(path, JSON.stringify(auth));
  } catch (_) {}

  return auth.accessToken;
}

function isCalendarAllowed(calName, calId) {
  if (calId && String(calId).includes("addressbook#contacts")) return false;
  if (!calName) return true;
  const h = fnv1aHash(calName);
  if (CONFIG.excludeCalendarHashes.includes(h)) return false;
  return true;
}

function resolveCalendarColor(calName, fallbackHex, isPrimary, calId) {
  if (calId && String(calId).includes("#holiday")) {
    return "#2A8C72";
  }
  if (calName) {
    const h = fnv1aHash(calName);
    if (CONFIG.calendarColorHashes[h]) {
      return CONFIG.calendarColorHashes[h];
    }
  }
  if (isPrimary) {
    return "#6E7CC5";
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

function parseLocalDate(yyyyMmDd) {
  const parts = String(yyyyMmDd).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

async function fetchFromGoogleCalendarAPI(startDate, endDate, auth) {
  const token = await getValidAccessToken(auth);
  const headers = { Authorization: "Bearer " + token };

  const listReq = new Request("https://www.googleapis.com/calendar/v3/users/me/calendarList");
  listReq.headers = headers;
  listReq.timeoutInterval = 8;
  const listRes = await listReq.loadJSON();
  const calItems = (listRes && listRes.items) ? listRes.items : [];

  const targetCals = calItems.filter((c) => {
    const title = c.summaryOverride || c.summary || "";
    return isCalendarAllowed(title, c.id);
  });

  const timeMin = encodeURIComponent(startDate.toISOString());
  const timeMax = encodeURIComponent(endDate.toISOString());

  const perCalendarPromises = targetCals.map(async (cal) => {
    const calIdEnc = encodeURIComponent(cal.id);
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${calIdEnc}/events` +
      `?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=250`;
    const evReq = new Request(url);
    evReq.headers = headers;
    evReq.timeoutInterval = 8;
    const evRes = await evReq.loadJSON();
    const items = (evRes && evRes.items) ? evRes.items : [];
    const calTitle = cal.summaryOverride || cal.summary || "";
    const colorHex = resolveCalendarColor(calTitle, cal.backgroundColor, Boolean(cal.primary), cal.id);

    const parsed = [];
    for (const item of items) {
      if (item.status === "cancelled") continue;
      const isAllDay = Boolean(item.start && item.start.date);
      const evStart = isAllDay
        ? parseLocalDate(item.start.date)
        : new Date(item.start.dateTime);
      const evEnd = isAllDay
        ? parseLocalDate(item.end.date)
        : new Date(item.end.dateTime);

      parsed.push({
        title: formatEventTitle(item.summary),
        startDate: evStart,
        endDate: evEnd,
        isAllDay,
        colorHex,
      });
    }
    return parsed;
  });

  const allCalArrays = await Promise.all(perCalendarPromises);
  const seenKey = new Set();
  const result = [];

  for (const arr of allCalArrays) {
    for (const ev of arr) {
      const sKey = `${ev.startDate.getFullYear()}-${ev.startDate.getMonth()}-${ev.startDate.getDate()}_${ev.title}`;
      if (seenKey.has(sKey)) continue;
      seenKey.add(sKey);
      result.push(ev);
    }
  }

  // オフライン時用に最新取得結果をローカル保存
  try {
    const { fm, path } = getLocalCachePath("gcal_events_cache.json");
    fm.writeString(
      path,
      JSON.stringify(
        result.map((e) => ({
          ...e,
          startDate: e.startDate.toISOString(),
          endDate: e.endDate.toISOString(),
        }))
      )
    );
  } catch (_) {}

  return result;
}

async function fetchCalendarEvents(startDate, endDate) {
  // 1. Google Calendar API v3 から直接リアルタイム取得（Appleカレンダー同期ラグ0秒）
  try {
    const auth = await unlockGoogleAuth();
    if (auth) {
      return await fetchFromGoogleCalendarAPI(startDate, endDate, auth);
    }
  } catch (err) {
    // 通信エラー時は直近のキャッシュがあれば優先利用
    try {
      const { fm, path } = getLocalCachePath("gcal_events_cache.json");
      if (fm.fileExists(path)) {
        const cached = JSON.parse(fm.readString(path));
        return cached.map((e) => ({
          ...e,
          startDate: new Date(e.startDate),
          endDate: new Date(e.endDate),
        }));
      }
    } catch (_) {}
  }

  // 2. フォールバック：iOS標準カレンダー経由
  let calendars = await Calendar.forEvents();
  calendars = calendars.filter((c) => isCalendarAllowed(c.title, ""));

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
      colorHex: resolveCalendarColor(calName, rawColor, false, ""),
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
