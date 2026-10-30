// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar-alt;

var CONFIG = {
  // ★ 予定の文字サイズ（iOSネイティブベクター文字・ポイント単位）
  singleLineFontSize: 9.0,
  twoLineFontSize: 8.0,

  // 1日分の横幅に入る1行あたりの文字数（これを超えると自動で2行目へ折り返し）
  charsPerColLine: 5,

  // サッカー予定の学年表記（幼児,U10,11 など）を省いて会場名を優先表示するか
  compactSoccerTitle: true,

  // 最大表示段数（2行バーのため3段がベストバランス）
  maxEventRows: 3,

  // レイアウト寸法（iOSネイティブポイント単位：312pt幅・週間天気行込みで3段完全収容）
  colWidth: 42,
  colGap: 3,
  barHeight: 22,
  barGapY: 2,
  barCornerRadius: 5,

  // 位置情報未許可・タイムアウト時の初期フォールバック座標（東京）
  defaultLat: 35.6895,
  defaultLon: 139.6917,

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

  // 端末内カレンダーから動的鍵を導出するスロット（どれか1つでも存在すれば即時ロック解除）
  encryptedAuthSlots: {
    0xf2d5b5b7:
      "52639e80b808365bd85600fba577b139db8c5ae66b7095329c6c1894c3b3b5f22b66c10b31058203d90e3991c09d0259ece12f0ae20995bdd8dd699c680a6ab358529807250e19e03960724d617991a0e77cc6cdb04baa4c34c0b2fd19d27e2c306a1aa0163eb50f8d5dc33caaadd8570277e37474c83b14ee6fec193d0d6148efc94a54e54ba8dde7a20505cea28765b76c0f5826e028455c942a19788b1c0f74ccc97df8bfe510905b1d62adb67f94bb335085daae0436cf8a5f432401170e2b554a91c24ae594a6f43f8e65fe434d19c20c252b32e90dcd7674037f2bf293c4c76ab8ad83eb2a",
    0x72b61c9e:
      "e77b90258ab890fadb4e26c6a558558c6b203c9eef68604bfc84dcaccd7c547ab1020308461f9432a621f2946bd388d70fc6237f009e6c3118b7382a098d44e621b2a2af26c9002a79ffd0a7d07c4d213ac2f2f1738f5a7923e7df14d17e374cf53e05c2becbcee550c895aced8264bb70a5083fc3e39224bb8b71bc12b1865915b349780e6552838b0077bd709a7645045755f10a08f0035727df5a2eb2400bbffb44b9a26e5a3d744289065a668713301bea4b8425b93e18d4ec19c662130696a352f4270c00efa8ff6f061dbb48f48c59cdde9894b280755ebe788cfd80ef8c986de1aad8c93a",
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

  // カレンダー予定と現在地の週間天気を並列で高速取得
  const [fetchResult, weatherIcons] = await Promise.all([
    fetchCalendarEvents(periodStart, periodEnd),
    fetchWeeklyWeather(days),
  ]);
  const rawEvents = fetchResult.events;
  const isDirectApi = fetchResult.isDirectApi;
  const layoutData = buildEventLayout(rawEvents, days);

  const widget = buildNativeVectorWidget(days, layoutData, isDirectApi, weatherIcons);

  // OSが許す最短サイクル（1分後）で次回更新をリクエスト
  const nextRefresh = new Date(Date.now() + 60 * 1000);
  widget.refreshAfterDate = nextRefresh;

  Script.setWidget(widget);

  // ウィジェットの「↻」タップ時やアプリ内実行時、更新完了後に即座にホーム画面へ自動で戻る
  if (!config.runsInWidget && typeof App !== "undefined" && App.close) {
    App.close();
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

  // 純粋なJS計算のみで認証情報を復号（iOS純正カレンダーへのアクセス完全ゼロ）
  try {
    const seed = [0x7fd2, 0x3044, 0x4e8b, 0x95a2, 0x9023]
      .map((c) => String.fromCharCode(c))
      .join("");
    const cipherHex = CONFIG.encryptedAuthSlots[0xf2d5b5b7];
    if (cipherHex) {
      const unlocked = decryptWithKey(cipherHex, seed + "#gcal_v3_salt_991");
      if (unlocked && unlocked.c && unlocked.s && unlocked.r) {
        try {
          fm.writeString(path, JSON.stringify(unlocked));
        } catch (_) {}
        return unlocked;
      }
    }
  } catch (_) {}
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
  const headers = {
    Authorization: "Bearer " + token,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };

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
    try {
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
    } catch (_) {
      return [];
    }
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
  // Google Calendar API v3 から直接リアルタイム取得（iOS純正カレンダーへのアクセス・フォールバックは完全廃止）
  try {
    const auth = await unlockGoogleAuth();
    if (auth) {
      const events = await fetchFromGoogleCalendarAPI(startDate, endDate, auth);
      return { events, isDirectApi: true };
    }
  } catch (err) {
    // 通信エラー（機内モード等）時のみ直近のGoogle APIキャッシュを利用
    try {
      const { fm, path } = getLocalCachePath("gcal_events_cache.json");
      if (fm.fileExists(path)) {
        const cached = JSON.parse(fm.readString(path));
        return {
          events: cached.map((e) => ({
            ...e,
            startDate: new Date(e.startDate),
            endDate: new Date(e.endDate),
          })),
          isDirectApi: false,
        };
      }
    } catch (_) {}
  }

  return { events: [], isDirectApi: false };
}

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weatherCodeToSpec(code) {
  const defaultSpec = { symbol: "sun.max.fill", color: "#FFCC00", fallback: "☀" };
  if (code === undefined || code === null) return defaultSpec;
  const c = Number(code);
  if (c === 0 || c === 1) {
    return { symbol: "sun.max.fill", color: "#FFCC00", fallback: "☀" };
  }
  if (c === 2) {
    return { symbol: "cloud.sun.fill", color: "#FFD60A", fallback: "⛅" };
  }
  if (c === 3 || c === 45 || c === 48) {
    return { symbol: "cloud.fill", color: "#D1D5DB", fallback: "☁" };
  }
  if ((c >= 51 && c <= 63) || c === 80 || c === 81) {
    return { symbol: "cloud.rain.fill", color: "#38BDF8", fallback: "🌧" };
  }
  if ((c >= 65 && c <= 67) || c === 82) {
    return { symbol: "umbrella.fill", color: "#60A5FA", fallback: "☔" };
  }
  if (c >= 95 && c <= 99) {
    return { symbol: "cloud.bolt.rain.fill", color: "#FACC15", fallback: "⚡" };
  }
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) {
    return { symbol: "snowflake", color: "#E0F2FE", fallback: "❄" };
  }
  return { symbol: "cloud.fill", color: "#D1D5DB", fallback: "☁" };
}

async function getCurrentCoordinates() {
  const { fm, path } = getLocalCachePath("gcal_location_cache.json");
  let cachedLoc = null;
  if (fm.fileExists(path)) {
    try {
      cachedLoc = JSON.parse(fm.readString(path));
    } catch (_) {}
  }

  // バックグラウンドウィジェット実行時はキャッシュがあれば即時利用（位置情報タイムアウトによる描画停止を防止）
  if (
    cachedLoc &&
    cachedLoc.latitude &&
    cachedLoc.longitude &&
    (config.runsInWidget || (cachedLoc.updatedAt && Date.now() - cachedLoc.updatedAt < 30 * 60 * 1000))
  ) {
    return { latitude: cachedLoc.latitude, longitude: cachedLoc.longitude };
  }

  try {
    if (typeof Location !== "undefined" && Location.current) {
      if (Location.setAccuracyToThreeKilometers) {
        Location.setAccuracyToThreeKilometers();
      } else if (Location.setAccuracyToKilometer) {
        Location.setAccuracyToKilometer();
      }
      const locPromise = Location.current();
      let loc = null;
      if (typeof Timer !== "undefined" && Timer.schedule) {
        const timeoutPromise = new Promise((resolve) => {
          Timer.schedule(2500, false, () => resolve(null));
        });
        loc = await Promise.race([locPromise, timeoutPromise]);
      } else {
        loc = await locPromise;
      }
      if (loc && loc.latitude && loc.longitude) {
        try {
          fm.writeString(
            path,
            JSON.stringify({
              latitude: loc.latitude,
              longitude: loc.longitude,
              updatedAt: Date.now(),
            })
          );
        } catch (_) {}
        return { latitude: loc.latitude, longitude: loc.longitude };
      }
    }
  } catch (_) {}

  if (cachedLoc && cachedLoc.latitude && cachedLoc.longitude) {
    return { latitude: cachedLoc.latitude, longitude: cachedLoc.longitude };
  }
  return { latitude: CONFIG.defaultLat, longitude: CONFIG.defaultLon };
}

async function fetchWeeklyWeather(days) {
  const { fm, path } = getLocalCachePath("gcal_weather_cache_v2.json");
  const defaultSpec = weatherCodeToSpec(0);
  try {
    const coords = await getCurrentCoordinates();
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${coords.latitude}&longitude=${coords.longitude}` +
      `&daily=weather_code&timezone=Asia%2FTokyo&forecast_days=8`;
    const req = new Request(url);
    req.timeoutInterval = 5;
    const res = await req.loadJSON();
    if (res && res.daily && Array.isArray(res.daily.time) && Array.isArray(res.daily.weather_code)) {
      const weatherMap = {};
      for (let i = 0; i < res.daily.time.length; i++) {
        weatherMap[res.daily.time[i]] = weatherCodeToSpec(res.daily.weather_code[i]);
      }
      try {
        fm.writeString(path, JSON.stringify(weatherMap));
      } catch (_) {}
      return days.map((d) => weatherMap[formatDateKey(d)] || defaultSpec);
    }
  } catch (_) {}

  try {
    if (fm.fileExists(path)) {
      const cachedMap = JSON.parse(fm.readString(path));
      return days.map((d) => cachedMap[formatDateKey(d)] || defaultSpec);
    }
  } catch (_) {}

  return days.map(() => defaultSpec);
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

function buildNativeVectorWidget(days, { grid }, isDirectApi, weatherIcons) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color(CONFIG.bgColor);
  widget.url = CONFIG.tapUrl;
  widget.setPadding(6, 10, 6, 10);

  const colW = CONFIG.colWidth;
  const gapX = CONFIG.colGap;
  const totalWidth = colW * 7 + gapX * 6;

  // 1. ヘッダー行（左: 10月 / 右: ↻更新ボタン ＋ 予定追加ボタン）
  // ※ addSpacer() は最小幅を食うため使わず、固定Size＋centerAlignContentで幅100%維持＆中央揃え
  const headerRow = widget.addStack();
  headerRow.layoutHorizontally();
  headerRow.centerAlignContent();
  headerRow.size = new Size(totalWidth, 16);

  const firstMonth = days[0].getMonth() + 1;
  const monthTxt = headerRow.addText(`${firstMonth}月`);
  monthTxt.font = Font.boldSystemFont(13);
  monthTxt.textColor = new Color(CONFIG.monthTextColor);

  headerRow.addSpacer();

  // ↻ 更新ボタン（Google API直結時は緑色、タップ時は再取得してApp.close()で即ホーム画面へ戻る）
  const refreshBtn = headerRow.addStack();
  refreshBtn.layoutHorizontally();
  refreshBtn.centerAlignContent();
  refreshBtn.size = new Size(28, 16);
  refreshBtn.cornerRadius = 8;
  refreshBtn.backgroundColor = new Color(CONFIG.refreshBtnBg);
  refreshBtn.url = getRunScriptUrl();
  const refreshTxt = refreshBtn.addText("↻");
  refreshTxt.font = Font.boldSystemFont(11.5);
  refreshTxt.textColor = new Color(isDirectApi ? CONFIG.plusColor : CONFIG.refreshBtnText);
  refreshTxt.centerAlignText();

  headerRow.addSpacer(8);

  // ＋ ボタン（Googleカレンダーを開く）
  const plusBtn = headerRow.addStack();
  plusBtn.layoutHorizontally();
  plusBtn.centerAlignContent();
  plusBtn.size = new Size(20, 16);
  plusBtn.url = CONFIG.tapUrl;
  const plusTxt = plusBtn.addText("＋");
  plusTxt.font = Font.mediumSystemFont(14);
  plusTxt.textColor = new Color(CONFIG.plusColor);
  plusTxt.centerAlignText();

  widget.addSpacer(1);

  // 2. 曜日行（addSpacerを使わず colW の横幅を100%使って中央揃え）
  const weekdayRow = widget.addStack();
  weekdayRow.layoutHorizontally();
  weekdayRow.size = new Size(totalWidth, 11);
  weekdayRow.url = CONFIG.tapUrl;

  for (let col = 0; col < 7; col++) {
    const cell = weekdayRow.addStack();
    cell.layoutHorizontally();
    cell.centerAlignContent();
    cell.size = new Size(colW, 11);

    const dow = days[col].getDay();
    const wTxt = cell.addText(WEEKDAYS_JP[dow]);
    wTxt.font = Font.mediumSystemFont(9);
    wTxt.textColor = new Color(CONFIG.weekdayTextColor);
    wTxt.centerAlignText();

    if (col < 6) weekdayRow.addSpacer(gapX);
  }

  widget.addSpacer(1);

  // 3. 区切り線
  const divider = widget.addStack();
  divider.size = new Size(totalWidth, 1);
  divider.backgroundColor = new Color(CONFIG.dividerColor);

  widget.addSpacer(2);

  // 4. 日付行（白丸の「30」が潰れないよう addSpacer を排除し Size + centerAlignContent で中央配置）
  const dateRow = widget.addStack();
  dateRow.layoutHorizontally();
  dateRow.centerAlignContent();
  dateRow.size = new Size(totalWidth, 18);
  dateRow.url = CONFIG.tapUrl;

  for (let col = 0; col < 7; col++) {
    const cell = dateRow.addStack();
    cell.layoutHorizontally();
    cell.centerAlignContent();
    cell.size = new Size(colW, 18);

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
      circle.size = new Size(18, 18);
      circle.cornerRadius = 9;
      circle.backgroundColor = new Color(CONFIG.todayCircleColor);

      const dTxt = circle.addText(String(d.getDate()));
      dTxt.font = Font.boldSystemFont(10.5);
      dTxt.textColor = new Color(textColor);
      dTxt.centerAlignText();
    } else {
      const dTxt = cell.addText(String(d.getDate()));
      dTxt.font = Font.regularSystemFont(10.5);
      dTxt.textColor = new Color(textColor);
      dTxt.centerAlignText();
    }

    if (col < 6) dateRow.addSpacer(gapX);
  }

  widget.addSpacer(1);

  // 5. 週間天気アイコン行（Apple純正 SF Symbols ベクター＆高視認ネオンカラー配色）
  const weatherRow = widget.addStack();
  weatherRow.layoutHorizontally();
  weatherRow.centerAlignContent();
  weatherRow.size = new Size(totalWidth, 14);

  const defaultWeatherSpec = weatherCodeToSpec(0);
  for (let col = 0; col < 7; col++) {
    const wCell = weatherRow.addStack();
    wCell.layoutHorizontally();
    wCell.centerAlignContent();
    wCell.size = new Size(colW, 14);

    const wSpec = (weatherIcons && weatherIcons[col] && weatherIcons[col].symbol)
      ? weatherIcons[col]
      : defaultWeatherSpec;

    let renderedSymbol = false;
    if (typeof SFSymbol !== "undefined" && SFSymbol.named) {
      try {
        const sym = SFSymbol.named(wSpec.symbol);
        if (sym && sym.image) {
          if (sym.applyFont) {
            sym.applyFont(Font.mediumSystemFont(13));
          }
          const img = wCell.addImage(sym.image);
          img.imageSize = new Size(14, 14);
          img.tintColor = new Color(wSpec.color);
          renderedSymbol = true;
        }
      } catch (_) {}
    }

    if (!renderedSymbol) {
      const wIconTxt = wCell.addText(wSpec.fallback || "☀");
      wIconTxt.font = Font.boldSystemFont(11);
      wIconTxt.textColor = new Color(wSpec.color);
      wIconTxt.centerAlignText();
    }

    if (col < 6) weatherRow.addSpacer(gapX);
  }

  widget.addSpacer(2);

  // 6. 予定バー行（addSpacerによる横幅侵食をゼロにしつつ、各行を horizontal Stack + size(barW) で完全中央揃え）
  for (let r = 0; r < CONFIG.maxEventRows; r++) {
    const rowCells = grid[r] || [null, null, null, null, null, null, null];
    const evRow = widget.addStack();
    evRow.layoutHorizontally();
    evRow.centerAlignContent();
    evRow.size = new Size(totalWidth, CONFIG.barHeight);
    evRow.url = CONFIG.tapUrl;

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
            lineRow.size = new Size(barW, 10);

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
