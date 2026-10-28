// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: calendar-alt;

const API_URL = "https://api.github.com/repos/denikuro777-ship-it/gcal-ios-widget/contents/gcal_widget.js?ref=main&t=" + Date.now();
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "gcal_widget_cached.js");

let code = "";
try {
  const req = new Request(API_URL);
  req.headers = {
    "Accept": "application/vnd.github.v3.raw",
    "Cache-Control": "no-cache"
  };
  req.timeoutInterval = 8;
  code = await req.loadString();
  if (code && code.includes("buildNativeVectorWidget")) {
    fm.writeString(cachePath, code);
  } else if (fm.fileExists(cachePath)) {
    code = fm.readString(cachePath);
  }
} catch (e) {
  if (fm.fileExists(cachePath)) {
    code = fm.readString(cachePath);
  }
}

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
await new AsyncFunction(code)();
