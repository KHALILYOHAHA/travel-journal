/**
 * 旅行手帳 — hand-drawn travel journal SPA
 * Data persisted in localStorage under TRAVEL_JOURNAL_V2
 * Multi-trip store (version 3); old single-trip blobs auto-migrate
 */
(function () {
  "use strict";

  const STORAGE_KEY = "TRAVEL_JOURNAL_V2";
  const SYNC_KEY = "TRAVEL_JOURNAL_SYNC";
  const GIST_FILENAME = "travel-journal-v2.json";
  /** Shared public gist — phones can pull with zero setup */
  const DEFAULT_PUBLIC_GIST_ID = "bd9a99b1449d9288d1b075d485d17c11";
  const GITHUB_API = "https://api.github.com";
  const GITHUB_API_HEADERS_BASE = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const CAT_COLORS = {
    交通: "#6b9bd1",
    住宿: "#9b7bb8",
    飲食: "#e07a5f",
    門票: "#7a9e7e",
    購物: "#e8a06a",
    其他: "#9a9a9a",
  };

  /** Yahoo Finance FX — quotes are already 1 foreign unit → HKD */
  const YAHOO_SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark";
  const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
  const FX_OPTIONS = [
    { code: "HKD", label: "港幣／唔用外幣", symbol: "$", none: true },
    { code: "JPY", label: "日元 (JPY)", symbol: "¥", yahoo: "JPYHKD=X" },
    { code: "USD", label: "美元 (USD)", symbol: "US$", yahoo: "USDHKD=X" },
    { code: "EUR", label: "歐羅 (EUR)", symbol: "€", yahoo: "EURHKD=X" },
    { code: "GBP", label: "英鎊 (GBP)", symbol: "£", yahoo: "GBPHKD=X" },
    { code: "CNY", label: "人民幣在岸 (CNY)", symbol: "¥", yahoo: "CNYHKD=X" },
    { code: "CNH", label: "人民幣離岸 (CNH)", symbol: "¥", yahoo: "CNHHKD=X" },
    { code: "NTD", label: "新台幣 (NTD)", symbol: "NT$", yahoo: "TWDHKD=X" },
    { code: "WON", label: "韓圜 (WON)", symbol: "₩", yahoo: "KRWHKD=X" },
    { code: "THB", label: "泰銖 (THB)", symbol: "฿", yahoo: "THBHKD=X" },
    { code: "SGD", label: "新加坡元 (SGD)", symbol: "S$", yahoo: "SGDHKD=X" },
    { code: "AUD", label: "澳元 (AUD)", symbol: "A$", yahoo: "AUDHKD=X" },
    { code: "CAD", label: "加元 (CAD)", symbol: "C$", yahoo: "CADHKD=X" },
    { code: "CHF", label: "瑞士法郎 (CHF)", symbol: "CHF", yahoo: "CHFHKD=X" },
    { code: "MYR", label: "馬幣 (MYR)", symbol: "RM", yahoo: "MYRHKD=X" },
    { code: "NZD", label: "紐西蘭元 (NZD)", symbol: "NZ$", yahoo: "NZDHKD=X" },
    { code: "PHP", label: "菲律賓披索 (PHP)", symbol: "₱", yahoo: "PHPHKD=X" },
    { code: "INR", label: "印度盧比 (INR)", symbol: "₹", yahoo: "INRHKD=X" },
    { code: "DKK", label: "丹麥克朗 (DKK)", symbol: "kr", yahoo: "DKKHKD=X" },
    { code: "NOK", label: "挪威克朗 (NOK)", symbol: "kr", yahoo: "NOKHKD=X" },
    { code: "SEK", label: "瑞典克朗 (SEK)", symbol: "kr", yahoo: "SEKHKD=X" },
    { code: "ZAR", label: "南非蘭特 (ZAR)", symbol: "R", yahoo: "ZARHKD=X" },
    { code: "PKR", label: "巴基斯坦盧比 (PKR)", symbol: "Rs", yahoo: "PKRHKD=X" },
  ];
  let yahooFxCache = null; // { rates, rateDate, updatedAt, fetchedAt, source }


  /** Demo "today" fixed to Day 1 of the trip so the prototype always looks alive */
  const DEMO_TODAY = "2026-12-15";

  function seedData() {
    return {
      trip: {
        title: "東京 · 富士山",
        start: "2026-12-15",
        end: "2026-12-21",
        budget: 0,
        companions: ["Khalil", "旅伴二", "旅伴三", "旅伴四"],
        fxCurrency: "JPY",
        fxRate: 0.0523,
        jpyToHkd: 0.0523,
        travelMode: "driving",
      },
      cities: {
        "2026-12-15": "東京",
        "2026-12-16": "東京",
        "2026-12-17": "東京",
        "2026-12-18": "河口湖",
        "2026-12-19": "河口湖",
        "2026-12-20": "東京",
        "2026-12-21": "東京",
      },
      dayTitles: {
        "2026-12-15": "抵達成田・入住",
        "2026-12-16": "淺草・晴空塔",
        "2026-12-17": "渋谷・原宿",
        "2026-12-18": "前往富士山山腳／河口湖",
        "2026-12-19": "富士山五合目・河口湖",
        "2026-12-20": "返東京・自由日",
        "2026-12-21": "手信・回港",
      },
      itinerary: {
        "2026-12-16": {
          stops: [
            { id: "s16a", time: "10:00", place: "淺草寺", note: "雷門・仲見世通", maps: "淺草寺" },
            { id: "s16b", time: "17:30", place: "晴空塔", note: "傍晚睇夜景", maps: "東京晴空塔" },
          ],
        },
        "2026-12-17": {
          stops: [
            { id: "s17a", time: "11:00", place: "渋谷十字路口", note: "渋谷スクランブル交差点", maps: "渋谷スクランブル交差点" },
            { id: "s17b", time: "13:30", place: "竹下通", note: "原宿逛街", maps: "竹下通り" },
            { id: "s17c", time: "16:00", place: "明治神宮", note: "散步", maps: "明治神宮" },
          ],
        },
        "2026-12-18": {
          stops: [
            { id: "s18a", time: "09:00", place: "河口湖駅", note: "由東京前往富士山山腳", maps: "河口湖駅" },
          ],
        },
      },
      todos: [
        { id: "t1", date: "2026-12-15", text: "換 Suica", done: false },
        { id: "t2", date: "2026-12-15", text: "飯店 check-in", done: false },
        { id: "t3", date: "2026-12-15", text: "附近食晚飯", done: false },
      ],
      pretrip: [
        { id: "p1", text: "護照／旅遊證件", note: "", done: false },
        { id: "p2", text: "機票／boarding pass", note: "", done: false },
        { id: "p3", text: "酒店確認電郵", note: "", done: false },
        { id: "p4", text: "日元現金／信用卡", note: "", done: false },
        { id: "p5", text: "eSIM／漫遊／Wi‑Fi", note: "", done: false },
        { id: "p6", text: "充電器／轉換插", note: "", done: false },
        { id: "p7", text: "藥／保險資料", note: "", done: false },
        { id: "p8", text: "行李額／禁運物品 check", note: "", done: false },
      ],
      showPretrip: true,
      expenses: [],
      selectedDate: DEMO_TODAY,
      calMonth: "2026-12",
      showMaps: true,
      showRouteSketch: true,
    };
  }

  function isMultiTripStore(obj) {
    return !!(obj && Array.isArray(obj.trips) && obj.trips.length);
  }

  function isSingleTripData(obj) {
    return !!(obj && obj.trip && Array.isArray(obj.expenses) && !Array.isArray(obj.trips));
  }

  function normalizeTripRecord(rec) {
    if (!rec || typeof rec !== "object") rec = seedData();
    if (!rec.id) rec.id = uid("t");
    if (!rec.trip) rec.trip = {};
    if (!rec.trip.travelMode) rec.trip.travelMode = "driving";
    if (!Array.isArray(rec.trip.companions)) rec.trip.companions = ["Khalil"];
    if (!rec.cities || typeof rec.cities !== "object") rec.cities = {};
    if (!rec.dayTitles || typeof rec.dayTitles !== "object") rec.dayTitles = {};
    if (!rec.itinerary || typeof rec.itinerary !== "object") rec.itinerary = {};
    if (!Array.isArray(rec.todos)) rec.todos = [];
    if (!Array.isArray(rec.expenses)) rec.expenses = [];
    if (!Array.isArray(rec.pretrip)) rec.pretrip = seedData().pretrip;
    if (typeof rec.showMaps !== "boolean") rec.showMaps = true;
    if (typeof rec.showPretrip !== "boolean") rec.showPretrip = true;
    if (typeof rec.showRouteSketch !== "boolean") {
      const t = (rec.trip && rec.trip.title) || "";
      rec.showRouteSketch = /東京/.test(t) && /富士/.test(t);
    }
    if (!rec.selectedDate) rec.selectedDate = rec.trip.start || DEMO_TODAY;
    if (!rec.calMonth && rec.trip.start) rec.calMonth = String(rec.trip.start).slice(0, 7);
    if (!rec.calMonth) rec.calMonth = "2026-12";
    normalizeTripFx(rec.trip);
    normalizeItinerary(rec);
    return rec;
  }

  function fxOption(code) {
    const c = String(code || "HKD").toUpperCase();
    return FX_OPTIONS.find((o) => o.code === c) || FX_OPTIONS[0];
  }

  function normalizeTripFx(trip) {
    if (!trip || typeof trip !== "object") return;
    let code = trip.fxCurrency;
    let rate =
      trip.fxRate != null && trip.fxRate !== ""
        ? Number(trip.fxRate)
        : Number(trip.jpyToHkd);
    if (code == null || code === "") {
      code = Number(trip.jpyToHkd) > 0 ? "JPY" : "HKD";
    }
    code = String(code).toUpperCase();
    if (code === "NONE" || code === "NULL") code = "HKD";
    if (!FX_OPTIONS.some((o) => o.code === code)) {
      code = Number(trip.jpyToHkd) > 0 ? "JPY" : "HKD";
    }
    if (code === "HKD") {
      rate = 0;
    } else if (!Number.isFinite(rate) || rate < 0) {
      rate = Number(trip.jpyToHkd) || 0;
    }
    trip.fxCurrency = code;
    trip.fxRate = rate;
    trip.jpyToHkd = rate; // backward compatible
  }

  function activeFxRate() {
    normalizeTripFx(state.trip);
    return Number(state.trip.fxRate) || 0;
  }

  function activeFxCode() {
    normalizeTripFx(state.trip);
    return state.trip.fxCurrency || "HKD";
  }

  function fxEnabled() {
    const code = activeFxCode();
    return code !== "HKD" && activeFxRate() > 0;
  }

  function formatLocalMoney(amount) {
    const opt = fxOption(activeFxCode());
    const n = money(amount);
    if (opt.symbol && opt.symbol.length <= 2) return opt.code + " " + opt.symbol + n;
    return opt.code + " " + n;
  }

  function syncExpLocalLabel() {
    const wrap = document.getElementById("expLocalWrap");
    const lab = document.getElementById("expLocalLabel");
    const input = document.getElementById("expJpy");
    if (!wrap || !lab || !input) return;
    if (!fxEnabled()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const opt = fxOption(activeFxCode());
    lab.textContent = opt.label + "金額（可選）";
  }

  function yahooSymbolToCode(symbol) {
    const sym = String(symbol || "");
    const hit = FX_OPTIONS.find((o) => o.yahoo === sym);
    return hit ? hit.code : null;
  }

  function parseYahooSparkJson(data) {
    const results = data && data.spark && Array.isArray(data.spark.result) ? data.spark.result : [];
    if (!results.length) throw new Error("Yahoo spark 冇結果");
    const rates = {};
    let marketTime = null;
    results.forEach((item) => {
      const code = yahooSymbolToCode(item && item.symbol);
      if (!code) return;
      try {
        const meta = item.response[0].meta;
        const price = Number(meta.regularMarketPrice);
        if (!Number.isFinite(price)) return;
        rates[code] = price;
        if (meta.regularMarketTime != null) marketTime = meta.regularMarketTime;
      } catch (_) {}
    });
    if (!Object.keys(rates).length) throw new Error("Yahoo spark 解唔到匯率");
    let updatedAt = "";
    let rateDate = "";
    if (marketTime != null) {
      let t = Number(marketTime);
      if (t > 1e12) t = t / 1000;
      try {
        const d = new Date(t * 1000);
        updatedAt = d.toISOString();
        rateDate = d.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
      } catch (_) {}
    }
    return {
      rates,
      rateDate: rateDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }),
      updatedAt: updatedAt || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      source: "yahoo",
    };
  }

  function parseYahooChartJson(data, code) {
    const meta =
      data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
    if (!meta) throw new Error("Yahoo chart 格式唔啱");
    const price = Number(meta.regularMarketPrice);
    if (!Number.isFinite(price)) throw new Error("Yahoo chart 冇牌價");
    let updatedAt = "";
    let rateDate = "";
    if (meta.regularMarketTime != null) {
      let t = Number(meta.regularMarketTime);
      if (t > 1e12) t = t / 1000;
      try {
        const d = new Date(t * 1000);
        updatedAt = d.toISOString();
        rateDate = d.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
      } catch (_) {}
    }
    const rates = {};
    rates[code] = price;
    return {
      rates,
      rateDate: rateDate || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }),
      updatedAt: updatedAt || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      source: "yahoo",
    };
  }

  function parseYahooRatesFromLocalJson(obj) {
    if (!obj || typeof obj !== "object" || !obj.rates) throw new Error("後備牌價檔格式唔啱");
    const rates = {};
    Object.keys(obj.rates).forEach((code) => {
      const n = Number(obj.rates[code]);
      if (Number.isFinite(n)) rates[code] = n;
    });
    if (!Object.keys(rates).length) throw new Error("後備牌價檔冇匯率");
    return {
      rates,
      rateDate: obj.rateDate || "",
      updatedAt: obj.updatedAt || "",
      fetchedAt: obj.fetchedAt || new Date().toISOString(),
      source: "local",
    };
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      mode: "cors",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async function fetchYahooSparkAll() {
    const symbols = FX_OPTIONS.filter((o) => o.yahoo).map((o) => o.yahoo);
    // Yahoo spark rejects very long symbol lists — batch
    const batches = chunk(symbols, 8);
    const merged = { rates: {}, rateDate: "", updatedAt: "", fetchedAt: new Date().toISOString(), source: "yahoo" };
    for (let i = 0; i < batches.length; i++) {
      const qs =
        "symbols=" +
        encodeURIComponent(batches[i].join(",")) +
        "&range=1d&interval=1d";
      const data = await fetchJson(YAHOO_SPARK_URL + "?" + qs);
      const part = parseYahooSparkJson(data);
      Object.assign(merged.rates, part.rates);
      if (part.rateDate) merged.rateDate = part.rateDate;
      if (part.updatedAt) merged.updatedAt = part.updatedAt;
    }
    if (!Object.keys(merged.rates).length) throw new Error("Yahoo spark 冇匯率");
    if (!merged.rateDate) {
      merged.rateDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
    }
    return merged;
  }

  async function fetchYahooChartOne(code) {
    const opt = fxOption(code);
    if (!opt.yahoo) throw new Error(code + " 冇 Yahoo 代碼");
    const data = await fetchJson(YAHOO_CHART_URL + encodeURIComponent(opt.yahoo) + "?interval=1d&range=1d");
    return parseYahooChartJson(data, code);
  }

  async function fetchYahooRates(preferredCode) {
    const errors = [];

    // 1) Direct Yahoo spark (batched)
    try {
      const parsed = await fetchYahooSparkAll();
      yahooFxCache = parsed;
      return parsed;
    } catch (err) {
      errors.push("spark：" + ((err && err.message) || err));
    }

    // 2) Direct Yahoo chart for selected currency (then merge into cache)
    if (preferredCode && preferredCode !== "HKD") {
      try {
        const one = await fetchYahooChartOne(preferredCode);
        yahooFxCache = Object.assign({}, yahooFxCache || {}, {
          rates: Object.assign({}, (yahooFxCache && yahooFxCache.rates) || {}, one.rates),
          rateDate: one.rateDate,
          updatedAt: one.updatedAt,
          fetchedAt: one.fetchedAt,
          source: "yahoo",
        });
        return yahooFxCache;
      } catch (err) {
        errors.push("chart：" + ((err && err.message) || err));
      }
    }

    // 3) Same-origin fallback
    try {
      const raw = await fetchJson("fx-rates.json?v=39");
      const parsed = parseYahooRatesFromLocalJson(raw);
      yahooFxCache = parsed;
      return parsed;
    } catch (err) {
      errors.push("後備：" + ((err && err.message) || err));
    }

    throw new Error("更新失敗（" + errors.join("；") + "）");
  }

  function applyFxRateToForm(code, rate, meta) {
    const rateEl = document.getElementById("setRate");
    const curEl = document.getElementById("setFxCurrency");
    if (curEl && code) curEl.value = code;
    if (rateEl && rate != null && Number.isFinite(Number(rate))) {
      const n = Number(rate);
      rateEl.value = n === 0 ? "0" : String(Math.round(n * 1e8) / 1e8);
    }
    updateFxMeta(meta);
  }

  function updateFxMeta(meta) {
    const el = document.getElementById("fxMeta");
    if (!el) return;
    const m = meta || {
      rateDate: state.trip.fxSourceDate,
      updatedAt: state.trip.fxSourceUpdatedAt,
      fetchedAt: state.trip.fxFetchedAt,
      source: state.trip.fxSource,
    };
    const parts = [];
    if (m && m.rateDate) parts.push("牌價日 " + m.rateDate);
    if (m && m.updatedAt) {
      try {
        const d = new Date(m.updatedAt);
        parts.push(
          Number.isNaN(d.getTime())
            ? "更新 " + m.updatedAt
            : "更新 " + d.toLocaleString("zh-HK", { hour12: false })
        );
      } catch (_) {
        parts.push("更新 " + m.updatedAt);
      }
    } else if (m && m.fetchedAt) {
      try {
        parts.push("抓取 " + new Date(m.fetchedAt).toLocaleString("zh-HK", { hour12: false }));
      } catch (_) {}
    }
    const prefix = m && m.source === "local" ? "本機後備：" : "Yahoo：";
    el.textContent = parts.length ? prefix + parts.join(" · ") : "";
  }

  function fillFxCurrencySelect() {
    const sel = document.getElementById("setFxCurrency");
    if (!sel) return;
    const cur = activeFxCode();
    sel.innerHTML = FX_OPTIONS.map(
      (o) =>
        `<option value="${o.code}" ${o.code === cur ? "selected" : ""}>${escapeHtml(o.label)}</option>`
    ).join("");
  }


  function wrapSingleAsStore(data) {
    const rec = normalizeTripRecord(Object.assign({}, data || seedData()));
    return { version: 3, activeTripId: rec.id, trips: [rec] };
  }

  function normalizeStore(raw) {
    const storeObj = {
      version: 3,
      activeTripId: raw && raw.activeTripId,
      trips: (raw && raw.trips ? raw.trips : []).map((t) => normalizeTripRecord(Object.assign({}, t))),
    };
    if (!storeObj.trips.length) {
      return wrapSingleAsStore(seedData());
    }
    if (!storeObj.trips.some((t) => t.id === storeObj.activeTripId)) {
      storeObj.activeTripId = storeObj.trips[0].id;
    }
    return storeObj;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isMultiTripStore(parsed)) return normalizeStore(parsed);
        if (isSingleTripData(parsed)) return wrapSingleAsStore(parsed);
        // sync payload saved by mistake?
        if (parsed && parsed.data) {
          if (isMultiTripStore(parsed.data)) return normalizeStore(parsed.data);
          if (isSingleTripData(parsed.data)) return wrapSingleAsStore(parsed.data);
        }
      }
    } catch (_) {}
    return wrapSingleAsStore(seedData());
  }

  function flushActiveToStore() {
    if (!state || !store) return;
    if (!state.id) state.id = store.activeTripId || uid("t");
    const id = state.id;
    const i = store.trips.findIndex((t) => t.id === id);
    if (i >= 0) store.trips[i] = state;
    else store.trips.push(state);
    store.activeTripId = id;
    store.version = 3;
  }

  function save() {
    flushActiveToStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    const meta = loadSyncMeta();
    meta.localUpdatedAt = new Date().toISOString();
    saveSyncMeta(meta);
    scheduleAutoSync();
  }

  function updateDocTitle() {
    const title = (state && state.trip && state.trip.title) || "旅行手帳";
    document.title = "旅行手帳 · " + title;
  }

  function activateTrip(tripId, opts) {
    opts = opts || {};
    if (opts.flush !== false) flushActiveToStore();
    let trip = store.trips.find((t) => t.id === tripId);
    if (!trip) trip = store.trips[0];
    trip = normalizeTripRecord(trip);
    store.activeTripId = trip.id;
    state = trip;
    // keep array reference in sync
    const i = store.trips.findIndex((t) => t.id === trip.id);
    if (i >= 0) store.trips[i] = state;
    updateDocTitle();
    if (opts.persist) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      const meta = loadSyncMeta();
      meta.localUpdatedAt = new Date().toISOString();
      saveSyncMeta(meta);
      scheduleAutoSync();
    }
  }

  function datesBetween(start, end) {
    const out = [];
    if (!start || !end) return out;
    const a = parseDate(start);
    const b = parseDate(end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return out;
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      out.push(y + "-" + m + "-" + day);
    }
    return out;
  }

  function defaultPretripCopy() {
    // Destination-neutral checklist for new trips (seed Tokyo trip keeps its own)
    const items = [
      "護照／旅遊證件",
      "機票／boarding pass",
      "酒店確認電郵",
      "當地現金／信用卡",
      "eSIM／漫遊／Wi‑Fi",
      "充電器／轉換插",
      "藥／保險資料",
      "行李額／禁運物品 check",
    ];
    return items.map((text) => ({ id: uid("p"), text, note: "", done: false }));
  }

  function createEmptyTrip(opts) {
    opts = opts || {};
    const start = opts.start;
    const end = opts.end;
    const title = (opts.title || "新旅程").trim() || "新旅程";
    let companions = Array.isArray(opts.companions) ? opts.companions.slice() : [];
    companions = companions.map((s) => String(s).trim()).filter(Boolean);
    if (!companions.length) companions = ["Khalil"];
    companions = companions.filter((v, i, a) => a.indexOf(v) === i);
    const budget = Number(opts.budget) || 0;
    const cities = {};
    const dayTitles = {};
    datesBetween(start, end).forEach((d) => {
      cities[d] = "";
      dayTitles[d] = "";
    });
    return normalizeTripRecord({
      id: uid("t"),
      trip: {
        title,
        start,
        end,
        budget,
        companions,
        fxCurrency: "HKD",
        fxRate: 0,
        jpyToHkd: 0,
        travelMode: "transit",
      },
      cities,
      dayTitles,
      itinerary: {},
      todos: [],
      pretrip: defaultPretripCopy(),
      showPretrip: true,
      expenses: [],
      selectedDate: start,
      calMonth: String(start).slice(0, 7),
      showMaps: true,
      showRouteSketch: false,
    });
  }

  function tripExpenseTotal(tripRec) {
    return (tripRec.expenses || []).reduce((s, e) => s + (Number(e.hkd) || 0), 0);
  }

  function tripDayCount(tripRec) {
    if (!tripRec || !tripRec.trip) return 0;
    return datesBetween(tripRec.trip.start, tripRec.trip.end).length;
  }

  let store = loadStore();
  let state = null;
  activateTrip(store.activeTripId, { flush: false, persist: false });

  // ---------- Cloud sync (GitHub Gist) + local backup ----------
  let autoSyncTimer = null;
  let syncBusy = false;

  function defaultSyncMeta() {
    return {
      token: "",
      gistId: DEFAULT_PUBLIC_GIST_ID,
      publicGist: true,
      autoSync: false,
      autoPullOnOpen: true,
      localUpdatedAt: null,
      lastPushAt: null,
      lastPullAt: null,
    };
  }

  function loadSyncMeta() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const gistId =
          (typeof p.gistId === "string" && p.gistId.trim()) ||
          DEFAULT_PUBLIC_GIST_ID;
        const autoPullOnOpen =
          typeof p.autoPullOnOpen === "boolean" ? p.autoPullOnOpen : true;
        const publicGist =
          typeof p.publicGist === "boolean" ? p.publicGist : true;
        return {
          token: typeof p.token === "string" ? p.token : "",
          gistId: gistId,
          autoSync: !!p.autoSync,
          autoPullOnOpen: autoPullOnOpen,
          publicGist: publicGist,
          localUpdatedAt: p.localUpdatedAt || null,
          lastPushAt: p.lastPushAt || null,
          lastPullAt: p.lastPullAt || null,
        };
      }
    } catch (_) {}
    return defaultSyncMeta();
  }

  function saveSyncMeta(meta) {
    localStorage.setItem(SYNC_KEY, JSON.stringify(meta));
  }

  function syncAuthHeaders(token) {
    return Object.assign(
      {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      GITHUB_API_HEADERS_BASE
    );
  }

  function buildSyncPayload() {
    flushActiveToStore();
    return {
      version: 3,
      updatedAt: new Date().toISOString(),
      data: store,
    };
  }

  function fmtSyncTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString("zh-HK", { hour12: false });
    } catch (_) {
      return iso;
    }
  }

  function updateSyncStatus() {
    const el = document.getElementById("syncStatus");
    if (!el) return;
    const meta = loadSyncMeta();
    const parts = [];
    if (meta.gistId) {
      parts.push(
        'Gist：<a href="https://gist.github.com/' +
          encodeURIComponent(meta.gistId) +
          '" target="_blank" rel="noopener">' +
          escapeHtml(meta.gistId) +
          "</a>"
      );
      parts.push(meta.publicGist ? "公開（第二部機唔使 Token）" : "私人（拉都要 Token）");
    } else {
      parts.push("尚未建立 Gist");
    }
    if (meta.lastPushAt) parts.push("上次上傳：" + fmtSyncTime(meta.lastPushAt));
    if (meta.lastPullAt) parts.push("上次下載：" + fmtSyncTime(meta.lastPullAt));
    if (!meta.token) parts.push("未儲存 Token");
    el.innerHTML = parts.join(" · ");
    const hint = document.getElementById("syncPublicLinkHint");
    if (hint) {
      if (meta.gistId) {
        hint.innerHTML =
          "公開同步 ID：<code>" +
          escapeHtml(meta.gistId) +
          "</code> · 頁面：<a href=\"https://gist.github.com/" +
          encodeURIComponent(meta.gistId) +
          '" target="_blank" rel="noopener">gist.github.com/…/' +
          escapeHtml(meta.gistId) +
          "</a> · raw 可用 <code>…/raw/" +
          escapeHtml(GIST_FILENAME) +
          "</code>（公開 Gist 唔使 Token）";
      } else {
        hint.textContent =
          "已有 Gist 可填 ID。公開 Gist 可用 API 或 raw 連結拉資料，唔使 Token。";
      }
    }
  }

  function fillSyncForm() {
    const meta = loadSyncMeta();
    const tokenEl = document.getElementById("syncToken");
    const gistEl = document.getElementById("syncGistId");
    const autoEl = document.getElementById("syncAuto");
    if (tokenEl) tokenEl.value = meta.token || "";
    if (gistEl) gistEl.value = meta.gistId || "";
    if (autoEl) autoEl.checked = !!meta.autoSync;
    const autoPullEl = document.getElementById("syncAutoPull");
    if (autoPullEl) autoPullEl.checked = !!meta.autoPullOnOpen;
    const publicEl = document.getElementById("syncPublicGist");
    if (publicEl) publicEl.checked = !!meta.publicGist;
    updateSyncStatus();
  }

  function readSyncForm() {
    return {
      token: (document.getElementById("syncToken").value || "").trim(),
      gistId: (document.getElementById("syncGistId").value || "").trim(),
      autoSync: !!document.getElementById("syncAuto").checked,
      autoPullOnOpen: !!document.getElementById("syncAutoPull").checked,
      publicGist: !!document.getElementById("syncPublicGist").checked,
    };
  }

  function mergeSyncForm(prev, form) {
    return {
      token: form.token,
      gistId: form.gistId,
      autoSync: form.autoSync,
      autoPullOnOpen: form.autoPullOnOpen,
      publicGist: !!form.publicGist,
      localUpdatedAt: prev.localUpdatedAt || null,
      lastPushAt: prev.lastPushAt || null,
      lastPullAt: prev.lastPullAt || null,
    };
  }

  function applyJournalData(data) {
    if (isMultiTripStore(data)) {
      store = normalizeStore(data);
    } else if (isSingleTripData(data)) {
      store = wrapSingleAsStore(data);
    } else {
      throw new Error("JSON 格式唔啱（需要 trips，或舊版 trip + expenses）");
    }
    activateTrip(store.activeTripId, { flush: false, persist: false });
    // write without re-triggering auto-sync loop mid-import
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  async function gistCreate(token, payload, isPublic) {
    const body = {
      description: "旅行手帳 · Travel Journal sync",
      public: !!isPublic,
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
      },
    };
    const res = await fetch(GITHUB_API + "/gists", {
      method: "POST",
      headers: syncAuthHeaders(token),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((json && json.message) || ("建立 Gist 失敗（" + res.status + "）"));
    }
    return json;
  }

  async function gistUpdate(token, gistId, payload, opts) {
    opts = opts || {};
    const body = {
      files: {
        [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) },
      },
    };
    // GitHub may ignore public on PATCH for existing private gists; caller handles recreate.
    if (opts.makePublic) body.public = true;
    const res = await fetch(GITHUB_API + "/gists/" + encodeURIComponent(gistId), {
      method: "PATCH",
      headers: syncAuthHeaders(token),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((json && json.message) || ("更新 Gist 失敗（" + res.status + "）"));
    }
    return json;
  }

  async function gistFetch(token, gistId) {
    const headers = Object.assign({}, GITHUB_API_HEADERS_BASE);
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(GITHUB_API + "/gists/" + encodeURIComponent(gistId), {
      method: "GET",
      headers: headers,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if ((res.status === 404 || res.status === 403) && !token) {
        throw new Error("讀取失敗：Gist 可能係私人，請用公開 Gist，或者喺呢部機填 Token");
      }
      throw new Error((json && json.message) || ("讀取 Gist 失敗（" + res.status + "）"));
    }
    return json;
  }

  async function pushToCloud(opts) {
    opts = opts || {};
    const silent = !!opts.silent;
    if (syncBusy) {
      if (!silent) toast("同步進行中…");
      return false;
    }
    const meta = loadSyncMeta();
    if (!meta.token) {
      if (!silent) toast("請先填 Token 並儲存同步設定");
      return false;
    }
    syncBusy = true;
    try {
      const payload = buildSyncPayload();
      let gist;
      const wantPublic = !!meta.publicGist;
      if (meta.gistId) {
        gist = await gistUpdate(meta.token, meta.gistId, payload, {
          makePublic: wantPublic,
        });
        // private→public via PATCH often ignored; recreate as public when needed
        if (wantPublic && gist && gist.public === false) {
          gist = await gistCreate(meta.token, payload, true);
          meta.gistId = gist.id;
          const gistEl = document.getElementById("syncGistId");
          if (gistEl) gistEl.value = meta.gistId;
          if (!silent) {
            toast("已新建公開 Gist（舊私人 Gist 無法直接改公開）");
          }
        }
      } else {
        gist = await gistCreate(meta.token, payload, wantPublic);
        meta.gistId = gist.id;
        const gistEl = document.getElementById("syncGistId");
        if (gistEl) gistEl.value = meta.gistId;
      }
      if (gist && typeof gist.public === "boolean") {
        meta.publicGist = !!gist.public;
        const publicEl = document.getElementById("syncPublicGist");
        if (publicEl) publicEl.checked = meta.publicGist;
      }
      meta.lastPushAt = new Date().toISOString();
      saveSyncMeta(meta);
      updateSyncStatus();
      if (!silent) {
        toast(
          wantPublic || (gist && gist.public)
            ? "已上傳到公開雲 ✓（第二部機只填 Gist ID）"
            : "已上傳到雲 ✓"
        );
      } else {
        toast("已同步 ✓");
      }
      return true;
    } catch (err) {
      console.error(err);
      toast((err && err.message) || "上傳失敗");
      return false;
    } finally {
      syncBusy = false;
    }
  }

  async function resolveGistFileContent(file) {
    if (file && typeof file.content === "string" && file.content && !file.truncated) {
      return file.content;
    }
    const rawUrl = file && file.raw_url;
    if (!rawUrl) return null;
    const res = await fetch(rawUrl, { method: "GET" });
    if (!res.ok) {
      throw new Error("讀取 Gist raw 失敗（" + res.status + "）");
    }
    return await res.text();
  }

  async function pullFromCloud(opts) {
    opts = opts || {};
    const silent = !!opts.silent;
    const onlyIfNewer = !!opts.onlyIfNewer;
    if (syncBusy) {
      if (!silent) toast("同步進行中…");
      return false;
    }
    const meta = loadSyncMeta();
    if (!meta.gistId) {
      if (!silent) toast("未有 Gist ID，請先上傳一次或手動填 ID");
      return false;
    }
    if (!meta.token && !silent) {
      // token-less pull is OK for public gists
    }
    if (!silent && !confirm("從雲下載會覆蓋呢部機嘅行程資料，確定？")) return false;
    syncBusy = true;
    try {
      const gist = await gistFetch(meta.token || "", meta.gistId);
      if (gist && typeof gist.public === "boolean") {
        meta.publicGist = !!gist.public;
        const publicEl = document.getElementById("syncPublicGist");
        if (publicEl) publicEl.checked = meta.publicGist;
      }
      const files = gist.files || {};
      const file =
        files[GIST_FILENAME] ||
        files[Object.keys(files).find((k) => /\.json$/i.test(k))] ||
        null;
      if (!file) {
        throw new Error("Gist 入面搵唔到 " + GIST_FILENAME);
      }
      const content = await resolveGistFileContent(file);
      if (!content) {
        throw new Error("Gist 入面搵唔到 " + GIST_FILENAME);
      }
      let parsed = JSON.parse(content);
      let data = parsed;
      if (parsed && parsed.data) data = parsed.data;
      const cloudUpdated = (parsed && parsed.updatedAt) || null;
      if (onlyIfNewer) {
        const localTs = meta.localUpdatedAt ? Date.parse(meta.localUpdatedAt) : 0;
        const cloudTs = cloudUpdated ? Date.parse(cloudUpdated) : 0;
        if (!cloudTs || cloudTs <= localTs + 500) {
          return false;
        }
      }
      applyJournalData(data);
      meta.lastPullAt = new Date().toISOString();
      if (cloudUpdated) meta.localUpdatedAt = cloudUpdated;
      saveSyncMeta(meta);
      updateSyncStatus();
      renderAll();
      fillSettings();
      toast(silent ? "已從雲更新 ✓" : "已從雲下載 ✓");
      return true;
    } catch (err) {
      console.error(err);
      if (!silent) toast((err && err.message) || "下載失敗");
      else toast((err && err.message) || "自動下載失敗");
      return false;
    } finally {
      syncBusy = false;
    }
  }

  function autoPullOnOpen() {
    const meta = loadSyncMeta();
    // Default public gist: open app pulls with zero setup (no token / no form fill).
    if (!meta.autoPullOnOpen) return;
    if (!meta.gistId) {
      meta.gistId = DEFAULT_PUBLIC_GIST_ID;
      saveSyncMeta(meta);
    }
    // First pull always applies; later opens only if cloud is newer (boot save() would otherwise block).
    pullFromCloud({ silent: true, onlyIfNewer: !!meta.lastPullAt });
  }

  function scheduleAutoSync() {
    const meta = loadSyncMeta();
    if (!meta.autoSync || !meta.token) return;
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
      pushToCloud({ silent: true });
    }, 1500);
  }

  function exportJournalJson() {
    const payload = buildSyncPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = "travel-journal-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    toast("已匯出 JSON ✓");
  }

  function importJournalJsonFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        let data = parsed;
        if (parsed && parsed.data) data = parsed.data;
        if (!(isMultiTripStore(data) || isSingleTripData(data))) {
          toast("JSON 格式唔啱（需要 trips，或舊版 trip + expenses）");
          return;
        }
        if (!confirm("匯入會覆蓋呢部機嘅行程資料，確定？")) return;
        applyJournalData(data);
        renderAll();
        fillSettings();
        toast("已匯入 JSON ✓");
      } catch (err) {
        console.error(err);
        toast((err && err.message) || "匯入失敗");
      }
    };
    reader.onerror = () => toast("讀檔失敗");
    reader.readAsText(file);
  }

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function parseDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtDate(s) {
    const dt = parseDate(s);
    return `${dt.getMonth() + 1}月${dt.getDate()}日`;
  }

  function fmtDateLong(s) {
    const dt = parseDate(s);
    return `${dt.getMonth() + 1}月${dt.getDate()}日 星期${WEEKDAYS[dt.getDay()]}`;
  }

  function money(n) {
    return Math.round(n).toLocaleString("en-HK");
  }

  function hkdToJpy(hkd) {
    const rate = activeFxRate();
    if (!rate) return 0;
    return Math.round(Number(hkd) / rate);
  }

  function totalSpent(expenses) {
    return (expenses || state.expenses).reduce((s, e) => s + (Number(e.hkd) || 0), 0);
  }

  function spentOn(date) {
    return state.expenses
      .filter((e) => e.date === date)
      .reduce((s, e) => s + (Number(e.hkd) || 0), 0);
  }

  /** Who shares this expense; empty/missing → all companions */
  function isPersonalExpense(e) {
    if (!e) return false;
    if (e.split === false) return true;
    if (e.split === true) return false;
    // Legacy: only payer in splitWith → treat as personal
    if (
      Array.isArray(e.splitWith) &&
      e.splitWith.length === 1 &&
      e.payer &&
      e.splitWith[0] === e.payer
    ) {
      return true;
    }
    return false;
  }

  function expenseSplitWith(e) {
    const all = (state.trip.companions || []).slice();
    if (isPersonalExpense(e)) {
      return e.payer ? [e.payer] : [];
    }
    if (Array.isArray(e.splitWith) && e.splitWith.length) return e.splitWith.slice();
    return all;
  }

  /** Per-person paid / fair share / net across ALL trip expenses */
  function computePersonBalances() {
    const companions = (state.trip.companions || []).slice();
    const nameSet = new Set(companions);
    state.expenses.forEach((e) => {
      if (e.payer) nameSet.add(e.payer);
      expenseSplitWith(e).forEach((n) => nameSet.add(n));
    });
    const people = companions.length ? companions.slice() : [];
    nameSet.forEach((n) => {
      if (!people.includes(n)) people.push(n);
    });

    const paid = {};
    const share = {};
    people.forEach((n) => {
      paid[n] = 0;
      share[n] = 0;
    });

    state.expenses.forEach((e) => {
      const hkd = Number(e.hkd) || 0;
      if (e.payer) {
        if (paid[e.payer] === undefined) paid[e.payer] = 0;
        paid[e.payer] += hkd;
      }
      const split = expenseSplitWith(e);
      if (!split.length) return;
      const each = hkd / split.length;
      split.forEach((n) => {
        if (share[n] === undefined) share[n] = 0;
        share[n] += each;
      });
    });

    return people.map((name) => {
      const p = paid[name] || 0;
      const s = share[name] || 0;
      return { name, paid: p, share: s, net: p - s };
    });
  }

  /** Greedy settle: largest debtor → largest creditor */
  function settleTransfers(balances) {
    const creditors = balances
      .filter((b) => b.net > 0.5)
      .map((b) => ({ name: b.name, amt: b.net }))
      .sort((a, b) => b.amt - a.amt);
    const debtors = balances
      .filter((b) => b.net < -0.5)
      .map((b) => ({ name: b.name, amt: -b.net }))
      .sort((a, b) => b.amt - a.amt);
    const transfers = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].amt, creditors[j].amt);
      if (pay >= 0.5) {
        transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: pay });
      }
      debtors[i].amt -= pay;
      creditors[j].amt -= pay;
      if (debtors[i].amt < 0.5) i++;
      if (creditors[j].amt < 0.5) j++;
    }
    return transfers;
  }

  function renderSettleHtml(balances, transfers, emptyHint) {
    if (!balances.length) {
      return `<p class="hint settle-empty">${emptyHint || "未設定旅伴 — 去設定加埋先"}</p>`;
    }
    if (!state.expenses.length) {
      return `<p class="hint settle-empty">暫未有開支記錄</p>`;
    }
    const rows = balances
      .map((b) => {
        let balLabel;
        let balClass;
        if (b.net > 0.5) {
          balLabel = `應收回 $${money(b.net)}`;
          balClass = "net-pos";
        } else if (b.net < -0.5) {
          balLabel = `應夾返 $${money(-b.net)}`;
          balClass = "net-neg";
        } else {
          balLabel = "已平帳";
          balClass = "net-zero";
        }
        return `<div class="settle-row">
          <div class="settle-name">${escapeHtml(b.name)}</div>
          <div class="settle-nums">
            <span><em>墊付</em> $${money(b.paid)}</span>
            <span><em>應分攤</em> $${money(b.share)}</span>
            <span class="settle-net ${balClass}"><em>結餘</em> ${balLabel}</span>
          </div>
        </div>`;
      })
      .join("");
    let how = "";
    if (transfers.length) {
      how =
        `<div class="settle-how"><div class="settle-how-title">要點樣夾</div><ul class="settle-transfers">` +
        transfers
          .map(
            (t) =>
              `<li><strong>${escapeHtml(t.from)}</strong> → <strong>${escapeHtml(t.to)}</strong>　HKD $${money(
                t.amount
              )}</li>`
          )
          .join("") +
        `</ul></div>`;
    } else {
      how = `<div class="settle-how"><p class="hint">大家已經平帳 ✓</p></div>`;
    }
    return rows + how;
  }

  function dayIndex(date) {
    const start = parseDate(state.trip.start);
    const d = parseDate(date);
    return Math.floor((d - start) / 86400000) + 1;
  }

  function tripDates() {
    const out = [];
    const a = parseDate(state.trip.start);
    const b = parseDate(state.trip.end);
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${day}`);
    }
    return out;
  }

  function isInTrip(dateStr) {
    return dateStr >= state.trip.start && dateStr <= state.trip.end;
  }

  function focusDate() {
    return state.selectedDate || DEMO_TODAY;
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => { el.hidden = true; }, 250);
    }, 2600);
  }

  // ---------- Tabs ----------
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".view").forEach((v) => {
      v.classList.toggle("active", v.id === "view-" + name);
    });
    if (name === "trips") renderTrips();
    if (name === "ledger") renderLedger();
    if (name === "charts") renderCharts();
    if (name === "settings") fillSettings();
    if (name === "calendar") renderCalendar();
  }

  // ---------- Header ----------
  function renderHeader() {
    const comps = state.trip.companions || [];
    document.getElementById("topCompanions").textContent = comps.join("、") || "—";
    document.getElementById("topTripChip").textContent = state.trip.title;
    updateDocTitle();
  }

  // ---------- Trips (multi-trip) ----------
  function fmtTripRange(tripRec) {
    const t = tripRec.trip || {};
    if (!t.start || !t.end) return "—";
    try {
      const a = parseDate(t.start);
      const b = parseDate(t.end);
      return a.getMonth() + 1 + "月" + a.getDate() + "日 – " + (b.getMonth() + 1) + "月" + b.getDate() + "日";
    } catch (_) {
      return t.start + " – " + t.end;
    }
  }

  function renderTrips() {
    const el = document.getElementById("tripsList");
    if (!el) return;
    flushActiveToStore();
    const trips = store.trips || [];
    if (!trips.length) {
      el.innerHTML = `<div class="empty-state">未有旅程 — 撳「＋ 新旅程」</div>`;
      return;
    }
    el.innerHTML = trips
      .map((tr) => {
        const active = tr.id === store.activeTripId;
        const comps = (tr.trip && tr.trip.companions) || [];
        const days = tripDayCount(tr);
        const spent = tripExpenseTotal(tr);
        const compText = comps.length ? escapeHtml(comps.join("、")) : "—";
        return `<article class="trip-card rough-card ${active ? "is-active" : ""}" data-trip-id="${escapeHtml(tr.id)}">
          <div class="trip-card-main">
            <div class="trip-card-title">
              ${escapeHtml((tr.trip && tr.trip.title) || "未命名旅程")}
              ${active ? '<span class="trip-active-badge">而家打開</span>' : ""}
            </div>
            <div class="trip-card-meta">${fmtTripRange(tr)} · 共 ${days} 天</div>
            <div class="trip-card-meta">開支 HKD $${money(spent)} · 旅伴 ${compText}</div>
          </div>
          <div class="trip-card-actions">
            <button type="button" class="btn btn-scan sm" data-open-trip="${escapeHtml(tr.id)}" ${
              active ? "disabled" : ""
            }>${active ? "使用中" : "打開"}</button>
            <button type="button" class="btn btn-danger sm" data-del-trip="${escapeHtml(tr.id)}">刪除</button>
          </div>
        </article>`;
      })
      .join("");
  }

  function openTripModal() {
    const modal = document.getElementById("tripModal");
    if (!modal) return;
    const today = focusDate();
    document.getElementById("newTripTitle").value = "";
    document.getElementById("newTripStart").value = today;
    // default end = start + 6 days
    try {
      const d = parseDate(today);
      d.setDate(d.getDate() + 6);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      document.getElementById("newTripEnd").value = y + "-" + m + "-" + day;
    } catch (_) {
      document.getElementById("newTripEnd").value = today;
    }
    document.getElementById("newTripCompanions").value = "Khalil";
    document.getElementById("newTripBudget").value = "";
    modal.hidden = false;
    document.getElementById("newTripTitle").focus();
  }

  function closeTripModal() {
    const modal = document.getElementById("tripModal");
    if (modal) modal.hidden = true;
  }

  function switchToTrip(tripId) {
    if (!tripId || tripId === store.activeTripId) {
      toast("已經係呢個旅程");
      return;
    }
    activateTrip(tripId, { flush: true, persist: true });
    toast("已切換： " + ((state.trip && state.trip.title) || ""));
    renderAll();
    fillSettings();
    switchTab("calendar");
  }

  function deleteTrip(tripId) {
    flushActiveToStore();
    if ((store.trips || []).length <= 1) {
      toast("至少要留一個旅程");
      return;
    }
    const tr = store.trips.find((t) => t.id === tripId);
    const name = (tr && tr.trip && tr.trip.title) || "呢個旅程";
    if (!confirm("確定刪除「" + name + "」？入面開支／行程都會冇晒。")) return;
    store.trips = store.trips.filter((t) => t.id !== tripId);
    if (store.activeTripId === tripId) {
      activateTrip(store.trips[0].id, { flush: false, persist: false });
    }
    save();
    toast("已刪除旅程");
    renderAll();
    fillSettings();
    renderTrips();
  }


  // ---------- Calendar view ----------
  function renderCalendar() {
    const today = focusDate();
    const dayN = dayIndex(today);
    const start = parseDate(state.trip.start);
    const end = parseDate(state.trip.end);

    document.getElementById("calTripTitle").textContent = state.trip.title;
    const sketch = document.getElementById("routeSketchCard");
    if (sketch) sketch.hidden = !state.showRouteSketch;
    document.getElementById("calTripSub").textContent =
      `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日 · 共${tripDates().length}天 · 第${dayN}天（${fmtDateLong(today)}）`;

    const spent = totalSpent();
    const budget = Number(state.trip.budget) || 0;
    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    document.getElementById("calSpentHkd").textContent = `HKD $${money(spent)}`;
    document.getElementById("calSpentJpy").textContent = fxEnabled()
      ? `約 ${formatLocalMoney(hkdToJpy(spent))}`
      : "未設外幣匯率";
    document.getElementById("calProgressBar").style.width = pct + "%";
    document.getElementById("calBudgetPct").textContent = budget > 0 ? pct + "%" : "未設定";
    document.getElementById("calBudget").textContent = budget > 0 ? `HKD $${money(budget)}` : "未設定";
    document.getElementById("calTodaySpend").textContent = `HKD $${money(spentOn(today))}`;

    const city = state.cities[today] || "";
    document.getElementById("calTodoSub").textContent = `Day ${dayN} · ${city}`;
    const pageNumEl = document.getElementById("pageNum");
    if (pageNumEl) pageNumEl.textContent = String(dayN);

    // Todos
    const todos = state.todos.filter((t) => t.date === today);
    const list = document.getElementById("calTodoList");
    if (!todos.length) {
      list.innerHTML = `<li class="todo-empty"><span class="todo-text">今日暫無待辦 — 撳「加待辦」寫低計劃啦</span></li>`;
    } else {
      list.innerHTML = todos
        .map(
          (t) => `
        <li class="todo-item ${t.done ? "done" : ""}" data-todo="${t.id}">
          <input type="checkbox" ${t.done ? "checked" : ""} />
          <span class="check" aria-hidden="true"></span>
          <div class="todo-body">
            <span class="todo-text">${escapeHtml(t.text)}</span>
            ${
              t.linkedSpend
                ? `<span class="todo-meta recorded">已記帳 HKD $${money(t.linkedSpend)}</span>`
                : t.note
                ? `<span class="todo-meta">${escapeHtml(t.note)}</span>`
                : ""
            }
          </div>
          <div class="todo-actions">
            <button type="button" class="todo-icon-btn" data-todo-edit="${t.id}" aria-label="編輯待辦" title="編輯">✎</button>
            <button type="button" class="todo-icon-btn danger" data-todo-del="${t.id}" aria-label="刪除待辦" title="刪除">✕</button>
          </div>
        </li>`
        )
        .join("");
    }

    renderPretrip();

    // Month grid
    renderMonthGrid();

    // Journal
    const dayExps = state.expenses.filter((e) => e.date === today);
    const dayTitle = state.dayTitles[today] || city || "今日";
    document.getElementById("calJournalSummary").innerHTML = `
      <span class="j-title">Day ${dayN} · ${escapeHtml(dayTitle)}</span>
      <span class="j-meta">${dayExps.length} 筆記錄 · HKD $${money(spentOn(today))}</span>`;
    // Overview map button (first stop); detailed embeds live under 當日行程
    const mqToday = dayMapsQuery(today);
    const hrefToday = mapsUrl(mqToday);
    const dayMapBtn = document.getElementById("btnDayMap");
    if (dayMapBtn) {
      if (hrefToday) {
        dayMapBtn.href = hrefToday;
        dayMapBtn.hidden = false;
      } else {
        dayMapBtn.removeAttribute("href");
        dayMapBtn.hidden = true;
      }
    }
    const mapWrap = document.getElementById("dayMapWrap");
    const mapFrame = document.getElementById("dayMapFrame");
    if (mapWrap && mapFrame) {
      mapFrame.removeAttribute("src");
      mapWrap.hidden = true; // per-stop maps shown in 當日行程
    }
    renderDayStops(today);
    const jl = document.getElementById("calJournalList");
    if (!dayExps.length) {
      jl.innerHTML = "";
    } else {
      jl.innerHTML = dayExps
        .map(
          (e) => `
        <li>
          <span><span class="j-cat cat-${e.cat}">${e.cat}</span>${escapeHtml(e.title)}</span>
          <span class="j-amt">$${money(e.hkd)}</span>
        </li>`
        )
        .join("");
    }

    // Next 3 days
    const dates = tripDates();
    const idx = dates.indexOf(today);
    const next = dates.slice(idx + 1, idx + 4);
    const nextEl = document.getElementById("calNextDays");
    if (!next.length) {
      nextEl.innerHTML = `<div class="muted">行程尾聲啦 🍂</div>`;
    } else {
      nextEl.innerHTML = next
        .map((d) => {
          const dt = parseDate(d);
          const stops = sortStopsByTime(dayStops(d));
          const title = state.dayTitles[d] || state.cities[d] || "未設定行程";
          const route =
            stops.length > 0
              ? stops.map((s) => s.place).filter(Boolean).join(" → ")
              : title;
          const stopLines = stops.length
            ? `<div class="next-stops">${stops
                .map(
                  (s, i) =>
                    `<div class="next-stop-line"><strong>${
                      s.time ? escapeHtml(s.time) + " " : i + 1 + ". "
                    }${escapeHtml(
                      s.place || "地點"
                    )}</strong>${s.note ? " · " + escapeHtml(s.note) : ""}</div>`
                )
                .join("")}</div>`
            : `<div class="hint-line">${escapeHtml(title)}</div>`;
          const routePts = stops.map(stopRouteQuery).filter(Boolean);
          const mq = dayMapsQuery(d);
          const overviewMode = resolveTravelMode(stops[0] && stops[0].toNextMode);
          const mapHref =
            routePts.length >= 2
              ? mapsMultiDirectionsUrl(routePts, overviewMode)
              : mapsUrl(mq);
          const anyOn = stops.some((s) => stopShowsMap(s));
          const embed = !anyOn
            ? ""
            : routePts.length >= 2
            ? mapsMultiDirectionsEmbedUrl(routePts, overviewMode)
            : mapsEmbedUrl(mq);
          const mapBtn = mapHref
            ? `<a class="todo-icon-btn next-map" href="${escapeHtml(mapHref)}" target="_blank" rel="noopener" data-itin-map aria-label="開 Google 地圖" title="地圖">🗺</a>`
            : "";
          const mapBlock = embed
            ? `<div class="next-day-map"><iframe title="${escapeHtml(route)} 路線" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${escapeHtml(embed)}"></iframe></div>`
            : "";
          return `
          <div class="next-day" data-itin-date="${d}">
            <div class="next-date">${dt.getMonth() + 1}/${dt.getDate()}<small>星期${WEEKDAYS[dt.getDay()]}</small></div>
            <div class="next-info">${escapeHtml(route)}${stopLines}</div>
            <div class="next-actions">
              ${mapBtn}
              <button type="button" class="todo-icon-btn next-edit" data-itin-edit="${d}" aria-label="編輯行程" title="編輯">✎</button>
            </div>
            ${mapBlock}
          </div>`;
        })
        .join("");
    }
  }

  function renderMonthGrid() {
    const [yy, mm] = (state.calMonth || "2026-12").split("-").map(Number);
    document.getElementById("calMonthLabel").textContent = `${yy}年${mm}月`;

    const first = new Date(yy, mm - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const today = focusDate();
    const grid = document.getElementById("calGrid");
    const cells = [];

    for (let i = 0; i < startPad; i++) {
      cells.push(`<div class="cal-cell empty"></div>`);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const inTrip = isInTrip(ds);
      const isToday = ds === today;
      const isSel = ds === state.selectedDate;
      const city = state.cities[ds] || "";
      const spend = inTrip ? spentOn(ds) : 0;
      const shortCity = city.replace(/→.*$/, "").slice(0, 8);
      cells.push(`
        <div class="cal-cell ${inTrip ? "in-trip" : ""} ${isToday ? "today" : ""} ${isSel && !isToday ? "selected" : ""}"
             data-date="${ds}" role="button" tabindex="0">
          <span class="d">${d}</span>
          ${inTrip && shortCity ? `<span class="city">${escapeHtml(shortCity)}</span>` : ""}
          ${spend > 0 ? `<span class="spend">$${money(spend)}</span>` : ""}
        </div>`);
    }
    grid.innerHTML = cells.join("");
  }

  // ---------- Ledger ----------
  function renderLedger() {
    const daySel = document.getElementById("filterDay");
    const catSel = document.getElementById("filterCat");
    const dates = tripDates();
    const prevDay = daySel.value;
    daySel.innerHTML =
      `<option value="all">全部日子</option>` +
      dates
        .map((d) => {
          const n = dayIndex(d);
          return `<option value="${d}">Day ${n} · ${fmtDate(d)} ${state.cities[d] || ""}</option>`;
        })
        .join("");
    if ([...daySel.options].some((o) => o.value === prevDay)) daySel.value = prevDay;

    const dayF = daySel.value;
    const catF = catSel.value;
    let list = [...state.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (dayF !== "all") list = list.filter((e) => e.date === dayF);
    if (catF !== "all") list = list.filter((e) => e.cat === catF);

    const sum = totalSpent(list);
    document.getElementById("ledgerSummary").innerHTML = `
      <span>顯示 <strong>${list.length}</strong> 筆</span>
      <span>小計 <strong>HKD $${money(sum)}</strong></span>
      ${
        fxEnabled()
          ? `<span>約 <strong>${formatLocalMoney(hkdToJpy(sum))}</strong></span>`
          : ""
      }`;

    // Settle-up always uses ALL trip expenses (not day/cat filter)
    const balances = computePersonBalances();
    const transfers = settleTransfers(balances);
    const settleEl = document.getElementById("ledgerSettle");
    if (settleEl) {
      settleEl.innerHTML =
        `<h3 class="section-h">每人結算</h3>` +
        `<p class="settle-sub">以全行程開支計算（唔受上面篩選影響）</p>` +
        renderSettleHtml(balances, transfers);
    }

    const el = document.getElementById("ledgerList");
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">呢個篩選暫時冇記錄 ✍️</div>`;
      return;
    }
    el.innerHTML = list
      .map((e) => {
        const personal = isPersonalExpense(e);
        const split = expenseSplitWith(e);
        let splitNote;
        if (personal) {
          splitNote = ` <span class="split-pill private">私人</span>`;
        } else if (split.length) {
          const n = split.length;
          const allN = (state.trip.companions || []).length;
          const detail =
            n < allN || (allN > 0 && n !== allN)
              ? ` · ${escapeHtml(split.join("、"))}`
              : "";
          splitNote = ` <span class="split-pill shared">${n} 人夾</span>${detail}`;
        } else {
          splitNote = "";
        }
        return `
      <div class="ledger-item" data-id="${e.id}">
        <div>
          <div class="li-title"><span class="cat-pill cat-${e.cat}">${e.cat}</span>${escapeHtml(e.title)}</div>
          <div class="li-meta">${fmtDate(e.date)} · Day ${dayIndex(e.date)} · ${escapeHtml(e.payer || "—")}畀${splitNote}${
          e.note ? " · " + escapeHtml(e.note) : ""
        }</div>
        </div>
        <div>
          <div class="li-amt">HKD $${money(e.hkd)}
            ${e.jpy ? `<div class="li-jpy">${fxEnabled() ? escapeHtml(activeFxCode()) + " " : "當地 "}${money(e.jpy)}</div>` : ""}
          </div>
          <div class="li-actions">
            <button type="button" class="btn btn-ghost sm" data-edit="${e.id}">編輯</button>
            <button type="button" class="btn btn-danger" data-del="${e.id}">刪除</button>
          </div>
        </div>
      </div>`;
      })
      .join("");
  }

  // ---------- Charts ----------
  function renderCharts() {
    const byCat = {};
    state.expenses.forEach((e) => {
      byCat[e.cat] = (byCat[e.cat] || 0) + Number(e.hkd);
    });
    drawPie(byCat);

    const dates = tripDates();
    const max = Math.max(1, ...dates.map((d) => spentOn(d)));
    const today = focusDate();
    document.getElementById("dailyBars").innerHTML = dates
      .map((d) => {
        const v = spentOn(d);
        const h = Math.round((v / max) * 130);
        const dt = parseDate(d);
        return `
        <div class="bar-col ${d === today ? "today-bar" : ""}" title="${fmtDate(d)}: $${money(v)}">
          <div class="bar" style="height:${Math.max(v ? 4 : 0, h)}px"></div>
          <div class="bar-label">${dt.getDate()}<br>${(state.cities[d] || "").slice(0, 2)}</div>
        </div>`;
      })
      .join("");

    const spent = totalSpent();
    const budget = Number(state.trip.budget) || 0;
    if (budget <= 0) {
      document.getElementById("budgetStats").innerHTML = `
      <div><div class="stat-val">$${money(spent)}</div><div class="stat-label">已用（HKD）</div></div>
      <div><div class="stat-val">—</div><div class="stat-label">剩餘</div></div>
      <div><div class="stat-val">未設定</div><div class="stat-label">預算用量</div></div>
      <div class="stat-bar-big"><div class="stat-bar-fill" style="width:0%"></div></div>
      <p class="hint" style="margin-top:.75rem">先去設定填預算</p>`;
    } else {
      const left = Math.max(0, budget - spent);
      const pct = Math.min(100, Math.round((spent / budget) * 100));
      document.getElementById("budgetStats").innerHTML = `
      <div><div class="stat-val">$${money(spent)}</div><div class="stat-label">已用（HKD）</div></div>
      <div><div class="stat-val">$${money(left)}</div><div class="stat-label">剩餘</div></div>
      <div><div class="stat-val">${pct}%</div><div class="stat-label">預算用量</div></div>
      <div class="stat-bar-big"><div class="stat-bar-fill" style="width:${pct}%"></div></div>`;
    }

    renderPersonSpendChart();
  }

  function renderPersonSpendChart() {
    const el = document.getElementById("personSpend");
    if (!el) return;
    const balances = computePersonBalances();
    const transfers = settleTransfers(balances);
    if (!balances.length) {
      el.innerHTML = `<p class="hint">未設定旅伴</p>`;
      return;
    }
    if (!state.expenses.length) {
      el.innerHTML = `<p class="hint">暫未有開支記錄</p>`;
      return;
    }
    const max = Math.max(1, ...balances.map((b) => Math.max(b.paid, b.share)));
    const bars = balances
      .map((b) => {
        const paidH = Math.round((b.paid / max) * 100);
        const shareH = Math.round((b.share / max) * 100);
        let netTxt;
        let netClass;
        if (b.net > 0.5) {
          netTxt = `+$${money(b.net)} 應收回`;
          netClass = "net-pos";
        } else if (b.net < -0.5) {
          netTxt = `−$${money(-b.net)} 應夾返`;
          netClass = "net-neg";
        } else {
          netTxt = "已平帳";
          netClass = "net-zero";
        }
        return `<div class="person-spend-row">
          <div class="person-spend-head">
            <strong>${escapeHtml(b.name)}</strong>
            <span class="settle-net ${netClass}">${netTxt}</span>
          </div>
          <div class="person-dual-bars">
            <div class="person-bar-line">
              <span class="pb-label">墊付</span>
              <div class="pb-track"><div class="pb-fill pb-paid" style="width:${paidH}%"></div></div>
              <span class="pb-amt">$${money(b.paid)}</span>
            </div>
            <div class="person-bar-line">
              <span class="pb-label">應分攤</span>
              <div class="pb-track"><div class="pb-fill pb-share" style="width:${shareH}%"></div></div>
              <span class="pb-amt">$${money(b.share)}</span>
            </div>
          </div>
        </div>`;
      })
      .join("");
    let how = "";
    if (transfers.length) {
      how =
        `<div class="settle-how compact"><div class="settle-how-title">要點樣夾</div><ul class="settle-transfers">` +
        transfers
          .map(
            (t) =>
              `<li><strong>${escapeHtml(t.from)}</strong> → <strong>${escapeHtml(t.to)}</strong>　HKD $${money(
                t.amount
              )}</li>`
          )
          .join("") +
        `</ul></div>`;
    }
    el.innerHTML = bars + how;
  }

  function drawPie(byCat) {
    const canvas = document.getElementById("pieChart");
    const ctx = canvas.getContext("2d");
    const entries = Object.entries(byCat).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    const cx = 110, cy = 110, r = 90;

    ctx.clearRect(0, 0, 220, 220);
    if (!entries.length) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#e0d4bc";
      ctx.fill();
      document.getElementById("pieLegend").innerHTML = `<li>暫無資料</li>`;
      return;
    }

    let angle = -Math.PI / 2;
    entries.forEach(([cat, val]) => {
      const slice = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = CAT_COLORS[cat] || "#aaa";
      ctx.fill();
      ctx.strokeStyle = "#faf6eb";
      ctx.lineWidth = 3;
      ctx.stroke();
      angle += slice;
    });

    // inner hole for donut feel
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.fillStyle = "#faf6eb";
    ctx.fill();
    ctx.fillStyle = "#3d3429";
    ctx.font = "700 14px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$" + money(total), cx, cy);

    document.getElementById("pieLegend").innerHTML = entries
      .map(
        ([cat, val]) =>
          `<li><span class="swatch" style="background:${CAT_COLORS[cat]}"></span>${cat} · $${money(val)}（${Math.round(
            (val / total) * 100
          )}%）</li>`
      )
      .join("");
  }

  // ---------- Settings ----------
  function fillSettings() {
    document.getElementById("setTitle").value = state.trip.title;
    document.getElementById("setStart").value = state.trip.start;
    document.getElementById("setEnd").value = state.trip.end;
    document.getElementById("setBudget").value = state.trip.budget;
    document.getElementById("setCompanions").value = (state.trip.companions || []).join("、");
    fillFxCurrencySelect();
    document.getElementById("setRate").value = activeFxRate();
    updateFxMeta();
    const modeEl = document.getElementById("setTravelMode");
    if (modeEl) modeEl.value = state.trip.travelMode || "driving";
    fillSyncForm();
  }

  // ---------- Modal ----------
  function updateSplitCount() {
    const countEl = document.getElementById("expSplitCount");
    if (!countEl) return;
    const n = document.querySelectorAll('input[name="expSplitWith"]:checked').length;
    countEl.textContent = `已揀 ${n} 人`;
  }

  function syncSplitModeUI() {
    const yes = document.getElementById("expSplitYes");
    const wantSplit = yes ? yes.checked : true;
    const panel = document.getElementById("expSplitPanel");
    const hint = document.getElementById("expSplitPrivateHint");
    if (panel) panel.hidden = !wantSplit;
    if (hint) hint.hidden = wantSplit;
    updateSplitCount();
  }

  function openExpenseModal(expense) {
    const modal = document.getElementById("modal");
    const companions = state.trip.companions || [];
    const payerSel = document.getElementById("expPayer");
    payerSel.innerHTML = companions
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");

    document.getElementById("modalTitle").textContent = expense ? "編輯開支" : "記一筆";
    document.getElementById("expId").value = expense ? expense.id : "";
    document.getElementById("expDate").value = expense ? expense.date : focusDate();
    document.getElementById("expTitle").value = expense ? expense.title : "";
    document.getElementById("expHkd").value = expense ? expense.hkd : "";
    document.getElementById("expJpy").value = expense && expense.jpy ? expense.jpy : "";
    syncExpLocalLabel();
    document.getElementById("expCat").value = expense ? expense.cat : "飲食";
    document.getElementById("expPayer").value = expense ? expense.payer : companions[0] || "";
    document.getElementById("expNote").value = expense ? expense.note || "" : "";

    const personal = expense ? isPersonalExpense(expense) : false;
    const yesRadio = document.getElementById("expSplitYes");
    const noRadio = document.getElementById("expSplitNo");
    if (yesRadio && noRadio) {
      yesRadio.checked = !personal;
      noRadio.checked = personal;
    }

    const checked = new Set(
      expense && !personal && Array.isArray(expense.splitWith) && expense.splitWith.length
        ? expense.splitWith
        : companions
    );
    const splitBox = document.getElementById("expSplit");
    if (splitBox) {
      if (!companions.length) {
        splitBox.innerHTML = `<p class="hint">未有旅伴 — 去設定加先</p>`;
      } else {
        splitBox.innerHTML = companions
          .map(
            (c) => `
          <label class="split-check">
            <input type="checkbox" name="expSplitWith" value="${escapeHtml(c)}" ${
              checked.has(c) ? "checked" : ""
            } />
            <span>${escapeHtml(c)}</span>
          </label>`
          )
          .join("");
      }
    }

    syncSplitModeUI();
    modal.hidden = false;
    document.getElementById("expTitle").focus();
  }

  function closeModal() {
    document.getElementById("modal").hidden = true;
  }

  function openTodoModal(todo) {
    const modal = document.getElementById("todoModal");
    document.getElementById("todoModalTitle").textContent = todo ? "編輯待辦" : "加待辦";
    document.getElementById("todoId").value = todo ? todo.id : "";
    document.getElementById("todoDate").value = todo ? todo.date : focusDate();
    document.getElementById("todoText").value = todo ? todo.text : "";
    document.getElementById("todoNote").value = todo && todo.note ? todo.note : "";
    modal.hidden = false;
    document.getElementById("todoText").focus();
  }

  function closeTodoModal() {
    document.getElementById("todoModal").hidden = true;
  }

  function syncPretripToggleBtn() {
    const btn = document.getElementById("btnTogglePretrip");
    const body = document.getElementById("pretripBody");
    if (!btn || !body) return;
    const on = state.showPretrip !== false;
    btn.textContent = on ? "隱藏" : "顯示";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-off", !on);
    body.hidden = !on;
    const addBtn = document.getElementById("btnAddPretrip");
    if (addBtn) addBtn.hidden = !on;
  }

  function renderPretrip() {
    syncPretripToggleBtn();
    const list = document.getElementById("pretripList");
    const prog = document.getElementById("pretripProgress");
    if (!list) return;
    if (!Array.isArray(state.pretrip)) state.pretrip = seedData().pretrip;
    const items = state.pretrip;
    const done = items.filter((x) => x.done).length;
    if (prog) prog.textContent = items.length ? `· ${done}/${items.length}` : "";
    if (!items.length) {
      list.innerHTML = `<li class="todo-empty"><span class="todo-text">未有項目 — 撳「＋ 加項目」</span></li>`;
      return;
    }
    list.innerHTML = items
      .map(
        (t) => `
        <li class="todo-item ${t.done ? "done" : ""}" data-pretrip="${escapeHtml(t.id)}">
          <input type="checkbox" ${t.done ? "checked" : ""} />
          <span class="check" aria-hidden="true"></span>
          <div class="todo-body">
            <span class="todo-text">${escapeHtml(t.text)}</span>
            ${t.note ? `<span class="todo-meta">${escapeHtml(t.note)}</span>` : ""}
          </div>
          <div class="todo-actions">
            <button type="button" class="todo-icon-btn" data-pretrip-edit="${escapeHtml(t.id)}" aria-label="編輯" title="編輯">✎</button>
            <button type="button" class="todo-icon-btn danger" data-pretrip-del="${escapeHtml(t.id)}" aria-label="刪除" title="刪除">✕</button>
          </div>
        </li>`
      )
      .join("");
  }

  function openPretripModal(item) {
    const modal = document.getElementById("pretripModal");
    document.getElementById("pretripModalTitle").textContent = item ? "編輯 checklist" : "加 checklist 項目";
    document.getElementById("pretripId").value = item ? item.id : "";
    document.getElementById("pretripText").value = item ? item.text : "";
    document.getElementById("pretripNote").value = item ? item.note || "" : "";
    modal.hidden = false;
    document.getElementById("pretripText").focus();
  }

  function closePretripModal() {
    document.getElementById("pretripModal").hidden = true;
  }

  function openItineraryModal(date, opts) {
    const d = date || focusDate();
    if (!isInTrip(d)) {
      toast("請揀行程入面嘅日子");
      return;
    }
    const modal = document.getElementById("itineraryModal");
    const stops = dayStops(d).map((s) => ({ ...s }));
    if (opts && opts.addStop) stops.push(emptyStop());
    if (!stops.length) stops.push(emptyStop());
    document.getElementById("itineraryModalTitle").textContent = "編輯行程";
    document.getElementById("itinDate").value = d;
    document.getElementById("itinDateLabel").value =
      `Day ${dayIndex(d)} · ${fmtDateLong(d)}`;
    document.getElementById("itinCity").value = state.cities[d] || "";
    document.getElementById("itinTitle").value = state.dayTitles[d] || "";
    renderItinStopFields(stops);
    modal.hidden = false;
    const firstPlace = document.querySelector('#itinStops [data-f="place"]');
    if (opts && opts.addStop && firstPlace) {
      const places = document.querySelectorAll('#itinStops [data-f="place"]');
      const last = places[places.length - 1];
      if (last) last.focus();
    } else {
      document.getElementById("itinCity").focus();
    }
  }

  function closeItineraryModal() {
    document.getElementById("itineraryModal").hidden = true;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeStop(s) {
    const o = s && typeof s === "object" ? s : {};
    return {
      id: o.id || uid("s"),
      time: String(o.time || "").trim(),
      place: String(o.place || o.route || "").trim(),
      note: String(o.note || "").trim(),
      maps: String(o.maps || "").trim(),
      showMap: o.showMap !== false,
      toNextMode: normalizeTravelMode(o.toNextMode, true),
    };
  }

  function normalizeDayItinerary(raw) {
    if (!raw) return { stops: [], showDayRouteMap: true };
    if (Array.isArray(raw)) {
      return {
        stops: raw.map(normalizeStop).filter((s) => s.place || s.note || s.maps || s.time),
        showDayRouteMap: true,
      };
    }
    if (raw.stops && Array.isArray(raw.stops)) {
      return {
        stops: raw.stops.map(normalizeStop).filter((s) => s.place || s.note || s.maps || s.time),
        showDayRouteMap: raw.showDayRouteMap !== false,
      };
    }
    // Legacy single object { route, note, maps }
    const places = String(raw.route || "")
      .split(/\s*→\s*|\s*->\s*|\s*／\s*|\s*\/\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    const stops = [];
    if (places.length) {
      places.forEach((p, i) => {
        stops.push({
          id: uid("s"),
          time: "",
          place: p,
          note: i === 0 ? String(raw.note || "").trim() : "",
          maps: i === 0 ? String(raw.maps || "").trim() || p : p,
        });
      });
    } else if (raw.note || raw.maps) {
      stops.push({
        id: uid("s"),
        time: "",
        place: String(raw.maps || "行程").trim(),
        note: String(raw.note || "").trim(),
        maps: String(raw.maps || "").trim(),
      });
    }
    return { stops, showDayRouteMap: true };
  }

  function normalizeItinerary(st) {
    if (!st.itinerary || typeof st.itinerary !== "object") st.itinerary = {};
    Object.keys(st.itinerary).forEach((d) => {
      st.itinerary[d] = normalizeDayItinerary(st.itinerary[d]);
    });
  }

  function dayStops(d) {
    const it = normalizeDayItinerary((state.itinerary && state.itinerary[d]) || null);
    return it.stops || [];
  }

  function mapsUrl(raw) {
    const v = String(raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\/(www\.)?(google\.[^/]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(v)) {
      return v;
    }
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v);
  }

  function mapsEmbedUrl(raw) {
    const v = String(raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) {
      if (/\/maps\/embed/i.test(v) || /[?&]output=embed\b/i.test(v)) return v;
      try {
        const u = new URL(v);
        const host = u.hostname.replace(/^www\./, "");
        if (host === "maps.app.goo.gl" || host === "goo.gl") return "";
        if (host.includes("google.") || host.startsWith("maps.google.")) {
          const q =
            u.searchParams.get("q") ||
            u.searchParams.get("query") ||
            (u.pathname.match(/\/place\/([^/]+)/) || [])[1] ||
            (u.pathname.match(/\/search\/([^/]+)/) || [])[1];
          if (q) {
            return (
              "https://maps.google.com/maps?q=" +
              encodeURIComponent(decodeURIComponent(q.replace(/\+/g, " "))) +
              "&z=14&output=embed"
            );
          }
          // Fall back: append output=embed when possible
          u.searchParams.set("output", "embed");
          return u.toString();
        }
      } catch (_) {}
      return "";
    }
    return "https://maps.google.com/maps?q=" + encodeURIComponent(v) + "&z=14&output=embed";
  }

  function dayMapsQuery(d) {
    const stops = dayStops(d);
    for (const s of stops) {
      if (s.maps) return s.maps;
      if (s.place) return s.place;
    }
    return "";
  }

  function stopMapsQuery(stop) {
    if (!stop) return "";
    if (stop.maps) return stop.maps;
    if (stop.place) return stop.place;
    return "";
  }

  function mapsVisible() {
    return state.showMaps !== false;
  }

  function syncMapsToggleBtn() {
    const btn = document.getElementById("btnToggleMaps");
    if (!btn) return;
    const on = dayAnyMapVisible(focusDate());
    btn.textContent = on ? "全部隱藏地圖" : "全部顯示地圖";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-maps-off", !on);
  }

  /** Place text suitable for directions (avoid raw maps URLs). */
  function stopRouteQuery(stop) {
    if (!stop) return "";
    const maps = String(stop.maps || "").trim();
    const place = String(stop.place || "").trim();
    if (maps && !/^https?:\/\//i.test(maps)) return maps;
    return place || "";
  }

  function normalizeTravelMode(m, allowEmpty) {
    const v = String(m || "").trim();
    if (!v) return allowEmpty ? "" : "driving";
    if (["driving", "transit", "walking", "bicycling"].includes(v)) return v;
    return allowEmpty ? "" : "driving";
  }

  function travelModeLabel(mode) {
    return (
      {
        driving: "自駕",
        transit: "公共交通",
        walking: "步行",
        bicycling: "單車",
      }[mode] || "自駕"
    );
  }

  function tripTravelMode() {
    return normalizeTravelMode(state.trip && state.trip.travelMode, false);
  }

  function resolveTravelMode(override) {
    const o = normalizeTravelMode(override, true);
    return o || tripTravelMode();
  }

  function travelModeDirflg(mode) {
    return { driving: "d", transit: "r", walking: "w", bicycling: "b" }[resolveTravelMode(mode)] || "d";
  }

  function mapsDirectionsEmbedUrl(from, to, mode) {
    const a = String(from || "").trim();
    const b = String(to || "").trim();
    if (!a || !b) return "";
    return (
      "https://maps.google.com/maps?saddr=" +
      encodeURIComponent(a) +
      "&daddr=" +
      encodeURIComponent(b) +
      "&dirflg=" +
      travelModeDirflg(mode) +
      "&hl=zh-TW&output=embed"
    );
  }

  function mapsDirectionsUrl(from, to, mode) {
    const a = String(from || "").trim();
    const b = String(to || "").trim();
    if (!a || !b) return "";
    return (
      "https://www.google.com/maps/dir/?api=1&origin=" +
      encodeURIComponent(a) +
      "&destination=" +
      encodeURIComponent(b) +
      "&travelmode=" +
      encodeURIComponent(resolveTravelMode(mode))
    );
  }

  function mapsMultiDirectionsEmbedUrl(places, mode) {
    const pts = (places || []).map((p) => String(p || "").trim()).filter(Boolean);
    if (pts.length < 2) return "";
    if (pts.length === 2) return mapsDirectionsEmbedUrl(pts[0], pts[1], mode);
    const saddr = encodeURIComponent(pts[0]);
    const daddr =
      encodeURIComponent(pts[1]) +
      pts
        .slice(2)
        .map((p) => "+to:" + encodeURIComponent(p))
        .join("");
    return (
      "https://maps.google.com/maps?saddr=" +
      saddr +
      "&daddr=" +
      daddr +
      "&dirflg=" +
      travelModeDirflg(mode) +
      "&hl=zh-TW&output=embed"
    );
  }

  function mapsMultiDirectionsUrl(places, mode) {
    const pts = (places || []).map((p) => String(p || "").trim()).filter(Boolean);
    if (pts.length < 2) return "";
    if (pts.length === 2) return mapsDirectionsUrl(pts[0], pts[1], mode);
    let url =
      "https://www.google.com/maps/dir/?api=1&origin=" +
      encodeURIComponent(pts[0]) +
      "&destination=" +
      encodeURIComponent(pts[pts.length - 1]);
    const mid = pts.slice(1, -1);
    if (mid.length) url += "&waypoints=" + encodeURIComponent(mid.join("|"));
    url += "&travelmode=" + encodeURIComponent(resolveTravelMode(mode));
    return url;
  }

  function renderDayStops(date) {
    const el = document.getElementById("dayStopsList");
    if (!el) return;
    const day = normalizeDayItinerary((state.itinerary && state.itinerary[date]) || null);
    const stops = sortStopsByTime(day.stops || []);
    syncMapsToggleBtn();
    if (!stops.length) {
      el.innerHTML = `<div class="day-stops-empty">未有地點 — 撳右上「＋ 加地點」開始排行程</div>`;
      return;
    }

    const routePts = stops.map(stopRouteQuery).filter(Boolean);
    const showDayRoute = day.showDayRouteMap !== false;
    let html = "";

    // 兩站：一張全日路線圖就夠。三站或以上：唔出全日總圖，改為每段各自一張（避免 1→2 同總圖重複）。
    const twoStopDay = routePts.length === 2;
    const multiLegDay = routePts.length >= 3;
    if (routePts.length >= 2) {
      const overviewMode = resolveTravelMode(stops[0] && stops[0].toNextMode);
      const fullEmbed = twoStopDay && showDayRoute ? mapsMultiDirectionsEmbedUrl(routePts, overviewMode) : "";
      const fullHref = mapsMultiDirectionsUrl(routePts, overviewMode);
      html += `
        <div class="day-route-card">
          <div class="day-route-head">
            <span class="day-route-title">今日路線</span>
            <span class="day-route-sub">${escapeHtml(routePts.join(" → "))}</span>
            ${
              twoStopDay
                ? `<button type="button" class="btn btn-ghost sm" data-toggle-day-route="${escapeHtml(date)}" aria-pressed="${showDayRoute ? "true" : "false"}">${
                    showDayRoute ? "隱藏路線圖" : "顯示路線圖"
                  }</button>`
                : ""
            }
            ${
              fullHref
                ? `<a class="btn btn-ghost sm" href="${escapeHtml(fullHref)}" target="_blank" rel="noopener">開路線</a>`
                : ""
            }
          </div>
          ${
            fullEmbed
              ? `<div class="day-stop-map day-route-map"><iframe title="今日路線" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${escapeHtml(fullEmbed)}"></iframe></div>`
              : ""
          }
        </div>`;
    }

    const multi = routePts.length >= 2;
    stops.forEach((s, i) => {
      const q = stopMapsQuery(s);
      const href = mapsUrl(q);
      const on = stopShowsMap(s);
      const mapLink = href
        ? `<a class="todo-icon-btn" href="${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="開地圖">🗺</a>`
        : "";
      const toggleBtn = `<button type="button" class="btn btn-ghost sm stop-map-toggle ${on ? "" : "is-maps-off"}" data-toggle-stop-map="${escapeHtml(s.id)}" aria-pressed="${on ? "true" : "false"}">${
        on ? "隱藏地圖" : "顯示地圖"
      }</button>`;
      // Place pin embed only on single-stop days (multi-stop days use route/leg maps).
      const embed = on && !multi ? mapsEmbedUrl(q) : "";
      const mapBlock = embed
        ? `<div class="day-stop-map"><iframe title="${escapeHtml(s.place || "地圖")}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${escapeHtml(embed)}"></iframe></div>`
        : "";
      html += `
        <div class="day-stop" data-stop-id="${escapeHtml(s.id)}">
          <div class="day-stop-top">
            <div>
              <div class="day-stop-name">${
                s.time
                  ? `<span class="day-stop-time">${escapeHtml(s.time)}</span>`
                  : `<span class="day-stop-idx">${i + 1}.</span>`
              } ${escapeHtml(s.place || "未命名地點")}</div>
              ${s.note ? `<div class="day-stop-note">${escapeHtml(s.note)}</div>` : ""}
            </div>
            <div class="next-actions">
              ${toggleBtn}
              ${mapLink}
              <button type="button" class="todo-icon-btn" data-stop-edit="${escapeHtml(s.id)}" aria-label="編輯行程" title="編輯">✎</button>
            </div>
          </div>
          ${mapBlock}
        </div>`;

      const next = stops[i + 1];
      if (next) {
        const fromQ = stopRouteQuery(s);
        const toQ = stopRouteQuery(next);
        const legMode = resolveTravelMode(s.toNextMode);
        const segHref = mapsDirectionsUrl(fromQ, toQ, legMode);
        // 兩站：全日路線圖已涵蓋 1→2。三站+：每一段各自一張圖（含 1→2），跟出發站顯示／隱藏。
        const segEmbed =
          multiLegDay && on ? mapsDirectionsEmbedUrl(fromQ, toQ, legMode) : "";
        if (segHref) {
          html += `
          <div class="day-leg">
            <div class="day-leg-label">
              <span>↗ 前往下一站 · ${escapeHtml(travelModeLabel(legMode))}</span>
              <span class="day-leg-path">${escapeHtml(fromQ)} → ${escapeHtml(toQ)}</span>
              <a class="day-leg-open" href="${escapeHtml(segHref)}" target="_blank" rel="noopener">導航</a>
            </div>
            ${
              segEmbed
                ? `<div class="day-stop-map day-leg-map"><iframe title="${escapeHtml(fromQ)} 到 ${escapeHtml(toQ)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${escapeHtml(segEmbed)}"></iframe></div>`
                : ""
            }
          </div>`;
        }
      }
    });

    el.innerHTML = html;
  }

  function emptyStop() {
    return { id: uid("s"), time: "", place: "", note: "", maps: "", showMap: true, toNextMode: "" };
  }

  function stopShowsMap(stop) {
    return !stop || stop.showMap !== false;
  }

  function ensureDayItin(d) {
    if (!state.itinerary) state.itinerary = {};
    state.itinerary[d] = normalizeDayItinerary(state.itinerary[d] || { stops: [] });
    return state.itinerary[d];
  }

  function setStopShowMap(date, stopId, on) {
    const day = ensureDayItin(date);
    day.stops = day.stops.map((s) =>
      s.id === stopId ? { ...s, showMap: !!on } : s
    );
    state.itinerary[date] = day;
    save();
  }

  function setDayRouteMap(date, on) {
    const day = ensureDayItin(date);
    day.showDayRouteMap = !!on;
    state.itinerary[date] = day;
    save();
  }

  function dayAnyMapVisible(date) {
    const day = normalizeDayItinerary((state.itinerary && state.itinerary[date]) || null);
    if (day.showDayRouteMap !== false && (day.stops || []).length >= 2) return true;
    return (day.stops || []).some((s) => stopShowsMap(s));
  }

  function setAllMapsForDay(date, on) {
    const day = ensureDayItin(date);
    day.showDayRouteMap = !!on;
    day.stops = day.stops.map((s) => ({ ...s, showMap: !!on }));
    state.itinerary[date] = day;
    state.showMaps = !!on;
    save();
  }

  function fmtStopTime(t) {
    const v = String(t || "").trim();
    return v;
  }

  function sortStopsByTime(stops) {
    return (stops || []).slice().sort((a, b) => {
      const ta = String(a.time || "");
      const tb = String(b.time || "");
      if (ta && tb) return ta.localeCompare(tb);
      if (ta) return -1;
      if (tb) return 1;
      return 0;
    });
  }

  function renderItinStopFields(stops) {
    const box = document.getElementById("itinStops");
    if (!box) return;
    const list = stops && stops.length ? stops : [emptyStop()];
    box.innerHTML = list
      .map((s, i) => {
        return `
        <div class="itin-stop" data-stop-row="${escapeHtml(s.id)}">
          <div class="itin-stop-bar">
            <span class="itin-stop-idx">地點 ${i + 1}</span>
            <button type="button" class="todo-icon-btn danger" data-remove-stop="${escapeHtml(s.id)}" aria-label="刪除此地點" title="刪除">✕</button>
          </div>
          <div class="itin-stop-row2">
            <label>時間（可選）
              <input type="time" data-f="time" value="${escapeHtml(s.time)}" />
            </label>
            <label class="itin-place-field">名稱
              <input type="text" data-f="place" value="${escapeHtml(s.place)}" placeholder="例如：淺草寺" maxlength="60" required />
            </label>
          </div>
          <label>備註（可選）
            <input type="text" data-f="note" value="${escapeHtml(s.note)}" placeholder="例如：傍晚去" maxlength="120" />
          </label>
          <label>Google 地圖（可選）
            <input type="text" data-f="maps" value="${escapeHtml(s.maps)}" placeholder="地名或 Maps 連結" maxlength="300" />
          </label>
          <label>去下一站交通（可選）
            <select data-f="toNextMode">
              <option value="" ${!s.toNextMode ? "selected" : ""}>跟設定預設（${escapeHtml(travelModeLabel(tripTravelMode()))}）</option>
              <option value="driving" ${s.toNextMode === "driving" ? "selected" : ""}>自駕</option>
              <option value="transit" ${s.toNextMode === "transit" ? "selected" : ""}>公共交通</option>
              <option value="walking" ${s.toNextMode === "walking" ? "selected" : ""}>步行</option>
              <option value="bicycling" ${s.toNextMode === "bicycling" ? "selected" : ""}>單車</option>
            </select>
          </label>
        </div>`;
      })
      .join("");
  }

  function readItinStopsFromForm() {
    const box = document.getElementById("itinStops");
    if (!box) return [];
    return Array.from(box.querySelectorAll(".itin-stop"))
      .map((row) => {
        const time = (row.querySelector('[data-f="time"]') || {}).value || "";
        const place = (row.querySelector('[data-f="place"]') || {}).value || "";
        const note = (row.querySelector('[data-f="note"]') || {}).value || "";
        const maps = (row.querySelector('[data-f="maps"]') || {}).value || "";
        const toNextMode = (row.querySelector('[data-f="toNextMode"]') || {}).value || "";
        const prev = (state.itinerary[document.getElementById("itinDate").value] || {}).stops || [];
        const old = prev.find((x) => x.id === row.getAttribute("data-stop-row"));
        return {
          id: row.getAttribute("data-stop-row") || uid("s"),
          time: time.trim(),
          place: place.trim(),
          note: note.trim(),
          maps: maps.trim(),
          showMap: old ? old.showMap !== false : true,
          toNextMode: normalizeTravelMode(toNextMode, true),
        };
      })
      .filter((s) => s.place || s.note || s.maps || s.time);
  }

  // ---------- Events ----------
  function bind() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    document.getElementById("btnScan").addEventListener("click", () => {
      toast("📷 OCR 掃描收據稍後加入 — 而家請用「記一筆」啦");
    });

    document.getElementById("btnAddExpense").addEventListener("click", () => openExpenseModal(null));
    document.getElementById("btnAddExpense2").addEventListener("click", () => openExpenseModal(null));

    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.matches("[data-close]") || e.target.classList.contains("modal-backdrop")) closeModal();
    });

    document.getElementById("expenseForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("expId").value;
      const payer = document.getElementById("expPayer").value;
      const wantSplit = document.getElementById("expSplitYes")
        ? document.getElementById("expSplitYes").checked
        : true;
      let split = !!wantSplit;
      let splitWith;
      if (!split) {
        splitWith = payer ? [payer] : [];
      } else {
        const splitChecked = [...document.querySelectorAll('input[name="expSplitWith"]:checked')].map(
          (el) => el.value
        );
        if (!splitChecked.length) {
          toast("要攤分嘅話至少剔 1 個人啦");
          return;
        }
        splitWith = splitChecked;
      }
      const entry = {
        id: id || uid("e"),
        date: document.getElementById("expDate").value,
        title: document.getElementById("expTitle").value.trim(),
        hkd: Number(document.getElementById("expHkd").value) || 0,
        jpy: document.getElementById("expJpy").value
          ? Number(document.getElementById("expJpy").value)
          : null,
        cat: document.getElementById("expCat").value,
        payer,
        split,
        splitWith,
        note: document.getElementById("expNote").value.trim(),
      };
      if (!entry.jpy && entry.hkd && fxEnabled()) entry.jpy = hkdToJpy(entry.hkd);
      if (!fxEnabled()) entry.jpy = entry.jpy || null;

      if (id) {
        const i = state.expenses.findIndex((x) => x.id === id);
        if (i >= 0) state.expenses[i] = entry;
      } else {
        state.expenses.push(entry);
      }
      save();
      closeModal();
      toast(id ? "已更新開支 ✓" : "已記一筆 ✓");
      renderAll();
    });

    document.getElementById("expenseForm").addEventListener("change", (e) => {
      if (e.target && e.target.name === "expSplitMode") syncSplitModeUI();
      if (e.target && e.target.name === "expSplitWith") updateSplitCount();
    });

    // Auto-fill local currency when HKD changes
    document.getElementById("expHkd").addEventListener("change", () => {
      const h = Number(document.getElementById("expHkd").value);
      if (fxEnabled() && h && !document.getElementById("expJpy").value) {
        document.getElementById("expJpy").value = hkdToJpy(h);
      }
    });

    document.getElementById("btnAddTodo").addEventListener("click", () => openTodoModal(null));

    document.getElementById("btnTogglePretrip").addEventListener("click", () => {
      state.showPretrip = state.showPretrip === false;
      save();
      syncPretripToggleBtn();
      toast(state.showPretrip !== false ? "已顯示旅行前 checklist" : "已隱藏旅行前 checklist");
    });

    document.getElementById("btnAddPretrip").addEventListener("click", () => openPretripModal(null));

    document.getElementById("pretripModal").addEventListener("click", (e) => {
      if (e.target.matches("[data-close-pretrip]") || e.target.classList.contains("modal-backdrop")) {
        closePretripModal();
      }
    });

    document.getElementById("pretripForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("pretripId").value;
      const text = document.getElementById("pretripText").value.trim();
      if (!text) {
        toast("請填寫項目");
        return;
      }
      if (!Array.isArray(state.pretrip)) state.pretrip = seedData().pretrip;
      const entry = {
        id: id || uid("p"),
        text: text,
        note: document.getElementById("pretripNote").value.trim(),
        done: false,
      };
      if (id) {
        const i = state.pretrip.findIndex((x) => x.id === id);
        if (i >= 0) {
          entry.done = !!state.pretrip[i].done;
          state.pretrip[i] = entry;
        }
      } else {
        state.pretrip.push(entry);
      }
      save();
      closePretripModal();
      toast(id ? "已更新 ✓" : "已加項目 ✓");
      renderPretrip();
    });

    document.getElementById("pretripList").addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-pretrip-edit]");
      const delBtn = e.target.closest("[data-pretrip-del]");
      if (editBtn) {
        e.stopPropagation();
        const t = state.pretrip.find((x) => x.id === editBtn.dataset.pretripEdit);
        if (t) openPretripModal(t);
        return;
      }
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.pretripDel;
        const t = state.pretrip.find((x) => x.id === id);
        if (!t) return;
        if (confirm(`確定刪除「${t.text}」？`)) {
          state.pretrip = state.pretrip.filter((x) => x.id !== id);
          save();
          toast("已刪除");
          renderPretrip();
        }
        return;
      }
      const item = e.target.closest("[data-pretrip]");
      if (!item) return;
      const t = state.pretrip.find((x) => x.id === item.dataset.pretrip);
      if (!t) return;
      t.done = !t.done;
      save();
      renderPretrip();
    });

    document.getElementById("todoModal").addEventListener("click", (e) => {
      if (e.target.matches("[data-close-todo]") || e.target.classList.contains("modal-backdrop")) {
        closeTodoModal();
      }
    });

    document.getElementById("todoForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("todoId").value;
      const text = document.getElementById("todoText").value.trim();
      if (!text) {
        toast("請填寫待辦內容");
        return;
      }
      const entry = {
        id: id || ("t" + Date.now()),
        date: document.getElementById("todoDate").value || focusDate(),
        text: text,
        note: document.getElementById("todoNote").value.trim(),
        done: false,
      };
      if (id) {
        const i = state.todos.findIndex((x) => x.id === id);
        if (i >= 0) {
          entry.done = !!state.todos[i].done;
          if (state.todos[i].linkedSpend) entry.linkedSpend = state.todos[i].linkedSpend;
          state.todos[i] = entry;
        }
      } else {
        state.todos.push(entry);
      }
      // if date changed away from focus day, jump calendar so user sees it
      if (entry.date !== focusDate() && isInTrip(entry.date)) {
        state.selectedDate = entry.date;
      }
      save();
      closeTodoModal();
      toast(id ? "已更新待辦 ✓" : "已加待辦 ✓");
      renderCalendar();
    });

    document.getElementById("calTodoList").addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-todo-edit]");
      const delBtn = e.target.closest("[data-todo-del]");
      if (editBtn) {
        e.stopPropagation();
        const t = state.todos.find((x) => x.id === editBtn.dataset.todoEdit);
        if (t) openTodoModal(t);
        return;
      }
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.todoDel;
        const t = state.todos.find((x) => x.id === id);
        if (!t) return;
        if (confirm(`確定刪除「${t.text}」？`)) {
          state.todos = state.todos.filter((x) => x.id !== id);
          save();
          toast("已刪除待辦");
          renderCalendar();
        }
        return;
      }
      const item = e.target.closest("[data-todo]");
      if (!item) return;
      const t = state.todos.find((x) => x.id === item.dataset.todo);
      if (!t) return;
      t.done = !t.done;
      save();
      renderCalendar();
    });

    document.getElementById("calGrid").addEventListener("click", (e) => {
      const cell = e.target.closest("[data-date]");
      if (!cell) return;
      const d = cell.dataset.date;
      if (!isInTrip(d)) return;
      state.selectedDate = d;
      save();
      renderCalendar();
    });

    document.getElementById("calPrev").addEventListener("click", () => {
      const [y, m] = state.calMonth.split("-").map(Number);
      const d = new Date(y, m - 2, 1);
      state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      save();
      renderMonthGrid();
    });
    document.getElementById("calNext").addEventListener("click", () => {
      const [y, m] = state.calMonth.split("-").map(Number);
      const d = new Date(y, m, 1);
      state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      save();
      renderMonthGrid();
    });

    document.getElementById("filterDay").addEventListener("change", renderLedger);
    document.getElementById("filterCat").addEventListener("change", renderLedger);

    document.getElementById("ledgerList").addEventListener("click", (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");
      if (edit) {
        const exp = state.expenses.find((x) => x.id === edit.dataset.edit);
        if (exp) openExpenseModal(exp);
      }
      if (del) {
        if (confirm("確定刪呢筆記錄？")) {
          state.expenses = state.expenses.filter((x) => x.id !== del.dataset.del);
          save();
          toast("已刪除");
          renderLedger();
          renderHeader();
        }
      }
    });

    const fxSel = document.getElementById("setFxCurrency");
    if (fxSel) {
      fxSel.addEventListener("change", () => {
        const code = fxSel.value;
        const opt = fxOption(code);
        const rateEl = document.getElementById("setRate");
        if (opt.none) {
          if (rateEl) rateEl.value = "0";
          updateFxMeta();
          return;
        }
        if (yahooFxCache && yahooFxCache.rates && yahooFxCache.rates[code] != null) {
          applyFxRateToForm(code, yahooFxCache.rates[code], yahooFxCache);
          return;
        }
        // keep current rate unless empty
        if (rateEl && (!rateEl.value || Number(rateEl.value) === 0)) {
          // leave for user / fetch
        }
      });
    }

    const btnFx = document.getElementById("btnFetchYahoo");
    if (btnFx) {
      btnFx.addEventListener("click", async () => {
        const code = (document.getElementById("setFxCurrency").value || "JPY").toUpperCase();
        if (code === "HKD") {
          toast("而家揀咗唔用外幣");
          return;
        }
        btnFx.disabled = true;
        const prev = btnFx.textContent;
        btnFx.textContent = "更新中…";
        try {
          const snap = await fetchYahooRates(code);
          const rate = snap.rates[code];
          if (rate == null || !Number.isFinite(rate)) {
            throw new Error("未有 " + code + " 牌價");
          }
          applyFxRateToForm(code, rate, snap);
          state.trip.fxCurrency = code;
          state.trip.fxRate = rate;
          state.trip.jpyToHkd = rate;
          state.trip.fxSourceDate = snap.rateDate || "";
          state.trip.fxSourceUpdatedAt = snap.updatedAt || "";
          state.trip.fxFetchedAt = snap.fetchedAt || new Date().toISOString();
          state.trip.fxSource = snap.source || "yahoo";
          save();
          renderAll();
          const via = snap.source === "local" ? "本機後備" : "Yahoo";
          toast(
            "已更新 " +
              code +
              " 牌價" +
              (snap.rateDate ? "（" + snap.rateDate + "）" : "") +
              " · " +
              via +
              " ✓"
          );
        } catch (err) {
          console.error(err);
          toast((err && err.message) || "更新 Yahoo 牌價失敗");
        } finally {
          btnFx.disabled = false;
          btnFx.textContent = prev;
        }
      });
    }

    document.getElementById("settingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      state.trip.title = document.getElementById("setTitle").value.trim();
      state.trip.start = document.getElementById("setStart").value;
      state.trip.end = document.getElementById("setEnd").value;
      state.trip.budget = Number(document.getElementById("setBudget").value) || 0;
      const fxCode = (document.getElementById("setFxCurrency").value || "HKD").toUpperCase();
      let fxRate = Number(document.getElementById("setRate").value) || 0;
      if (fxCode === "HKD") fxRate = 0;
      state.trip.fxCurrency = fxCode;
      state.trip.fxRate = fxRate;
      state.trip.jpyToHkd = fxRate;
      state.trip.travelMode = normalizeTravelMode(
        document.getElementById("setTravelMode").value,
        false
      );
      const comps = document
        .getElementById("setCompanions")
        .value.split(/[,、，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      state.trip.companions = comps.filter((v, i, a) => a.indexOf(v) === i);
      if (state.selectedDate < state.trip.start || state.selectedDate > state.trip.end) {
        state.selectedDate = state.trip.start;
      }
      save();
      toast("設定已儲存 ✓");
      renderAll();
    });

    document.getElementById("btnResetDemo").addEventListener("click", () => {
      if (!confirm("重設示範資料？所有旅程都會清走，只留返示範嗰個。")) return;
      store = wrapSingleAsStore(seedData());
      activateTrip(store.activeTripId, { flush: false, persist: false });
      save();
      toast("已重設旅程 🎒");
      switchTab("calendar");
      renderAll();
      fillSettings();
    });

    document.getElementById("btnEditDayItinerary").addEventListener("click", () => {
      openItineraryModal(focusDate());
    });

    document.getElementById("itineraryModal").addEventListener("click", (e) => {
      if (e.target.matches("[data-close-itinerary]") || e.target.classList.contains("modal-backdrop")) {
        closeItineraryModal();
      }
    });

    document.getElementById("btnToggleMaps").addEventListener("click", () => {
      const d = focusDate();
      const turnOn = !dayAnyMapVisible(d);
      setAllMapsForDay(d, turnOn);
      syncMapsToggleBtn();
      renderCalendar();
      toast(turnOn ? "今日地圖已全部顯示 🗺" : "今日地圖已全部隱藏");
    });

    document.getElementById("btnAddStop").addEventListener("click", () => {
      openItineraryModal(focusDate(), { addStop: true });
    });

    document.getElementById("btnItinAddStop").addEventListener("click", () => {
      const stops = readItinStopsFromForm();
      stops.push(emptyStop());
      renderItinStopFields(stops);
      const places = document.querySelectorAll('#itinStops [data-f="place"]');
      const last = places[places.length - 1];
      if (last) last.focus();
    });

    document.getElementById("itinStops").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-stop]");
      if (!btn) return;
      const stops = readItinStopsFromForm().filter((s) => s.id !== btn.getAttribute("data-remove-stop"));
      renderItinStopFields(stops.length ? stops : [emptyStop()]);
    });

    document.getElementById("dayStopsList").addEventListener("click", (e) => {
      const routeBtn = e.target.closest("[data-toggle-day-route]");
      if (routeBtn) {
        const d = routeBtn.getAttribute("data-toggle-day-route") || focusDate();
        const day = normalizeDayItinerary((state.itinerary && state.itinerary[d]) || null);
        setDayRouteMap(d, day.showDayRouteMap === false);
        renderCalendar();
        return;
      }
      const mapBtn = e.target.closest("[data-toggle-stop-map]");
      if (mapBtn) {
        const id = mapBtn.getAttribute("data-toggle-stop-map");
        const d = focusDate();
        const stop = dayStops(d).find((s) => s.id === id);
        setStopShowMap(d, id, !(stop && stopShowsMap(stop)));
        renderCalendar();
        return;
      }
      if (e.target.closest("[data-stop-edit]")) {
        openItineraryModal(focusDate());
      }
    });

    document.getElementById("itineraryForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const d = document.getElementById("itinDate").value;
      if (!d || !isInTrip(d)) {
        toast("日期唔啱");
        return;
      }
      if (!state.cities) state.cities = {};
      if (!state.dayTitles) state.dayTitles = {};
      if (!state.itinerary) state.itinerary = {};

      const city = document.getElementById("itinCity").value.trim();
      const title = document.getElementById("itinTitle").value.trim();
      const stops = readItinStopsFromForm();

      if (!city || !title) {
        toast("請填城市同當日標題");
        return;
      }
      if (stops.some((s) => !s.place)) {
        toast("每個地點都要有名稱");
        return;
      }

      state.cities[d] = city;
      state.dayTitles[d] = title;
      if (stops.length) {
        const prev = normalizeDayItinerary(state.itinerary[d] || null);
        state.itinerary[d] = {
          stops: sortStopsByTime(stops),
          showDayRouteMap: prev.showDayRouteMap !== false,
        };
      } else {
        delete state.itinerary[d];
      }

      if (d !== focusDate() && isInTrip(d)) {
        state.selectedDate = d;
      }
      save();
      closeItineraryModal();
      toast("已更新行程 ✓");
      renderCalendar();
    });

    document.getElementById("calNextDays").addEventListener("click", (e) => {
      if (e.target.closest("[data-itin-map]")) {
        e.stopPropagation();
        return;
      }
      const editBtn = e.target.closest("[data-itin-edit]");
      if (editBtn) {
        e.stopPropagation();
        openItineraryModal(editBtn.dataset.itinEdit);
        return;
      }
      const card = e.target.closest("[data-itin-date]");
      if (card) {
        const d = card.dataset.itinDate;
        if (isInTrip(d)) {
          state.selectedDate = d;
          save();
          renderCalendar();
        }
      }
    });

    document.getElementById("btnSyncSave").addEventListener("click", () => {
      const form = readSyncForm();
      const prev = loadSyncMeta();
      const meta = mergeSyncForm(prev, form);
      saveSyncMeta(meta);
      updateSyncStatus();
      toast("同步設定已儲存 ✓");
    });

    document.getElementById("btnSyncPush").addEventListener("click", () => {
      const form = readSyncForm();
      const prev = loadSyncMeta();
      // persist current form values before push so token/gistId stick
      saveSyncMeta(mergeSyncForm(prev, form));
      pushToCloud({ silent: false });
    });

    document.getElementById("btnSyncPull").addEventListener("click", () => {
      const form = readSyncForm();
      const prev = loadSyncMeta();
      saveSyncMeta(mergeSyncForm(prev, form));
      pullFromCloud();
    });

    document.getElementById("btnSyncClearToken").addEventListener("click", () => {
      if (!confirm("清除呢部機儲存嘅 GitHub Token？")) return;
      const meta = loadSyncMeta();
      meta.token = "";
      saveSyncMeta(meta);
      const tokenEl = document.getElementById("syncToken");
      if (tokenEl) tokenEl.value = "";
      updateSyncStatus();
      toast("已清除 Token");
    });

    document.getElementById("btnExportJson").addEventListener("click", exportJournalJson);

    document.getElementById("importJsonFile").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      importJournalJsonFile(file);
      e.target.value = "";
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal();
        closeTodoModal();
        closePretripModal();
        closeItineraryModal();
        closeTripModal();
      }
    });

    const btnNewTrip = document.getElementById("btnNewTrip");
    if (btnNewTrip) btnNewTrip.addEventListener("click", () => openTripModal());

    const tripModal = document.getElementById("tripModal");
    if (tripModal) {
      tripModal.addEventListener("click", (e) => {
        if (e.target.matches("[data-close-trip]") || e.target.classList.contains("modal-backdrop")) {
          closeTripModal();
        }
      });
    }

    const tripForm = document.getElementById("tripForm");
    if (tripForm) {
      tripForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const title = document.getElementById("newTripTitle").value.trim();
        const start = document.getElementById("newTripStart").value;
        const end = document.getElementById("newTripEnd").value;
        if (!title || !start || !end) {
          toast("請填齊名稱同日期");
          return;
        }
        if (parseDate(start) > parseDate(end)) {
          toast("回程日唔可以早過出發日");
          return;
        }
        const comps = document
          .getElementById("newTripCompanions")
          .value.split(/[,、，]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const budget = Number(document.getElementById("newTripBudget").value) || 0;
        flushActiveToStore();
        const neu = createEmptyTrip({ title, start, end, companions: comps, budget });
        store.trips.push(neu);
        activateTrip(neu.id, { flush: false, persist: true });
        closeTripModal();
        toast("已建立旅程 ✓");
        renderAll();
        fillSettings();
        switchTab("calendar");
      });
    }

    const tripsList = document.getElementById("tripsList");
    if (tripsList) {
      tripsList.addEventListener("click", (e) => {
        const openBtn = e.target.closest("[data-open-trip]");
        const delBtn = e.target.closest("[data-del-trip]");
        if (openBtn) {
          switchToTrip(openBtn.getAttribute("data-open-trip"));
        } else if (delBtn) {
          deleteTrip(delBtn.getAttribute("data-del-trip"));
        }
      });
    }
  }

  function renderAll() {
    renderHeader();
    renderCalendar();
    if (document.getElementById("view-trips") && document.getElementById("view-trips").classList.contains("active")) {
      renderTrips();
    }
    // keep ledger/charts fresh if visible
    if (document.getElementById("view-ledger").classList.contains("active")) renderLedger();
    if (document.getElementById("view-charts").classList.contains("active")) renderCharts();
  }

  // boot
  bind();
  save(); // persist seed on first visit
  renderAll();
  autoPullOnOpen();
})();
