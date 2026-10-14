(function () {
  const token = localStorage.getItem("VulcanTrader_token");
  if (!token) {
    location.href = "/login";
    return;
  }

  const S = {
    view: "trading",
    version: "",
    configs: [],
    strategies: [],
    examples: [],
    showNonBots: true,
    bot: "",
    dash: null,
    candles: null,
    marks: [],
    ind: "",
    cache: {},
    cacheWl: {},
    whitelist: [],
    badPairs: {},
    userBot: false,
    tfUser: false,
    chartPair: "",
    tf: "1h",
    pane: "chart",
    side: "bots",
    jobs: [],
    results: [],
    exchanges: [],
    coverage: null,
    exchange: "",
    error: "",
    jobLog: "",
    resultHtml: "",
  };

  const $ = (id) => document.getElementById(id);
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => {
      if (c === "&") return "&" + "amp;";
      if (c === "<") return "&" + "lt;";
      if (c === ">") return "&" + "gt;";
      if (c === '"') return "&" + "quot;";
      return "&" + "#39;";
    });
  }
  function money(n) {
    const v = Number(n) || 0;
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return sign + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function pct(n) {
    const v = Number(n) || 0;
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return sign + Math.abs(v).toFixed(2) + "%";
  }
  function cls(n) { return Number(n) > 0 ? "pos" : Number(n) < 0 ? "neg" : ""; }
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = "none"; }, 3200);
  }
  async function api(url, opts) {
    const extra = opts || {};
    const res = await fetch(url, {
      method: extra.method,
      body: extra.body,
      signal: extra.signal,
      priority: extra.priority || "auto",
      headers: { Authorization: "Bearer " + token, ...(extra.headers || {}) },
    });
    if (res.status === 401) {
      localStorage.removeItem("VulcanTrader_token");
      location.href = "/login";
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      let detail = "";
      try { detail = ((await res.json()) || {}).detail || ""; } catch (e) { /* ignore */ }
      throw new Error(detail ? detail + " (HTTP " + res.status + ")" : "HTTP " + res.status);
    }
    return res.json();
  }
  function paint(id, html) {
    const el = $(id);
    if (!el || el.dataset.html === html) return;
    if (el.contains(document.activeElement)) return;
    el.dataset.html = html;
    el.innerHTML = html;
  }

  function viewFromHash() {
    const h = (location.hash || "#trading").slice(1);
    S.view = ["trading", "backtester", "data"].includes(h) ? h : "trading";
  }
  function nav() {
    const items = [["trading", "Trading"], ["backtester", "Backtester"], ["data", "Data"]];
    const html = items.map(([id, label]) => `<a href="#${id}" class="${S.view === id ? "on" : ""}">${label}</a>`).join("");
    $("nav").innerHTML = html;
    $("dock").innerHTML = html;
  }
  function closedTrades() { return ((S.dash && S.dash.closed_trades) || []).filter((t) => !t.is_open); }
  function openTrades() { return (S.dash && S.dash.open_trades) || []; }
  function profitAbs(t) { return Number(t.close_profit_abs != null ? t.close_profit_abs : t.profit_abs) || 0; }
  function profitPct(t) { return (Number(t.close_profit != null ? t.close_profit : t.profit_ratio) || 0) * 100; }

  function shell() {
    $("app").innerHTML = `
      <section id="view-trading">
        <div class="grid-4" id="pulses"></div>
        <div id="session"></div>
        <div class="seg row phone-only" id="pane"></div>
        <div class="split">
          <section class="card pane-fleet">
            <h2>Fleet <button type="button" class="btn" data-act="new-bot">New</button></h2>
            <div class="seg row" id="side"></div>
            <div id="fleet"></div>
          </section>
          <div>
            <section class="card pane-chart">
              <h2>Pair chart <span class="mute" id="chart-note"></span></h2>
              <div class="row">
                <label class="stack" style="flex:1">Pair<select id="pair" class="field"></select></label>
                <label class="stack">TF<select id="tf" class="field"><option>5m</option><option>15m</option><option selected>1h</option><option>4h</option></select></label>
                <label class="stack">Indicator<select id="ind" class="field"><option value="">None</option></select></label>
              </div>
              <div id="chart"></div>
              <svg id="equity" viewBox="0 0 280 78" class="equity" hidden></svg>
              <p id="equity-note" class="mute"></p>
              <p id="whitelist" class="mute"></p>
            </section>
            <section class="card pane-book" id="book"></section>
          </div>
        </div>
      </section>
      <section id="view-backtester" hidden>
        <section class="card">
          <h2>Run backtest <a href="/backtester">Full backtester</a></h2>
          <form id="bt-form" class="grid-2">
            <label class="stack">Config<select name="config" class="field" id="bt-config"></select></label>
            <label class="stack">Strategy<select name="strategy" class="field" id="bt-strategy"></select></label>
            <label class="stack">Timerange<input name="timerange" class="field" placeholder="20250101-"></label>
            <label class="stack">Engine<select name="engine" class="field"><option value="python">python</option><option value="rust">rust</option></select></label>
            <button class="btn" type="submit">Run</button>
          </form>
          <p class="mute">Rust needs the indicator binary from build-rust-indicators. Python always works.</p>
        </section>
        <section class="card"><h2>Jobs</h2><div id="jobs"></div><pre id="job-log" class="log"></pre></section>
        <section class="card"><h2>Saved results</h2><div id="results"></div><div id="result-detail"></div></section>
      </section>
      <section id="view-data" hidden>
        <section class="card">
          <h2>Download <a href="/datamanager">Full data manager</a></h2>
          <form id="dl-form" class="grid-2">
            <label class="stack">Config<select name="config" class="field" id="dl-config"></select></label>
            <label class="stack">Exchange<select name="exchange" class="field" id="dl-exchange"></select></label>
            <label class="stack">Pairs<input name="pairs" class="field" placeholder="BTC/USDT,ETH/USDT"></label>
            <label class="stack">Timeframes<input name="timeframes" class="field" value="5m,15m,1h"></label>
            <label class="stack">Days<input name="days" class="field" value="30" inputmode="numeric"></label>
            <button class="btn" type="submit">Download</button>
          </form>
        </section>
        <section class="card">
          <h2>Coverage</h2>
          <label class="stack">Exchange<select id="cov-exchange" class="field"></select></label>
          <div id="coverage"></div>
        </section>
      </section>`;
    $("pair").addEventListener("change", () => { S.chartPair = $("pair").value; S.candles = null; loadCandles(); });
    $("tf").addEventListener("change", () => { S.tfUser = true; S.tf = $("tf").value; S.badPairs = {}; S.candles = null; loadCandles().then(renderTrading); });
    $("ind").addEventListener("change", () => {
      S.ind = $("ind").value;
      if (S.ind) {
        S.candles = null;
        loadCandles().then(() => { if (S.view === "trading") renderTrading(); });
      } else drawCandles();
    });
    $("bt-form").addEventListener("submit", onBacktest);
    $("dl-form").addEventListener("submit", onDownload);
    $("cov-exchange").addEventListener("change", () => { S.exchange = $("cov-exchange").value; S.coverage = null; loadCoverage().then(renderData); });
  }

  function showView() {
    ["trading", "backtester", "data"].forEach((id) => { $("view-" + id).hidden = S.view !== id; });
    $("banner").textContent = S.view === "trading"
      ? "Live desk. Select a bot before force-exit. LIVE start asks for confirmation. Classic UI stays at /trading-classic."
      : S.view === "backtester"
        ? "Queue a real backtest. Open a job for its log, or a saved result for MAE/MFE."
        : "Coverage reads feather files on this machine. Downloads run as background jobs.";
    nav();
  }

  function curve(closed) {
    const rows = closed.slice().sort((a, b) => String(a.close_date || "").localeCompare(String(b.close_date || "")));
    let eq = 0, peak = 0, maxDd = 0;
    const pts = rows.map((t) => {
      eq += profitAbs(t);
      peak = Math.max(peak, eq);
      maxDd = Math.max(maxDd, peak - eq);
      return eq;
    });
    return { pts, maxDd, pnl: eq };
  }
  function excursion(t) {
    const open = Number(t.open_rate) || 0;
    const minR = Number(t.min_rate) || 0;
    const maxR = Number(t.max_rate) || 0;
    if (!(open > 0 && minR > 0 && maxR > minR)) return null;
    const mae = t.is_short ? Math.max(0, ((maxR - open) / open) * 100) : Math.max(0, ((open - minR) / open) * 100);
    const mfe = t.is_short ? Math.max(0, ((open - minR) / open) * 100) : Math.max(0, ((maxR - open) / open) * 100);
    const clip = (n) => Math.max(0, Math.min(100, n));
    const entry = t.is_short ? ((open - minR) / (maxR - minR)) * 100 : ((maxR - open) / (maxR - minR)) * 100;
    let exit = null;
    if (!t.is_open && Number(t.close_rate)) {
      const close = Number(t.close_rate);
      exit = t.is_short ? ((maxR - close) / (maxR - minR)) * 100 : ((close - minR) / (maxR - minR)) * 100;
    }
    return { mae, mfe, entry: clip(entry), exit: exit == null ? null : clip(exit) };
  }
  function bar(n) {
    return `<span class="qbar"><i style="width:${Math.max(0, Math.min(100, Number(n) || 0)).toFixed(0)}%"></i></span>`;
  }

  function renderTrading() {
    const open = openTrades();
    const closed = closedTrades();
    const unreal = open.reduce((s, t) => s + profitAbs(t), 0);
    const { maxDd, pnl } = curve(closed);
    const running = S.configs.filter((c) => c.running).length;
    const crashed = S.configs.filter((c) => c.crashed).length;
    const live = S.configs.filter((c) => c.running && !c.dry_run).length;
    paint("pulses", [
      ["Running", String(running), live ? live + " live" : "paper only", live ? "neg" : "pos"],
      ["Attention", String(crashed), "crashed", crashed ? "neu" : ""],
      ["Unrealized", money(unreal), open.length + " open", cls(unreal)],
      ["Closed PnL", money(pnl), "DD " + money(-maxDd), cls(pnl)],
    ].map(([l, v, h, c]) => `<div class="pulse"><span>${l}</span><b class="${c}">${esc(v)}</b><span>${esc(h)}</span></div>`).join(""));

    const sides = [["bots", "Bots"], ["metrics", "Metrics"], ["periods", "Periods"], ["pairs", "Pairs"], ["log", "Log"]];
    paint("side", sides.map(([id, label]) => `<button type="button" data-act="side" data-id="${id}" class="${S.side === id ? "on" : ""}">${label}</button>`).join(""));
    paint("pane", ["fleet", "chart", "book"].map((id) => `<button type="button" data-act="pane" data-id="${id}" class="${S.pane === id ? "on" : ""}">${id[0].toUpperCase() + id.slice(1)}</button>`).join(""));
    document.body.dataset.pane = S.pane;
    paint("session", sessionHtml());

    if (S.side === "bots") paint("fleet", botList());
    else if (S.side === "metrics") paint("fleet", metricsHtml(closed, pnl, maxDd));
    else if (S.side === "periods") paint("fleet", periodHtml(closed));
    else if (S.side === "pairs") paint("fleet", pairHtml(closed));
    else paint("fleet", logHtml());
    markFleet();

    const pairs = pairChoices();
    if (!S.chartPair || !pairs.includes(S.chartPair)) S.chartPair = pairs[0] || "";
    const pairEl = $("pair");
    if (pairEl && !pairEl.contains(document.activeElement)) {
      const html = pairs.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
      if (pairEl.dataset.html !== html) { pairEl.dataset.html = html; pairEl.innerHTML = html; }
      pairEl.value = S.chartPair;
    }
    const tfEl = $("tf");
    if (tfEl && !tfEl.contains(document.activeElement)) tfEl.value = S.tf;
    const note = $("chart-note");
    if (note) {
      const skipped = Object.keys(S.badPairs).filter((k) => k.endsWith("|" + S.tf)).map((k) => k.slice(0, -(S.tf.length + 1)));
      const base = S.error || (S.candles ? (S.candles.timeframe || S.tf) + " · " + ((S.candles.candles || []).length) + " bars" : "loading");
      note.textContent = skipped.length ? base + " · no data: " + skipped.slice(0, 4).join(", ") : base;
    }
    drawEquity(closed);
    const fresh = (S.dash && S.dash.status && S.dash.status.never_started) || S.dashError;
    const hint = fresh ? `<p class="mute">${esc(S.dashError || "Chưa chạy lần nào. Chọn strategy, rồi bấm Start. Chưa có lệnh.")}</p>` : "";
    paint("book", hint + bookHtml(open, closed));
  }

  function ictDate(raw) {
    const d = raw ? new Date(raw) : new Date();
    if (Number.isNaN(d.getTime())) return String(raw || "").slice(0, 10);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function heldFor(t) {
    const open = t.open_date ? new Date(t.open_date) : null;
    if (!open || Number.isNaN(open.getTime())) return "";
    const end = t.close_date ? new Date(t.close_date) : new Date();
    const min = Math.max(0, (end - open) / 60000);
    if (min < 60) return Math.round(min) + "m";
    const h = Math.floor(min / 60);
    if (h < 48) return h + "h " + Math.round(min % 60) + "m";
    return Math.floor(h / 24) + "d " + (h % 24) + "h";
  }
  function sessionHtml() {
    const st = (S.dash && S.dash.status) || {};
    const cfg = S.configs.find((c) => c.account_name === S.bot);
    const today = ictDate();
    const dayClosed = closedTrades().filter((t) => ictDate(t.close_date) === today);
    const dayPnl = dayClosed.reduce((s, t) => s + profitAbs(t), 0);
    const unreal = openTrades().reduce((s, t) => s + profitAbs(t), 0);
    const name = cfg ? cfg.name : (st.bot_name || "Fleet");
    const live = st.dry_run === false || (cfg && cfg.dry_run === false);
    const state = st.state || (cfg && cfg.running ? "RUNNING" : "STOPPED");
    const up = Math.max(0, Math.floor(Number(st.uptime_secs) || 0));
    const upText = up ? (Math.floor(up / 3600) ? Math.floor(up / 3600) + "h " + Math.floor((up % 3600) / 60) + "m" : Math.floor(up / 60) + "m") : "";
    const sig = (v) => v == null || v === "" ? "—" : String(v);
    const signals = Array.isArray(st.signals) ? st.signals : [];
    const chips = signals.map((s) => {
      const side = s.side === "short" ? "neg" : "pos";
      return `<button type="button" class="sig ${side}" data-act="pick-pair" data-id="${esc(s.pair)}" title="${esc(s.pair)}">${esc(pairLabel(s.pair))}</button>`;
    }).join("");
    return `<div class="session">
      <div><b>${esc(name)}</b><div class="mute">${esc(state)}${upText ? " · " + upText : ""} · ${esc(st.strategy || (cfg && cfg.strategy) || "no strategy")}</div></div>
      <div class="${live ? "neg" : "mute"}">${live ? "LIVE" : "Paper"}</div>
      <div><span class="mute">Hôm nay</span><div class="${cls(dayPnl)}"><b>${money(dayPnl)}</b></div><div class="mute">${dayClosed.length} đóng</div></div>
      <div><span class="mute">Đang mở</span><div class="${cls(unreal)}"><b>${money(unreal)}</b></div><div class="mute">${openTrades().length} lệnh</div></div>
      <div class="session-book">
        <span>Tín hiệu <b>${sig(st.entry_pairs)}</b></span>
        <span class="pos">Long <b>${sig(st.entry_long)}</b></span>
        <span class="neg">Short <b>${sig(st.entry_short)}</b></span>
      </div>
      ${chips ? `<div class="session-signals">${chips}</div>` : ""}
    </div>`;
  }
  function markFleet() {
    const root = $("fleet");
    if (!root) return;
    root.querySelectorAll("article.bot").forEach((el) => {
      el.classList.toggle("on", el.dataset.account === S.bot);
    });
  }
  function ensureChart() {
    if (S.pane !== "chart") return;
    const pairs = pairChoices();
    const pairOk = S.chartPair && (!pairs.length || pairs.includes(S.chartPair));
    if (S.candles && pairOk) {
      S.marks = [...openTrades(), ...closedTrades()].filter((t) => t.pair === S.chartPair);
      drawCandles();
      return;
    }
    if (pairs.length && !pairs.includes(S.chartPair)) S.chartPair = pairs[0];
    S.candles = null;
    loadCandles().then(() => { if (S.view === "trading") renderTrading(); });
  }
  function botList() {
    const head = `<label class="row"><input type="checkbox" data-act="nonbots" ${S.showNonBots ? "checked" : ""}> Show non-bots</label>`;
    const list = S.showNonBots ? S.configs : S.configs.filter((c) => c.is_bot !== false);
    if (!list.length) return head + `<p class="mute">No configs in user_data/configs.</p>`;
    return head + list.map((c) => {
      const tone = c.crashed ? "neg" : c.running ? "pos" : "";
      const status = c.crashed ? "crashed" : c.running ? "running" : "stopped";
      const opts = S.strategies.map((s) => `<option value="${esc(s.name)}" ${s.name === c.strategy ? "selected" : ""}>${esc(s.name)}</option>`).join("");
      return `<article class="bot" data-account="${esc(c.account_name)}">
        <button type="button" class="row" data-act="view-bot" data-id="${esc(c.account_name)}" style="width:100%;background:none;border:0;padding:0;text-align:left">
          <b>${esc(c.name)}</b><span class="pill ${tone}">${status}</span>
        </button>
        <div class="mute">${c.is_bot === false ? "Not a bot · " : ""}${c.dry_run ? "Paper" : "LIVE"} · ${esc(c.exchange || "—")}</div>
        <label class="stack">Strategy<select class="field" data-act="strategy" data-id="${esc(c.name)}"><option value="">—</option>${opts}</select></label>
        <label class="row"><input type="checkbox" data-act="autostart" data-id="${esc(c.name)}" ${c.auto_start ? "checked" : ""}> Auto-start</label>
        <div class="row">
          <button class="btn icon" data-act="start" data-id="${esc(c.name)}" data-live="${c.dry_run ? "0" : "1"}" ${c.running || !c.strategy ? "disabled" : ""}>Start</button>
          <button class="btn icon" data-act="stop" data-id="${esc(c.name)}" ${c.running ? "" : "disabled"}>Stop</button>
          <button class="btn icon" data-act="edit" data-id="${esc(c.name)}">Edit</button>
          <button class="btn icon" data-act="dup" data-id="${esc(c.name)}">Copy</button>
          <button class="btn icon" data-act="rename" data-id="${esc(c.name)}" ${c.running ? "disabled" : ""}>Rename</button>
          <button class="btn icon" data-act="delete" data-id="${esc(c.name)}" ${c.running ? "disabled" : ""}>Delete</button>
        </div>
      </article>`;
    }).join("");
  }

  function metricsHtml(closed, pnl, maxDd) {
    const wins = closed.filter((t) => profitAbs(t) > 0);
    const losses = closed.filter((t) => profitAbs(t) < 0);
    const gp = wins.reduce((s, t) => s + profitAbs(t), 0);
    const gl = Math.abs(losses.reduce((s, t) => s + profitAbs(t), 0));
    const pf = gl ? gp / gl : gp ? Infinity : 0;
    const wr = closed.length ? (wins.length / closed.length) * 100 : 0;
    const cells = [
      ["Win rate", pct(wr)], ["Trades", String(closed.length)], ["PnL", money(pnl)],
      ["Profit factor", Number.isFinite(pf) ? pf.toFixed(2) : "∞"],
      ["Max DD", money(-maxDd)], ["Avg trade", money(closed.length ? pnl / closed.length : 0)],
      ["Wins", String(wins.length)], ["Losses", String(losses.length)],
    ];
    return `<div class="grid-2">${cells.map(([k, v]) => `<div class="pulse"><span>${k}</span><b class="${cls(String(v).includes("−") ? -1 : 1)}">${esc(v)}</b></div>`).join("")}</div>`;
  }
  function periodHtml(closed) {
    const months = new Map();
    const days = new Map();
    closed.forEach((t) => {
      const month = String(t.close_date || "").slice(0, 7) || "—";
      const day = ictDate(t.close_date) || "—";
      const add = (map, key) => {
        const row = map.get(key) || { n: 0, pnl: 0, wins: 0 };
        row.n += 1; row.pnl += profitAbs(t); if (profitAbs(t) > 0) row.wins += 1;
        map.set(key, row);
      };
      add(months, month);
      add(days, day);
    });
    const block = (title, rows) => `<h3>${title}</h3>` + (rows.length ? rows.map(([key, row]) => `<div class="bot"><b>${esc(key)}</b><div class="mute">${row.n} trades · win ${row.n ? Math.round((row.wins / row.n) * 100) : 0}%</div><div class="${cls(row.pnl)}">${money(row.pnl)}</div></div>`).join("") : `<p class="mute">No closed trades yet.</p>`);
    const dayRows = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
    const monthRows = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
    return block("7 ngày (ICT)", dayRows) + block("Tháng", monthRows);
  }
  function pairHtml(closed) {
    const buckets = new Map();
    closed.forEach((t) => {
      const row = buckets.get(t.pair) || { n: 0, pnl: 0, gp: 0, gl: 0 };
      const p = profitAbs(t);
      row.n += 1; row.pnl += p; if (p > 0) row.gp += p; else row.gl += Math.abs(p);
      buckets.set(t.pair, row);
    });
    const rows = [...buckets.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
    if (!rows.length) return `<p class="mute">No closed trades yet.</p>`;
    const line = (title, list) => `<h3>${title}</h3>` + list.map(([pair, row]) => {
      const pf = row.gl ? row.gp / row.gl : row.gp ? Infinity : 0;
      return `<button type="button" class="bot" data-act="pick-pair" data-id="${esc(pair)}" style="width:100%;text-align:left"><b>${esc(pair)}</b> <span class="${cls(row.pnl)}">${money(row.pnl)}</span><div class="mute">${row.n} trades · PF ${Number.isFinite(pf) ? pf.toFixed(2) : "∞"}</div></button>`;
    }).join("");
    return line("Best", rows.slice(0, 8)) + line("Worst", rows.slice().reverse().slice(0, 8));
  }
  function pairLabel(pair) {
    const text = String(pair || "");
    const slash = text.indexOf("/");
    if (slash < 0) return text;
    return text.slice(0, slash) + "/" + text.slice(slash + 1).split(":")[0];
  }
  function pairChoices() {
    const signals = ((S.dash && S.dash.status && S.dash.status.signals) || []).map((s) => s.pair);
    const ranked = [...new Set([
      S.chartPair,
      ...signals,
      ...openTrades().map((t) => t.pair),
      ...(S.whitelist || []),
      ...closedTrades().map((t) => t.pair),
    ].filter(Boolean))];
    const good = ranked.filter((p) => p === S.chartPair || !S.badPairs[p + "|" + S.tf]);
    return good.length ? good : ranked;
  }
  function logText(line) {
    return typeof line === "string" ? line : (line.line || line.message || line.msg || "");
  }
  function logHtml() {
    const messages = (S.dash && S.dash.messages) || [];
    const logs = (S.dash && S.dash.logs) || [];
    const lines = logs.length ? logs : messages;
    if (!lines.length) return `<p class="mute">No log lines yet.</p>`;
    const seen = new Set();
    const important = [];
    lines.forEach((line) => {
      const text = logText(line);
      if (/BadSymbol|Empty candle|ERROR/.test(text) && !seen.has(text)) {
        seen.add(text);
        important.push(line);
      }
    });
    const recent = lines.slice(-24).filter((line) => !important.includes(line));
    return `<div class="log">${[...important.slice(-6), ...recent].slice(-32).reverse().map((line) => {
      const text = logText(line);
      const tone = /BadSymbol|ERROR/.test(text) ? "neg" : /WARNING|Empty candle|No history/.test(text) ? "neu" : "";
      return `<p class="${tone}">${esc(text)}</p>`;
    }).join("")}</div>`;
  }
  function bookHtml(open, closed) {
    const row = (t, isOpen) => {
      const x = excursion(t);
      const exit = isOpen
        ? `<button type="button" class="btn" data-act="force" data-pair="${esc(t.pair)}">Force exit</button>`
        : esc(t.exit_reason || "");
      const meta = [heldFor(t), t.enter_tag, t.stake_amount ? "$" + Number(t.stake_amount).toLocaleString("en-US", { maximumFractionDigits: 0 }) : ""].filter(Boolean).join(" · ");
      return `<article class="bot">
        <button type="button" data-act="pick-pair" data-id="${esc(t.pair)}" style="background:none;border:0;padding:0;color:inherit;text-align:left">
          <b>${esc(t.pair)}</b> <span class="${t.is_short ? "neg" : "pos"}">${t.is_short ? "SHORT" : "LONG"}</span>
        </button>
        <div class="${cls(profitAbs(t))}">${money(profitAbs(t))} · ${pct(profitPct(t))}</div>
        ${meta ? `<div class="mute">${esc(meta)}</div>` : ""}
        ${x ? `<div class="mute">MAE ${x.mae.toFixed(2)}% · MFE ${x.mfe.toFixed(2)}%</div><div class="mute">Entry</div>${bar(x.entry)}${x.exit == null ? "" : `<div class="mute">Exit</div>${bar(x.exit)}`}` : ""}
        <div class="row">${exit}<button type="button" class="btn" data-act="trade" data-pair="${esc(t.pair)}" data-open="${esc(t.open_date || "")}">Detail</button></div>
      </article>`;
    };
    const openSorted = [...open].sort((a, b) => profitAbs(a) - profitAbs(b));
    const closedSorted = [...closed].sort((a, b) => String(b.close_date || "").localeCompare(String(a.close_date || "")));
    return `<h2>Open (${open.length})</h2>${openSorted.length ? openSorted.slice(0, 40).map((t) => row(t, true)).join("") : `<p class="mute">No open trades.</p>`}
      <h2>Closed (${closed.length})</h2>${closedSorted.length ? closedSorted.slice(0, 40).map((t) => row(t, false)).join("") : `<p class="mute">No closed trades.</p>`}`;
  }
  function drawEquity(closed) {
    const svg = $("equity");
    const note = $("equity-note");
    if (!svg || !note) return;
    const { pts, maxDd } = curve(closed);
    if (pts.length < 2) { svg.hidden = true; note.textContent = ""; return; }
    const min = Math.min(0, ...pts);
    const max = Math.max(0, ...pts);
    const span = max - min || 1;
    const points = pts.map((v, i) => ((i / (pts.length - 1)) * 280).toFixed(1) + "," + (70 - ((v - min) / span) * 64).toFixed(1)).join(" ");
    svg.hidden = false;
    svg.innerHTML = `<polyline fill="none" stroke="#8b7cf6" stroke-width="2" points="${points}"/>`;
    note.textContent = "Closed equity · max DD " + money(-maxDd);
  }

  let chart, series, indSeries;
  function candleTime(raw) {
    const ms = typeof raw === "number" ? (raw > 1e12 ? raw : raw * 1000) : Date.parse(raw);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  function drawCandles() {
    const rows = (S.candles && S.candles.candles) || [];
    const el = $("chart");
    if (!el || !window.LightweightCharts) return;
    const data = rows.map((c) => {
      const time = candleTime(c.date || c.time || c[0]);
      if (time == null) return null;
      return { time, open: Number(c.open ?? c[1]), high: Number(c.high ?? c[2]), low: Number(c.low ?? c[3]), close: Number(c.close ?? c[4]), raw: c };
    }).filter(Boolean).sort((a, b) => a.time - b.time);
    const dedup = [];
    data.forEach((barRow) => {
      if (!dedup.length || dedup[dedup.length - 1].time !== barRow.time) dedup.push(barRow);
      else dedup[dedup.length - 1] = barRow;
    });
    if (!chart) {
      chart = LightweightCharts.createChart(el, {
        height: el.clientHeight || 360,
        layout: { background: { color: "#1e1e2e" }, textColor: "#a9a3bd" },
        grid: { vertLines: { color: "#313244" }, horzLines: { color: "#313244" } },
        timeScale: { timeVisible: true, borderColor: "#313244" },
        rightPriceScale: { borderColor: "#313244" },
      });
      series = chart.addCandlestickSeries({ upColor: "#7ee2a8", downColor: "#f4879b", borderVisible: false, wickUpColor: "#7ee2a8", wickDownColor: "#f4879b" });
      new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth })).observe(el);
    }
    series.setData(dedup.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    const markers = [];
    (S.marks || []).forEach((t) => {
      const openAt = candleTime(t.open_date);
      if (openAt != null) markers.push({ time: openAt, position: t.is_short ? "aboveBar" : "belowBar", color: t.is_short ? "#f4879b" : "#7ee2a8", shape: t.is_short ? "arrowDown" : "arrowUp", text: t.is_short ? "S" : "L" });
      const closeAt = candleTime(t.close_date);
      if (closeAt != null) markers.push({ time: closeAt, position: "aboveBar", color: "#e3b341", shape: "circle", text: "X" });
    });
    markers.sort((a, b) => a.time - b.time || (a.text === "X" ? 1 : -1));
    const uniq = [];
    markers.forEach((m) => {
      const prev = uniq[uniq.length - 1];
      if (prev && prev.time === m.time && prev.text === m.text) return;
      uniq.push(m);
    });
    series.setMarkers(uniq);
    const names = (S.candles && S.candles.indicators) || [];
    const sel = $("ind");
    if (sel && !sel.contains(document.activeElement)) {
      const html = `<option value="">None</option>` + names.slice(0, 30).map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
      if (sel.dataset.html !== html) { sel.dataset.html = html; sel.innerHTML = html; }
      if (![""].concat(names).includes(S.ind)) S.ind = "";
      sel.value = S.ind;
    }
    if (indSeries) { chart.removeSeries(indSeries); indSeries = null; }
    if (S.ind) {
      const line = dedup.map((barRow) => {
        const v = Number(barRow.raw[S.ind]);
        return Number.isFinite(v) ? { time: barRow.time, value: v } : null;
      }).filter(Boolean);
      indSeries = chart.addLineSeries({ color: "#6f8f86", lineWidth: 2, priceScaleId: "ind", title: S.ind });
      chart.priceScale("ind").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
      indSeries.setData(line);
    }
    const wl = $("whitelist");
    if (wl) wl.textContent = S.whitelist.length ? "Whitelist " + S.whitelist.slice(0, 8).join(", ") + (S.whitelist.length > 8 ? " +" + (S.whitelist.length - 8) : "") : "";
  }

  function fillSelect(id, rows, valueKey) {
    const el = $(id);
    if (!el || el.contains(document.activeElement)) return;
    const html = rows.map((row) => {
      const value = typeof row === "string" ? row : row[valueKey];
      const label = typeof row === "string" ? row : (row.name || value);
      return `<option value="${esc(value)}">${esc(label)}</option>`;
    }).join("");
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html || `<option value="">—</option>`;
  }
  function renderBacktest() {
    fillSelect("bt-config", S.configs, "name");
    fillSelect("bt-strategy", S.strategies, "name");
    paint("jobs", S.jobs.length ? S.jobs.slice(0, 20).map((j) => `<div class="bot"><button type="button" data-act="job" data-id="${esc(j.id)}" style="background:none;border:0;color:inherit;padding:0"><b class="${j.status === "succeeded" ? "pos" : j.status === "failed" || j.status === "error" ? "neg" : ""}">${esc(j.status)}</b> ${esc(j.config)} · ${esc(j.strategy || "")}</button>${j.status === "running" ? ` <button type="button" class="btn" data-act="cancel-job" data-id="${esc(j.id)}">Cancel</button>` : ""}</div>`).join("") : `<p class="mute">No jobs in this session.</p>`);
    const log = $("job-log");
    if (log && !log.contains(document.activeElement)) log.textContent = S.jobLog;
    paint("results", S.results.length ? S.results.slice(0, 15).map((r) => `<button type="button" class="bot" data-act="result" data-id="${esc(r.name)}" style="width:100%;text-align:left"><b>${esc(r.name)}</b><div class="mute">${esc(r.filename)}</div></button>`).join("") : `<p class="mute">No saved backtests yet.</p>`);
    const detail = $("result-detail");
    if (detail && detail.dataset.html !== S.resultHtml) { detail.dataset.html = S.resultHtml; detail.innerHTML = S.resultHtml; }
  }
  function renderData() {
    fillSelect("dl-config", S.configs, "name");
    const names = S.exchanges.map((e) => (typeof e === "string" ? e : e.name));
    fillSelect("dl-exchange", names, "name");
    fillSelect("cov-exchange", names, "name");
    const rows = (S.coverage && S.coverage.rows) || [];
    const summary = (S.coverage && S.coverage.summary) || {};
    paint("coverage", `<p class="mute">${summary.pair_count || 0} pairs · ${summary.file_count || 0} files</p>` + (rows.length
      ? `<table><thead><tr><th>Pair</th><th>TF</th><th>Candles</th><th>End</th></tr></thead><tbody>${rows.slice(0, 40).map((r) => `<tr><td>${esc(r.pair)}</td><td>${esc(r.timeframe)}</td><td>${esc(r.candles)}</td><td>${esc((r.end || "").slice(0, 16))}</td></tr>`).join("")}</tbody></table>`
      : `<p class="mute">Pick an exchange. Empty means no feather files yet.</p>`));
  }

  async function loadMeta() {
    const [cfgs, strats, examples] = await Promise.all([
      api("/api/configs?all=true"),
      api("/api/strategies"),
      api("/api/configs/examples").catch(() => ({ examples: [] })),
    ]);
    S.configs = cfgs.configs || [];
    S.strategies = strats.strategies || [];
    S.examples = examples.examples || [];
  }
  function ensureBot() {
    if (S.pendingBot) {
      const cfg = S.configs.find((c) => c.name === S.pendingBot);
      S.pendingBot = "";
      if (cfg) {
        S.userBot = true;
        S.bot = cfg.account_name;
        S.tfBot = "";
        S.candles = null;
        S.badPairs = {};
        return;
      }
    }
    const known = S.configs.some((c) => c.account_name === S.bot);
    if (S.bot && known) return;
    if (S.userBot && !S.bot) return;
    const running = S.configs.find((c) => c.running);
    const next = (running || S.configs[0] || {}).account_name || "";
    if (next !== S.bot) {
      S.bot = next;
      S.candles = null;
      S.badPairs = {};
    }
  }
  let dashCtl = null;
  function aborted(err) { return !!err && (err.name === "AbortError" || /aborted/i.test(err.message || "")); }
  function afterPaint() {
    if (globalThis.scheduler && typeof scheduler.yield === "function") return scheduler.yield();
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  async function loadDash() {
    const bot = S.bot;
    const seq = (S.dashSeq = (S.dashSeq || 0) + 1);
    if (dashCtl) dashCtl.abort();
    dashCtl = new AbortController();
    const signal = dashCtl.signal;
    const q = "?closed_limit=40" + (bot ? "&bot=" + encodeURIComponent(bot) : "");
    let dash = null;
    try {
      dash = await api("/api/dashboard" + q, { signal, priority: "high" });
    } catch (err) {
      if (aborted(err) || seq !== S.dashSeq || bot !== S.bot) return;
      S.dashError = err.message || "This bot has no trade history yet";
    }
    if (seq !== S.dashSeq || bot !== S.bot) return;
    if (dash) {
      S.dash = dash;
      S.dashError = "";
      S.cache[bot || ""] = dash;
    } else if (!S.dash) {
      S.dash = { status: { state: "STOPPED", never_started: true }, open_trades: [], closed_trades: [], messages: [], logs: [] };
    }
    if (!S.cacheWl[bot || ""]) {
      api("/api/whitelist" + (bot ? "?bot=" + encodeURIComponent(bot) : ""), { priority: "low" }).then((wl) => {
        if (S.bot !== bot) return;
        S.whitelist = (wl && wl.whitelist) || [];
        S.cacheWl[bot || ""] = S.whitelist;
      }).catch(() => {});
    } else {
      S.whitelist = S.cacheWl[bot || ""];
    }
  }
  async function loadCandles() {
    const choices = pairChoices();
    if (!S.chartPair || !choices.includes(S.chartPair)) S.chartPair = choices[0] || S.chartPair;
    const queue = [...new Set([S.chartPair, ...choices])].filter(Boolean).slice(0, 2);
    if (!queue.length) { S.error = "No pair to chart"; return; }
    for (const pair of queue) {
      const q = `?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(S.tf)}&limit=120&indicators=${S.ind ? "true" : "false"}` + (S.bot ? "&bot=" + encodeURIComponent(S.bot) : "");
      try {
        S.candles = await api("/api/pair/candles" + q, { priority: "low" });
        S.chartPair = pair;
        S.error = "";
        break;
      } catch (err) {
        S.badPairs[pair + "|" + S.tf] = true;
        S.candles = { candles: [], timeframe: S.tf, indicators: [] };
        S.error = err.message;
      }
    }
    S.marks = [...openTrades(), ...closedTrades()].filter((t) => t.pair === S.chartPair);
    drawCandles();
  }
  async function loadJobs() {
    const [jobs, results] = await Promise.all([
      api("/api/backtests/jobs").catch(() => ({ jobs: [] })),
      api("/api/backtests").catch(() => ({ backtests: [] })),
    ]);
    S.jobs = jobs.jobs || [];
    S.results = results.backtests || [];
  }
  async function loadExchanges() {
    const body = await api("/api/exchanges");
    S.exchanges = body.exchanges || [];
    if (!S.exchange && S.exchanges.length) S.exchange = typeof S.exchanges[0] === "string" ? S.exchanges[0] : S.exchanges[0].name;
  }
  async function loadCoverage() {
    if (!S.exchange) { S.coverage = null; return; }
    S.coverage = await api("/api/data/coverage?exchange=" + encodeURIComponent(S.exchange));
  }
  let refreshJob = null;
  let refreshAgain = null;
  async function refresh(opts) {
    refreshAgain = opts || {};
    if (refreshJob) return refreshJob;
    refreshJob = (async () => {
      try {
        while (refreshAgain) {
          const job = refreshAgain;
          refreshAgain = null;
          const full = job.full !== false;
          try {
            if (full || !S.configs.length) {
              await loadMeta();
              ensureBot();
            }
            if (S.view === "trading") {
              await loadDash();
              renderTrading();
              ensureChart();
            } else if (S.view === "backtester") {
              await loadJobs();
              renderBacktest();
            } else {
              if (!S.exchanges.length) await loadExchanges();
              if (S.exchange && !S.coverage) await loadCoverage();
              renderData();
            }
          } catch (err) { toast(err.message || "Refresh failed"); }
        }
      } finally { refreshJob = null; }
    })();
    return refreshJob;
  }

  async function patchConfig(name, mutate) {
    const raw = await api("/api/configs/" + encodeURIComponent(name) + "/raw");
    const parsed = JSON.parse(raw.content);
    mutate(parsed);
    await api("/api/configs/" + encodeURIComponent(name) + "/raw", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: JSON.stringify(parsed, null, 2) }),
    });
  }
  function modal(title, body) {
    $("modal").hidden = false;
    $("modal").innerHTML = `<div class="modal-back" data-act="close"><div class="modal" role="dialog"><h2>${esc(title)}</h2>${body}</div></div>`;
  }
  function closeModal() { $("modal").hidden = true; $("modal").innerHTML = ""; }

  async function onClick(event) {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const id = el.dataset.id;
    try {
      if (act === "side") { S.side = id; renderTrading(); }
      else if (act === "pane") {
        S.pane = id;
        renderTrading();
        if (id === "chart") ensureChart();
      }
      else if (act === "pick-pair") { closeModal(); S.chartPair = id; S.pane = "chart"; S.candles = null; await loadCandles(); renderTrading(); }
      else if (act === "trade") {
        const t = [...openTrades(), ...closedTrades()].find((x) => x.pair === el.dataset.pair && String(x.open_date || "") === el.dataset.open);
        if (!t) return;
        const lines = [
          ["Side", t.is_short ? "SHORT" : "LONG"],
          ["Open rate", t.open_rate],
          ["Current", t.current_rate || t.close_rate || "—"],
          ["Stake", t.stake_amount || "—"],
          ["Leverage", (Number(t.leverage) || 1) + "x"],
          ["PnL", money(profitAbs(t)) + "  " + pct(profitPct(t))],
          ["Held", heldFor(t) || "—"],
          ["Stop", t.stop_loss_abs || t.initial_stop_loss_abs || "—"],
          ["Tag", t.enter_tag || "—"],
          ["Exit", t.exit_reason || "—"],
          ["Opened", t.open_date || "—"],
          ["Closed", t.close_date || "—"],
        ];
        modal(t.pair, lines.map(([k, v]) => `<div class="row" style="justify-content:space-between"><span class="mute">${esc(k)}</span><b>${esc(v)}</b></div>`).join("")
          + `<div class="row"><button type="button" class="btn" data-act="pick-pair" data-id="${esc(t.pair)}">Chart</button>${t.is_open ? `<button type="button" class="btn" data-act="force" data-pair="${esc(t.pair)}">Force exit</button>` : ""}</div>`);
      }
      else if (act === "nonbots") { S.showNonBots = el.checked; await refresh(); }
      else if (act === "view-bot") {
        S.userBot = true;
        const next = S.bot === id ? "" : id;
        S.bot = next;
        S.dashSeq = (S.dashSeq || 0) + 1;
        if (dashCtl) dashCtl.abort();
        if (S.cache[next]) {
          S.dash = S.cache[next];
          S.whitelist = S.cacheWl[next] || [];
          S.dashError = "";
        }
        renderTrading();
        afterPaint().then(() => refresh({ full: false }));
      }
      else if (act === "start") {
        if (el.dataset.live === "1" && !window.confirm("Start LIVE " + id + "? This config can send real orders.")) return;
        await api("/api/configs/" + encodeURIComponent(id) + "/start", { method: "POST" });
        toast("Starting " + id);
        setTimeout(async () => {
          try {
            const body = await api("/api/dashboard?closed_limit=1");
            const lines = (body.logs || []).map(logText);
            const err = [...lines].reverse().find((line) => /ConfigurationError|initialisation failed|Could not launch/.test(line));
            if (err) toast(err.replace(/^.*ConfigurationError:\s*/, "").slice(0, 180));
          } catch (e) { /* the running-state refresh still happens below */ }
          refresh({ full: true });
        }, 5000);
      } else if (act === "stop") {
        await api("/api/configs/" + encodeURIComponent(id) + "/stop", { method: "POST" });
        toast("Stopping " + id);
        setTimeout(refresh, 2000);
      } else if (act === "force") {
        if (!S.bot) { toast("Select the bot that owns this trade first"); return; }
        if (!window.confirm("Force exit " + el.dataset.pair + " on " + S.bot + "?")) return;
        await api("/api/livebots/" + encodeURIComponent(S.bot) + "/forceexit?pair=" + encodeURIComponent(el.dataset.pair), { method: "POST" });
        closeModal();
        toast("Exit requested");
        setTimeout(refresh, 1500);
      } else if (act === "delete") {
        if (!confirm("Delete " + id + "?")) return;
        await api("/api/configs/" + encodeURIComponent(id), { method: "DELETE" });
        await refresh();
      } else if (act === "rename") {
        const name = prompt("New name", id);
        if (!name || name === id) return;
        await api("/api/configs/" + encodeURIComponent(id) + "/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_name: name }) });
        await refresh();
      } else if (act === "dup") {
        const name = prompt("Copy as", id + "_copy");
        if (!name) return;
        await api("/api/configs/" + encodeURIComponent(id) + "/duplicate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_name: name }) });
        await refresh();
      } else if (act === "new-bot") {
        const opts = [`<option value="">Blank</option>`].concat(S.examples.map((ex) => `<option value="example:${esc(ex.name)}">Example · ${esc(ex.name)}</option>`), S.configs.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`)).join("");
        modal("New bot config", `<form id="new-form"><label class="stack">Name<input class="field" name="name" required></label><label class="stack">Start from<select class="field" name="source">${opts}</select></label><p class="err" id="new-err"></p><button class="btn" type="submit">Create</button></form>`);
        $("new-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const data = new FormData(e.target);
          try {
            const created = await api("/api/configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), source: data.get("source") || null }) });
            closeModal();
            S.pendingBot = String((created && created.name) || data.get("name") || "").trim();
            S.candles = null;
            S.badPairs = {};
            S.tfBot = "";
            await refresh();
          } catch (err) { $("new-err").textContent = err.message; }
        });
      } else if (act === "edit") {
        const raw = await api("/api/configs/" + encodeURIComponent(id) + "/raw");
        modal("Edit " + id, `<form id="edit-form"><textarea class="field" name="content">${esc(raw.content)}</textarea><p class="err" id="edit-err"></p><button class="btn" type="submit">Save</button></form>`);
        $("edit-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const content = new FormData(e.target).get("content");
          try {
            JSON.parse(content);
            await api("/api/configs/" + encodeURIComponent(id) + "/raw", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
            closeModal();
            toast("Saved");
            await refresh();
          } catch (err) { $("edit-err").textContent = err.message; }
        });
      } else if (act === "job") {
        const body = await api("/api/backtests/jobs/" + encodeURIComponent(id));
        S.jobLog = (body.log || []).map((line) => (typeof line === "string" ? line : line.message || JSON.stringify(line))).join("\n");
        renderBacktest();
      } else if (act === "cancel-job") {
        await api("/api/backtests/jobs/" + encodeURIComponent(id) + "/cancel", { method: "POST" });
        toast("Cancel requested");
        await loadJobs();
        renderBacktest();
      } else if (act === "result") {
        const [mae, regime] = await Promise.all([
          api("/api/backtests/" + encodeURIComponent(id) + "/mae_mfe"),
          api("/api/backtests/" + encodeURIComponent(id) + "/regime_analysis").catch((err) => ({ error: err.message })),
        ]);
        const g = mae.global || {};
        const metrics = (regime && regime.per_regime_metrics) || {};
        const regimeHtml = Object.keys(metrics).length && !regime.error
          ? Object.entries(metrics).filter(([, row]) => row.trades).map(([name, row]) => `<div class="bot"><b>${esc(name)}</b><div class="mute">${row.trades || 0} trades · win ${Number(row.win_rate || 0).toFixed(1)}% · PF ${row.profit_factor == null ? "∞" : Number(row.profit_factor).toFixed(2)}</div><div class="${cls(row.total_pnl || 0)}">PnL ${money(row.total_pnl || 0)} · Sharpe ${Number(row.sharpe || 0).toFixed(2)} · E[R] ${Number(row.expectancy_r || 0).toFixed(3)}</div></div>`).join("")
          : `<p class="mute">${esc((regime && regime.error) || "Regime needs downloaded candles for the traded pairs.")}</p>`;
        const eq = (regime && regime.equity_series) || [];
        let spark = "";
        if (eq.length > 2) {
          const vals = eq.map((p) => Number(p.equity)).filter((n) => Number.isFinite(n));
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const span = max - min || 1;
          const points = vals.map((v, i) => ((i / (vals.length - 1)) * 280).toFixed(1) + "," + (70 - ((v - min) / span) * 64).toFixed(1)).join(" ");
          spark = `<svg class="equity" viewBox="0 0 280 78"><polyline fill="none" stroke="#8b7cf6" stroke-width="2" points="${points}"/></svg>`;
        }
        S.resultHtml = `<div class="grid-2">
          <div class="pulse"><span>Trades</span><b>${esc(g.total)}</b></div>
          <div class="pulse"><span>Wins</span><b>${esc(g.win_count)}</b></div>
          <div class="pulse"><span>MAE median</span><b>${esc(g.mae_median)}%</b></div>
          <div class="pulse"><span>MFE median</span><b>${esc(g.mfe_median)}%</b></div>
          <div class="pulse"><span>Suggested SL</span><b>${esc(mae.recommended_sl)}</b></div>
          <div class="pulse"><span>Method</span><b>${esc(mae.method)}</b></div>
        </div><h3>Regime</h3>${spark}${regimeHtml}`;
        renderBacktest();
      } else if (act === "close" && event.target === el) closeModal();
    } catch (err) { toast(err.message || "Action failed"); }
  }

  document.addEventListener("change", async (event) => {
    const strat = event.target.closest("[data-act=strategy]");
    const auto = event.target.closest("[data-act=autostart]");
    try {
      if (strat) {
        await patchConfig(strat.dataset.id, (cfg) => { cfg.strategy = strat.value || ""; });
        toast("Strategy saved");
      } else if (auto) {
        await patchConfig(auto.dataset.id, (cfg) => { cfg.auto_start = auto.checked; });
        toast(auto.checked ? "Auto-start on" : "Auto-start off");
      } else return;
      await loadMeta();
    } catch (err) { toast(err.message); }
  });

  async function onBacktest(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    try {
      const body = await api("/api/backtests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: data.get("config"),
          strategy: data.get("strategy") || null,
          timerange: data.get("timerange") || null,
          engine: data.get("engine") || "python",
        }),
      });
      toast("Queued " + ((body.job && body.job.id) || "job"));
      await loadJobs();
      renderBacktest();
    } catch (err) { toast(err.message); }
  }
  async function onDownload(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    const pairs = String(data.get("pairs") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const timeframes = String(data.get("timeframes") || "").split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await api("/api/data/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: data.get("config"),
          exchange: data.get("exchange") || null,
          pairs: pairs.length ? pairs : null,
          timeframes: timeframes.length ? timeframes : null,
          days: Number(data.get("days")) || null,
        }),
      });
      toast("Download queued");
    } catch (err) { toast(err.message); }
  }

  function tickClock() {
    $("clock").textContent = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(new Date()) + " ICT";
  }
  $("logout").onclick = () => { localStorage.removeItem("VulcanTrader_token"); location.href = "/login"; };
  $("refresh").onclick = () => { S.candles = null; S.badPairs = {}; S.coverage = null; refresh({ full: true }); };
  document.addEventListener("click", onClick);
  window.addEventListener("hashchange", () => { viewFromHash(); showView(); refresh(); });
  viewFromHash();
  shell();
  showView();
  tickClock();
  setInterval(tickClock, 1000);
  fetch("/api/version").then((r) => r.json()).then((b) => { $("ver").textContent = b.version ? "v" + b.version : ""; }).catch(() => {});
  refresh({ full: true });
  setInterval(() => {
    if (S.view !== "trading" && S.view !== "backtester") return;
    S.polls = (S.polls || 0) + 1;
    refresh({ full: S.view === "trading" ? S.polls % 12 === 0 : S.polls % 4 === 0 });
  }, 5000);
})();
