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
    showNonBots: false,
    bot: "",
    dash: null,
    candles: null,
    chartPair: "",
    side: "bots",
    jobs: [],
    results: [],
    exchanges: [],
    coverage: null,
    exchange: "",
    error: "",
    bt: { config: "", strategy: "", timerange: "", engine: "python" },
    dl: { config: "", exchange: "", pairs: "", timeframes: "5m,15m,1h", days: "30" },
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
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: "Bearer " + token, ...(opts && opts.headers) },
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
    const items = [
      ["trading", "Trading"],
      ["backtester", "Backtester"],
      ["data", "Data"],
    ];
    const html = items.map(([id, label]) => `<a href="#${id}" class="${S.view === id ? "on" : ""}">${label}</a>`).join("");
    $("nav").innerHTML = html;
    $("dock").innerHTML = html;
  }

  function closedTrades() {
    return ((S.dash && S.dash.closed_trades) || []).filter((t) => !t.is_open);
  }
  function openTrades() {
    return (S.dash && S.dash.open_trades) || [];
  }
  function profitAbs(t) {
    const v = t.close_profit_abs != null ? t.close_profit_abs : t.profit_abs;
    return Number(v) || 0;
  }
  function profitPct(t) {
    const v = t.close_profit != null ? t.close_profit : t.profit_ratio;
    return (Number(v) || 0) * 100;
  }

  function shell() {
    $("app").innerHTML = `
      <section id="view-trading">
        <div class="grid-4" id="pulses"></div>
        <div class="split">
          <section class="card">
            <h2>Fleet <button type="button" class="btn" data-act="new-bot">New</button></h2>
            <div class="seg row" id="side"></div>
            <div id="fleet"></div>
          </section>
          <div>
            <section class="card">
              <h2>Pair chart <span class="mute" id="chart-note"></span></h2>
              <label class="stack">Pair<select id="pair" class="field"></select></label>
              <div id="chart"></div>
            </section>
            <section class="card desk-only" id="book-desk"></section>
            <section class="card phone-only" id="book-phone"></section>
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
        <section class="card"><h2>Jobs</h2><div id="jobs"></div></section>
        <section class="card"><h2>Saved results</h2><div id="results"></div></section>
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
    $("pair").addEventListener("change", () => {
      S.chartPair = $("pair").value;
      loadCandles();
    });
    $("bt-form").addEventListener("submit", onBacktest);
    $("dl-form").addEventListener("submit", onDownload);
    $("cov-exchange").addEventListener("change", () => {
      S.exchange = $("cov-exchange").value;
      loadCoverage();
    });
  }

  function showView() {
    ["trading", "backtester", "data"].forEach((id) => {
      $("view-" + id).hidden = S.view !== id;
    });
    $("banner").textContent = S.view === "trading"
      ? "Live desk. Bots, trades, and candles come from this VulcanTrader API. Classic UI stays at /trading-classic."
      : S.view === "backtester"
        ? "Queue a real backtest on this machine. The full hyperopt and regime tools stay on the classic page."
        : "Coverage reads the feather files already on disk. Downloads run as background jobs.";
    nav();
  }

  function renderTrading() {
    const open = openTrades();
    const closed = closedTrades();
    const unreal = open.reduce((s, t) => s + profitAbs(t), 0);
    const closedPnl = closed.reduce((s, t) => s + profitAbs(t), 0);
    const running = S.configs.filter((c) => c.running).length;
    const crashed = S.configs.filter((c) => c.crashed).length;
    const live = S.configs.filter((c) => c.running && !c.dry_run).length;
    paint("pulses", [
      ["Running", running, live ? live + " live" : "paper only", live ? "neg" : "pos"],
      ["Attention", crashed, "crashed", crashed ? "neu" : ""],
      ["Unrealized", money(unreal), open.length + " open", cls(unreal)],
      ["Closed PnL", money(closedPnl), closed.length + " closed", cls(closedPnl)],
    ].map(([l, v, h, c]) => `<div class="pulse"><span>${l}</span><b class="${c}">${esc(v)}</b><span>${esc(h)}</span></div>`).join(""));

    const sides = [["bots", "Bots"], ["metrics", "Metrics"], ["log", "Log"]];
    paint("side", sides.map(([id, label]) => `<button type="button" data-act="side" data-id="${id}" class="${S.side === id ? "on" : ""}">${label}</button>`).join(""));

    if (S.side === "bots") paint("fleet", botList());
    else if (S.side === "metrics") paint("fleet", metricsHtml(closed));
    else paint("fleet", logHtml());

    const pairs = [...new Set([...open, ...closed].map((t) => t.pair).filter(Boolean))];
    if (!pairs.includes("BTC/USDT")) pairs.unshift("BTC/USDT");
    if (!S.chartPair) S.chartPair = pairs[0];
    const pairEl = $("pair");
    if (pairEl && !pairEl.contains(document.activeElement)) {
      const html = pairs.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
      if (pairEl.dataset.html !== html) {
        pairEl.dataset.html = html;
        pairEl.innerHTML = html;
      }
      pairEl.value = S.chartPair;
    }
    const note = $("chart-note");
    if (note) note.textContent = S.candles ? (S.candles.timeframe || "") + " · " + ((S.candles.candles || []).length) + " bars" : "loading";
    paintBooks(open, closed);
  }

  function botList() {
    if (!S.configs.length) return `<p class="mute">No configs in user_data/configs.</p><label class="row"><input type="checkbox" data-act="nonbots" ${S.showNonBots ? "checked" : ""}> Show non-bots</label>`;
    return `<label class="row"><input type="checkbox" data-act="nonbots" ${S.showNonBots ? "checked" : ""}> Show non-bots</label>` +
      S.configs.map((c) => {
        const tone = c.crashed ? "neg" : c.running ? "pos" : "";
        const status = c.crashed ? "crashed" : c.running ? "running" : "stopped";
        const opts = S.strategies.map((s) => `<option value="${esc(s.name)}" ${s.name === c.strategy ? "selected" : ""}>${esc(s.name)}</option>`).join("");
        return `<article class="bot ${S.bot === c.account_name ? "on" : ""}">
          <button type="button" class="row" data-act="view-bot" data-id="${esc(c.account_name)}" style="width:100%;background:none;border:0;padding:0;text-align:left">
            <b>${esc(c.name)}</b><span class="pill ${tone}">${status}</span>
          </button>
          <div class="mute">${c.dry_run ? "Paper" : "LIVE"} · ${esc(c.exchange || "—")}${c.cpu_percent != null ? " · " + Number(c.cpu_percent).toFixed(1) + "% CPU" : ""}</div>
          <label class="stack">Strategy<select class="field" data-act="strategy" data-id="${esc(c.name)}"><option value="">—</option>${opts}</select></label>
          <div class="row">
            <button class="btn icon" data-act="start" data-id="${esc(c.name)}" ${c.running || !c.strategy ? "disabled" : ""}>Start</button>
            <button class="btn icon" data-act="stop" data-id="${esc(c.name)}" ${c.running ? "" : "disabled"}>Stop</button>
            <button class="btn icon" data-act="edit" data-id="${esc(c.name)}">Edit</button>
            <button class="btn icon" data-act="dup" data-id="${esc(c.name)}">Copy</button>
            <button class="btn icon" data-act="rename" data-id="${esc(c.name)}" ${c.running ? "disabled" : ""}>Rename</button>
            <button class="btn icon" data-act="delete" data-id="${esc(c.name)}" ${c.running ? "disabled" : ""}>Delete</button>
          </div>
        </article>`;
      }).join("");
  }

  function metricsHtml(closed) {
    const wins = closed.filter((t) => profitAbs(t) > 0);
    const losses = closed.filter((t) => profitAbs(t) < 0);
    const gp = wins.reduce((s, t) => s + profitAbs(t), 0);
    const gl = Math.abs(losses.reduce((s, t) => s + profitAbs(t), 0));
    const pnl = closed.reduce((s, t) => s + profitAbs(t), 0);
    const wr = closed.length ? (wins.length / closed.length) * 100 : 0;
    const pf = gl ? gp / gl : gp ? Infinity : 0;
    const cells = [
      ["Win rate", pct(wr)],
      ["Trades", String(closed.length)],
      ["PnL", money(pnl)],
      ["Profit factor", Number.isFinite(pf) ? pf.toFixed(2) : "∞"],
      ["Wins", String(wins.length)],
      ["Losses", String(losses.length)],
    ];
    return `<div class="grid-2">${cells.map(([k, v]) => `<div class="pulse"><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>`;
  }

  function logHtml() {
    const messages = (S.dash && S.dash.messages) || [];
    const logs = (S.dash && S.dash.logs) || [];
    const lines = messages.length ? messages : logs;
    if (!lines.length) return `<p class="mute">No messages yet.</p>`;
    return `<div class="log">${lines.slice(-40).reverse().map((line) => {
      const text = typeof line === "string" ? line : (line.message || line.msg || JSON.stringify(line));
      const when = line.date || line.time || "";
      return `<p><span class="mute">${esc(when)}</span><br>${esc(text)}</p>`;
    }).join("")}</div>`;
  }

  function tradeRows(list, open) {
    if (!list.length) return `<p class="mute">${open ? "No open trades." : "No closed trades."}</p>`;
    return `<div class="phone-only">${list.slice(0, 40).map((t) => `<div class="bot"><b>${esc(t.pair)}</b> <span class="${t.is_short ? "neg" : "pos"}">${t.is_short ? "SHORT" : "LONG"}</span><div class="${cls(profitAbs(t))}">${money(profitAbs(t))} · ${pct(profitPct(t))}</div></div>`).join("")}</div>
      <div class="desk-only"><table><thead><tr><th>Pair</th><th>Side</th><th>PnL</th><th>%</th><th>${open ? "Rate" : "Exit"}</th></tr></thead><tbody>
      ${list.slice(0, 80).map((t) => `<tr><td>${esc(t.pair)}</td><td class="${t.is_short ? "neg" : "pos"}">${t.is_short ? "SHORT" : "LONG"}</td><td class="${cls(profitAbs(t))}">${money(profitAbs(t))}</td><td class="${cls(profitPct(t))}">${pct(profitPct(t))}</td><td>${esc(open ? t.current_rate || t.open_rate : t.exit_reason || "")}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function paintBooks(open, closed) {
    const html = `<h2>Open (${open.length}) <span class="${cls(open.reduce((s, t) => s + profitAbs(t), 0))}">${money(open.reduce((s, t) => s + profitAbs(t), 0))}</span></h2>${tradeRows(open, true)}<h2>Closed (${closed.length})</h2>${tradeRows(closed, false)}`;
    paint("book-desk", html);
    paint("book-phone", html);
  }

  let chart, series;
  function drawCandles() {
    const rows = (S.candles && S.candles.candles) || [];
    const el = $("chart");
    if (!el || !window.LightweightCharts) return;
    const data = rows.map((c) => {
      const raw = c.date || c.time || c[0];
      const ms = typeof raw === "number" ? (raw > 1e12 ? raw : raw * 1000) : Date.parse(raw);
      if (!Number.isFinite(ms)) return null;
      return {
        time: Math.floor(ms / 1000),
        open: Number(c.open ?? c[1]),
        high: Number(c.high ?? c[2]),
        low: Number(c.low ?? c[3]),
        close: Number(c.close ?? c[4]),
      };
    }).filter(Boolean).sort((a, b) => a.time - b.time);
    const dedup = [];
    data.forEach((bar) => {
      if (!dedup.length || dedup[dedup.length - 1].time !== bar.time) dedup.push(bar);
      else dedup[dedup.length - 1] = bar;
    });
    if (!chart) {
      chart = LightweightCharts.createChart(el, {
        height: 280,
        layout: { background: { color: "#1b1814" }, textColor: "#a8a097" },
        grid: { vertLines: { color: "#2c2823" }, horzLines: { color: "#2c2823" } },
        timeScale: { timeVisible: true },
      });
      series = chart.addCandlestickSeries({
        upColor: "#3f8f62", downColor: "#a33b32", borderVisible: false,
        wickUpColor: "#3f8f62", wickDownColor: "#a33b32",
      });
      new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth })).observe(el);
    }
    series.setData(dedup);
    if (!dedup.length) el.insertAdjacentHTML("beforeend", "");
  }

  function fillSelect(id, rows, valueKey, labelKey) {
    const el = $(id);
    if (!el || el.contains(document.activeElement)) return;
    const html = rows.map((row) => {
      const value = typeof row === "string" ? row : row[valueKey];
      const label = typeof row === "string" ? row : (row[labelKey] || value);
      return `<option value="${esc(value)}">${esc(label)}</option>`;
    }).join("");
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html || `<option value="">—</option>`;
  }

  function renderBacktest() {
    fillSelect("bt-config", S.configs, "name", "name");
    fillSelect("bt-strategy", S.strategies, "name", "name");
    paint("jobs", S.jobs.length ? `<table><thead><tr><th>Status</th><th>Config</th><th>Strategy</th><th>Engine</th></tr></thead><tbody>${
      S.jobs.slice(0, 20).map((j) => `<tr><td class="${j.status === "succeeded" ? "pos" : j.status === "failed" || j.status === "error" ? "neg" : ""}">${esc(j.status)}</td><td>${esc(j.config)}</td><td>${esc(j.strategy || "")}</td><td>${esc(j.engine || "")}</td></tr>`).join("")
    }</tbody></table>` : `<p class="mute">No jobs in this session.</p>`);
    paint("results", S.results.length ? S.results.slice(0, 15).map((r) => `<div class="bot"><b>${esc(r.name)}</b><div class="mute">${esc(r.filename)}</div></div>`).join("") : `<p class="mute">No saved backtests yet.</p>`);
  }

  function renderData() {
    fillSelect("dl-config", S.configs, "name", "name");
    const names = S.exchanges.map((e) => (typeof e === "string" ? e : e.name));
    fillSelect("dl-exchange", names, "name", "name");
    fillSelect("cov-exchange", names, "name", "name");
    const rows = (S.coverage && S.coverage.rows) || [];
    const summary = (S.coverage && S.coverage.summary) || {};
    paint("coverage", `<p class="mute">${summary.pair_count || 0} pairs · ${summary.file_count || 0} files</p>` + (rows.length
      ? `<table><thead><tr><th>Pair</th><th>TF</th><th>Candles</th><th>End</th></tr></thead><tbody>${rows.slice(0, 40).map((r) => `<tr><td>${esc(r.pair)}</td><td>${esc(r.timeframe)}</td><td>${esc(r.candles)}</td><td>${esc((r.end || "").slice(0, 16))}</td></tr>`).join("")}</tbody></table>`
      : `<p class="mute">Pick an exchange. Empty means no feather files yet.</p>`));
  }

  async function loadMeta() {
    const [cfgs, strats] = await Promise.all([
      api("/api/configs" + (S.showNonBots ? "?all=true" : "")),
      api("/api/strategies"),
    ]);
    S.configs = cfgs.configs || [];
    S.strategies = strats.strategies || [];
  }
  async function loadDash() {
    const q = S.bot ? "?bot=" + encodeURIComponent(S.bot) : "";
    S.dash = await api("/api/dashboard" + q);
  }
  async function loadCandles() {
    if (!S.chartPair) return;
    const q = `?pair=${encodeURIComponent(S.chartPair)}&limit=200` + (S.bot ? "&bot=" + encodeURIComponent(S.bot) : "");
    try {
      S.candles = await api("/api/pair/candles" + q);
      S.error = "";
    } catch (err) {
      S.candles = { candles: [], timeframe: "" };
      S.error = err.message;
    }
    drawCandles();
    const note = $("chart-note");
    if (note) note.textContent = S.error || ((S.candles.timeframe || "—") + " · " + ((S.candles.candles || []).length) + " bars");
  }
  async function loadJobs() {
    const [jobs, results] = await Promise.all([
      api("/api/backtests/jobs").catch(() => ({ jobs: [] })),
      api("/api/backtests").catch(() => ({ backtests: [] })),
    ]);
    S.jobs = (jobs.jobs || []).filter((j) => j.kind === "backtest" || !j.kind);
    S.results = results.backtests || [];
  }
  async function loadExchanges() {
    const body = await api("/api/exchanges");
    S.exchanges = body.exchanges || [];
    if (!S.exchange && S.exchanges.length) {
      S.exchange = typeof S.exchanges[0] === "string" ? S.exchanges[0] : S.exchanges[0].name;
    }
  }
  async function loadCoverage() {
    if (!S.exchange) { S.coverage = null; return; }
    S.coverage = await api("/api/data/coverage?exchange=" + encodeURIComponent(S.exchange));
  }

  async function refresh() {
    try {
      await loadMeta();
      if (S.view === "trading") {
        await loadDash();
        if (!S.candles) await loadCandles();
        renderTrading();
      } else if (S.view === "backtester") {
        await loadJobs();
        renderBacktest();
      } else {
        if (!S.exchanges.length) await loadExchanges();
        if (S.exchange && !S.coverage) await loadCoverage();
        renderData();
      }
    } catch (err) {
      toast(err.message || "Refresh failed");
    }
  }

  async function setStrategy(name, strategy) {
    const raw = await api("/api/configs/" + encodeURIComponent(name) + "/raw");
    const parsed = JSON.parse(raw.content);
    parsed.strategy = strategy || "";
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
      if (act === "side") { S.side = el.dataset.id; renderTrading(); }
      else if (act === "nonbots") { S.showNonBots = el.checked; await refresh(); }
      else if (act === "view-bot") { S.bot = S.bot === id ? "" : id; S.candles = null; await refresh(); await loadCandles(); }
      else if (act === "start") { await api("/api/configs/" + encodeURIComponent(id) + "/start", { method: "POST" }); toast("Starting " + id); setTimeout(refresh, 4000); }
      else if (act === "stop") { await api("/api/configs/" + encodeURIComponent(id) + "/stop", { method: "POST" }); toast("Stopping " + id); setTimeout(refresh, 2000); }
      else if (act === "delete") {
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
        modal("New bot config", `<form id="new-form"><label class="stack">Name<input class="field" name="name" required></label><p class="err" id="new-err"></p><button class="btn" type="submit">Create</button></form>`);
        $("new-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          try {
            await api("/api/configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: new FormData(e.target).get("name"), source: null }) });
            closeModal();
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
      } else if (act === "close") {
        if (event.target === el) closeModal();
      }
    } catch (err) {
      toast(err.message || "Action failed");
    }
  }

  document.addEventListener("change", async (event) => {
    const el = event.target.closest("[data-act=strategy]");
    if (!el) return;
    try {
      await setStrategy(el.dataset.id, el.value);
      toast("Strategy saved");
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

  $("logout").onclick = () => {
    localStorage.removeItem("VulcanTrader_token");
    location.href = "/login";
  };
  $("refresh").onclick = () => { S.candles = null; S.coverage = null; refresh(); };
  document.addEventListener("click", onClick);
  window.addEventListener("hashchange", () => { viewFromHash(); showView(); refresh(); });

  viewFromHash();
  shell();
  showView();
  tickClock();
  setInterval(tickClock, 1000);
  fetch("/api/version").then((r) => r.json()).then((b) => { S.version = b.version || ""; $("ver").textContent = S.version ? "v" + S.version : ""; }).catch(() => {});
  refresh();
  setInterval(() => { if (S.view === "trading" || S.view === "backtester") refresh(); }, 8000);
})();
