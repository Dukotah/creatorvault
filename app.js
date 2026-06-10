/* CreatorVault — two client-side creator tools.
 *
 * HARD PRIVACY GUARANTEE: This file makes ZERO network calls. There is no
 * fetch / XMLHttpRequest / WebSocket / sendBeacon anywhere. Nothing you type
 * (license-key settings, prices, sales numbers, fee assumptions) ever leaves
 * this browser tab. Generated keys exist only in page memory until you copy or
 * download them.
 *
 * Randomness for license keys uses the Web Crypto API
 * (crypto.getRandomValues) — a CSPRNG — NOT Math.random(). See randomInt().
 *
 * All user-derived text is inserted via textContent / safe DOM construction,
 * never innerHTML with untrusted data, so pasted values cannot inject markup.
 */
(function () {
  "use strict";

  /* ================================================================== *
   * Small DOM helpers
   * ================================================================== */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // safe: escaped by the DOM
    return node;
  }
  function $(id) { return document.getElementById(id); }

  /* ================================================================== *
   * Clipboard — local only, no network. Async API with execCommand fallback.
   * ================================================================== */
  function copyText(text, btn, doneLabel) {
    var original = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", original);
    function done(ok) {
      btn.classList.toggle("copied", ok);
      btn.textContent = ok ? (doneLabel || "Copied ✓") : "Copy failed";
      window.setTimeout(function () {
        btn.textContent = original;
        btn.classList.remove("copied");
      }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { fallbackCopy(text, done); }
      );
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand("copy");
      document.body.removeChild(ta);
      done(!!ok);
    } catch (err) {
      done(false);
    }
  }

  /* Download a text blob locally (data stays on the machine). */
  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: (mime || "text/plain") + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ================================================================== *
   * Cryptographic randomness
   * Uniform random integer in [0, max) using rejection sampling over
   * crypto.getRandomValues so there is NO modulo bias. Never uses Math.random.
   * ================================================================== */
  var CRYPTO = (typeof window !== "undefined" && (window.crypto || window.msCrypto)) || null;
  function hasCrypto() {
    return !!(CRYPTO && typeof CRYPTO.getRandomValues === "function");
  }
  function randomInt(max) {
    // max is the exclusive upper bound (1..256 for our charsets).
    if (max <= 0) return 0;
    var buf = new Uint8Array(1);
    // Largest multiple of `max` that fits in a byte; reject the remainder
    // so every value in [0, max) is equally likely.
    var limit = 256 - (256 % max);
    var x;
    do {
      CRYPTO.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % max;
  }

  /* ================================================================== *
   * Charsets
   * ================================================================== */
  var CHARSETS = {
    crockford: "0123456789ABCDEFGHJKMNPQRSTVWXYZ", // Crockford base32: no I L O U
    alnumUpper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    alnumMixed: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    hexUpper: "0123456789ABCDEF",
    digits: "0123456789",
    letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  };
  var CHARSET_LABEL = {
    crockford: "Crockford base32 (no I, L, O, U)",
    alnumUpper: "A–Z + 0–9 (uppercase)",
    alnumMixed: "A–Z + a–z + 0–9 (mixed case)",
    hexUpper: "Hex (0–9 A–F)",
    digits: "Digits only (0–9)",
    letters: "Letters only (A–Z)"
  };

  /* ================================================================== *
   * License-key generator
   * ================================================================== */
  function initKeygen() {
    var form = $("keygen-form");
    if (!form) return;

    var elSegments = $("kg-segments");
    var elSegLen = $("kg-seglen");
    var elPrefix = $("kg-prefix");
    var elCharset = $("kg-charset");
    var elSeparator = $("kg-separator");
    var elCount = $("kg-count");
    var elGroupSep = $("kg-prefix-sep");
    var preview = $("kg-preview");
    var errorBox = $("kg-error");
    var live = $("kg-status");

    var output = $("kg-output");
    var keysList = $("kg-keys");
    var keysCount = $("kg-keys-count");
    var entropyNote = $("kg-entropy");

    var lastKeys = [];

    var MAX_COUNT = 1000;
    var MAX_SEGMENTS = 12;
    var MAX_SEGLEN = 24;

    function readConfig() {
      var charsetKey = elCharset.value in CHARSETS ? elCharset.value : "crockford";
      var sep = elSeparator.value;
      // map the separator select to an actual character
      var sepChar = sep === "none" ? "" : sep === "space" ? " " : sep === "dot" ? "." : "-";
      var prefixRaw = (elPrefix.value || "").trim();
      // Sanitize the prefix to a safe label charset (it ends up in filenames + keys).
      var prefix = prefixRaw.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16);
      return {
        segments: clampInt(elSegments.value, 1, MAX_SEGMENTS, 4),
        segLen: clampInt(elSegLen.value, 2, MAX_SEGLEN, 5),
        prefix: prefix,
        charsetKey: charsetKey,
        charset: CHARSETS[charsetKey],
        sepChar: sepChar,
        prefixSep: elGroupSep.checked, // join prefix with the same separator
        count: clampInt(elCount.value, 1, MAX_COUNT, 1)
      };
    }

    function clampInt(v, min, max, fallback) {
      var n = parseInt(v, 10);
      if (isNaN(n)) return fallback;
      if (n < min) return min;
      if (n > max) return max;
      return n;
    }

    function makeSegment(charset, len) {
      var out = "";
      var n = charset.length;
      for (var i = 0; i < len; i++) {
        out += charset.charAt(randomInt(n));
      }
      return out;
    }

    function makeKey(cfg) {
      var parts = [];
      for (var i = 0; i < cfg.segments; i++) {
        parts.push(makeSegment(cfg.charset, cfg.segLen));
      }
      var body = parts.join(cfg.sepChar);
      if (cfg.prefix) {
        var join = cfg.prefixSep ? (cfg.sepChar || "-") : "";
        return cfg.prefix + join + body;
      }
      return body;
    }

    /* A non-cryptographic SAMPLE used purely to show the user the shape of the
     * key as they tweak settings. It is replaced by real crypto keys on
     * Generate. To avoid even this sample relying on Math.random, we still draw
     * from the CSPRNG when available. */
    function updatePreview() {
      var cfg = readConfig();
      preview.textContent = "";
      preview.appendChild(el("span", "pl-label", "Format"));
      var sample;
      try {
        sample = makeKey(cfg);
      } catch (e) {
        sample = "—";
      }
      preview.appendChild(el("span", "pl-val", sample));
    }

    /* Bits of entropy per key = segments * segLen * log2(charset size). */
    function keyEntropyBits(cfg) {
      var perChar = Math.log(cfg.charset.length) / Math.LN2;
      return cfg.segments * cfg.segLen * perChar;
    }

    function showError(msg) {
      if (msg) {
        errorBox.textContent = msg;
        errorBox.classList.add("show");
      } else {
        errorBox.textContent = "";
        errorBox.classList.remove("show");
      }
    }

    function renderEntropy(cfg) {
      var bits = keyEntropyBits(cfg);
      entropyNote.textContent = "";
      var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("aria-hidden", "true");
      var p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z");
      icon.appendChild(p1);
      var p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("d", "m9 12 2 2 4-4");
      icon.appendChild(p2);
      entropyNote.appendChild(icon);

      var txt = el("span");
      var strong = el("strong", null, "Generated with the Web Crypto API (CSPRNG). ");
      txt.appendChild(strong);
      txt.appendChild(document.createTextNode("Each key carries about "));
      var bitsSpan = el("span", "bits", Math.round(bits) + " bits");
      txt.appendChild(bitsSpan);
      txt.appendChild(document.createTextNode(
        " of entropy (" + cfg.segments + " × " + cfg.segLen +
        " chars from a " + cfg.charset.length + "-symbol set)" +
        describeStrength(bits) + "."
      ));
      entropyNote.appendChild(txt);
    }

    function describeStrength(bits) {
      if (bits >= 128) return " — effectively unguessable";
      if (bits >= 80) return " — very strong";
      if (bits >= 60) return " — strong";
      if (bits >= 40) return " — moderate; raise length for production";
      return " — weak; increase segments or length";
    }

    function generate() {
      if (!hasCrypto()) {
        showError(
          "Your browser does not expose the Web Crypto API, so secure keys cannot be generated. " +
          "Please use an up-to-date browser over HTTPS (or file://). Keys are never generated with an insecure random source."
        );
        output.hidden = true;
        return;
      }
      showError("");
      var cfg = readConfig();

      // Reflect clamped values back into the inputs so the UI is honest.
      elSegments.value = cfg.segments;
      elSegLen.value = cfg.segLen;
      elCount.value = cfg.count;

      var keys = [];
      for (var i = 0; i < cfg.count; i++) {
        keys.push(makeKey(cfg));
      }
      lastKeys = keys;

      renderKeys(keys);
      renderEntropy(cfg);
      output.hidden = false;
      if (typeof output.scrollIntoView === "function") {
        output.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      announce(
        keys.length +
          (keys.length === 1 ? " license key generated." : " license keys generated.")
      );
    }

    function renderKeys(keys) {
      keysList.textContent = "";
      keysCount.textContent = keys.length + (keys.length === 1 ? " key" : " keys");
      // Cap the number of DOM rows for very large batches to keep the page
      // responsive; the full set is always available via copy-all / download.
      var renderLimit = 500;
      var shown = Math.min(keys.length, renderLimit);
      for (var i = 0; i < shown; i++) {
        var li = el("li", "key-item");
        li.appendChild(el("span", "k-idx", String(i + 1)));
        li.appendChild(el("span", "k-val", keys[i]));
        var copyBtn = el("button", "copy-button k-copy");
        copyBtn.type = "button";
        copyBtn.textContent = "Copy";
        copyBtn.setAttribute("data-label", "Copy");
        copyBtn.setAttribute("aria-label", "Copy key " + (i + 1));
        (function (value, b) {
          b.addEventListener("click", function () { copyText(value, b); });
        })(keys[i], copyBtn);
        li.appendChild(copyBtn);
        keysList.appendChild(li);
      }
      if (keys.length > renderLimit) {
        var more = el("li", "key-item");
        var note = el("span", "k-val",
          "+ " + (keys.length - renderLimit) + " more not shown — use “Copy all” or “Download” to get the full set."
        );
        note.style.color = "var(--muted)";
        more.appendChild(note);
        keysList.appendChild(more);
      }
    }

    function announce(msg) { if (live) live.textContent = msg; }

    function csvEscape(value) {
      if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
      return value;
    }

    /* ------------------ wire-up ------------------ */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      generate();
    });

    // Live preview as settings change (no key data leaves the page).
    [elSegments, elSegLen, elPrefix, elCharset, elSeparator, elCount, elGroupSep].forEach(
      function (input) {
        if (!input) return;
        input.addEventListener("input", updatePreview);
        input.addEventListener("change", updatePreview);
      }
    );

    var copyAllBtn = $("kg-copy-all");
    if (copyAllBtn) {
      copyAllBtn.addEventListener("click", function () {
        if (!lastKeys.length) return;
        copyText(lastKeys.join("\n"), copyAllBtn, "All copied ✓");
      });
    }

    var dlTxtBtn = $("kg-download-txt");
    if (dlTxtBtn) {
      dlTxtBtn.addEventListener("click", function () {
        if (!lastKeys.length) return;
        downloadFile("creatorvault-license-keys.txt", lastKeys.join("\n") + "\n", "text/plain");
      });
    }

    var dlCsvBtn = $("kg-download-csv");
    if (dlCsvBtn) {
      dlCsvBtn.addEventListener("click", function () {
        if (!lastKeys.length) return;
        var rows = ["index,license_key"];
        for (var i = 0; i < lastKeys.length; i++) {
          rows.push((i + 1) + "," + csvEscape(lastKeys[i]));
        }
        downloadFile("creatorvault-license-keys.csv", rows.join("\n") + "\n", "text/csv");
      });
    }

    var resetBtn = $("kg-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        elSegments.value = "4";
        elSegLen.value = "5";
        elPrefix.value = "";
        elCharset.value = "crockford";
        elSeparator.value = "dash";
        elCount.value = "1";
        elGroupSep.checked = true;
        showError("");
        output.hidden = true;
        lastKeys = [];
        updatePreview();
        announce("Settings reset.");
      });
    }

    // Initial state
    updatePreview();
  }

  /* ================================================================== *
   * Fee comparison calculator
   * Default fee assumptions are clearly labeled and editable. They are
   * ESTIMATES of public list pricing and should be verified against each
   * platform's current rates. Stored only in page memory.
   * ================================================================== */
  var DEFAULT_PLATFORMS = [
    // pct = percentage fee, flat = per-transaction flat fee in USD.
    // note describes the assumption shown to the user.
    { id: "gumroad",  name: "Gumroad",                pct: 10.0, flat: 0.00, planned: false, note: "10% flat per sale (current standard rate)." },
    { id: "lemon",    name: "Lemon Squeezy",          pct: 5.0,  flat: 0.50, planned: false, note: "5% + $0.50 per transaction (Merchant of Record)." },
    { id: "payhip",   name: "Payhip",                 pct: 5.0,  flat: 0.00, planned: false, note: "5% on the free plan (lower/zero on paid plans)." },
    { id: "cvault",   name: "CreatorVault (planned)", pct: 2.0,  flat: 0.30, planned: true,  note: "Planned low-fee target: 2% + $0.30. Not yet available — illustrative." }
  ];

  function initCalc() {
    var form = $("calc-form");
    if (!form) return;

    var elPrice = $("calc-price");
    var elUnits = $("calc-units");
    var errorBox = $("calc-error");
    var live = $("calc-status");

    var summary = $("calc-summary");
    var tableBody = $("calc-tbody");
    var output = $("calc-output");
    var assumpBody = $("assump-tbody");

    // Working copy of the fee assumptions (editable, in memory only).
    var platforms = DEFAULT_PLATFORMS.map(function (p) {
      return { id: p.id, name: p.name, pct: p.pct, flat: p.flat, planned: p.planned, note: p.note };
    });

    function money(n) {
      var sign = n < 0 ? "-" : "";
      var abs = Math.abs(n);
      return sign + "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function num(v, fallback) {
      var n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    }
    function clampNonNeg(n) { return n < 0 ? 0 : n; }

    function readInputs() {
      return {
        price: clampNonNeg(num(elPrice.value, NaN)),
        units: Math.max(0, Math.round(num(elUnits.value, NaN)))
      };
    }

    /* Per-platform math: a creator selling `units` of a `price` product.
     * keep-per-sale = price - (price * pct/100 + flat), floored at 0. */
    function computeRow(p, price, units) {
      var feePerSale = price * (p.pct / 100) + p.flat;
      var keepPerSale = price - feePerSale;
      if (keepPerSale < 0) keepPerSale = 0; // fee can't exceed the price into negative payout
      var feeActual = price - keepPerSale;
      return {
        id: p.id,
        name: p.name,
        planned: p.planned,
        pct: p.pct,
        flat: p.flat,
        feePerSale: feeActual,
        keepPerSale: keepPerSale,
        keepMonthly: keepPerSale * units,
        feeMonthly: feeActual * units,
        keepAnnual: keepPerSale * units * 12
      };
    }

    function buildAssumptions() {
      assumpBody.textContent = "";
      platforms.forEach(function (p, idx) {
        var tr = el("tr");
        var tdName = el("td");
        var nameSpan = el("span", "plat-name", p.name);
        tdName.appendChild(nameSpan);
        tr.appendChild(tdName);

        // percentage input
        var tdPct = el("td");
        var pctInput = document.createElement("input");
        pctInput.type = "number";
        pctInput.step = "0.1";
        pctInput.min = "0";
        pctInput.value = String(p.pct);
        pctInput.setAttribute("aria-label", p.name + " percentage fee");
        pctInput.addEventListener("input", function () {
          platforms[idx].pct = clampNonNeg(num(pctInput.value, 0));
          recompute();
        });
        tdPct.appendChild(pctInput);
        tdPct.appendChild(el("span", "unit", "%"));
        tr.appendChild(tdPct);

        // flat input
        var tdFlat = el("td");
        var flatInput = document.createElement("input");
        flatInput.type = "number";
        flatInput.step = "0.01";
        flatInput.min = "0";
        flatInput.value = p.flat.toFixed(2);
        flatInput.setAttribute("aria-label", p.name + " flat fee in dollars");
        flatInput.addEventListener("input", function () {
          platforms[idx].flat = clampNonNeg(num(flatInput.value, 0));
          recompute();
        });
        var dollar = el("span", "unit", "$ per sale");
        tdFlat.appendChild(flatInput);
        tdFlat.appendChild(dollar);
        tr.appendChild(tdFlat);

        var tdNote = el("td");
        tdNote.appendChild(el("span", null, p.note));
        tr.appendChild(tdNote);

        assumpBody.appendChild(tr);
      });
    }

    function showError(msg) {
      if (msg) {
        errorBox.textContent = msg;
        errorBox.classList.add("show");
      } else {
        errorBox.textContent = "";
        errorBox.classList.remove("show");
      }
    }

    function recompute() {
      var inp = readInputs();
      if (isNaN(inp.price) || inp.price <= 0) {
        showError("Enter a product price greater than $0.");
        output.hidden = true;
        return;
      }
      if (!inp.units || inp.units <= 0) {
        showError("Enter how many units you sell per month (1 or more).");
        output.hidden = true;
        return;
      }
      showError("");

      var rows = platforms.map(function (p) { return computeRow(p, inp.price, inp.units); });

      // Find best NON-planned platform (the real options you can pick today).
      var realRows = rows.filter(function (r) { return !r.planned; });
      var bestReal = realRows.reduce(function (a, b) {
        return b.keepMonthly > a.keepMonthly ? b : a;
      }, realRows[0]);
      var worstReal = realRows.reduce(function (a, b) {
        return b.keepMonthly < a.keepMonthly ? b : a;
      }, realRows[0]);

      renderTable(rows, bestReal);
      renderSummary(rows, bestReal, worstReal, inp);

      output.hidden = false;
      if (typeof output.scrollIntoView === "function") {
        output.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      announce(
        "Best real option: " + bestReal.name + ", keeping " +
        money(bestReal.keepMonthly) + " per month."
      );
    }

    function renderTable(rows, bestReal) {
      tableBody.textContent = "";
      rows.forEach(function (r) {
        var tr = el("tr");
        if (r.planned) tr.className = "is-planned";
        else if (bestReal && r.id === bestReal.id) tr.className = "is-best";

        // platform cell
        var tdName = el("td");
        var wrap = el("div", "plat");
        var nameRow = el("span", "plat-name");
        nameRow.appendChild(document.createTextNode(r.name));
        if (r.planned) {
          nameRow.appendChild(makeTag("planned-tag", "Planned"));
        } else if (bestReal && r.id === bestReal.id) {
          nameRow.appendChild(makeTag("best-tag", "Best today"));
        }
        wrap.appendChild(nameRow);
        var feeStr = r.pct.toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%" +
          (r.flat > 0 ? " + " + money(r.flat) : "");
        wrap.appendChild(el("span", "plat-fee", feeStr));
        tdName.appendChild(wrap);
        tr.appendChild(tdName);

        tr.appendChild(numCell(money(r.feePerSale)));
        tr.appendChild(numCell(money(r.keepPerSale), "keep"));
        tr.appendChild(numCell(money(r.keepMonthly), "keep"));
        tr.appendChild(numCell(money(r.keepAnnual), "keep"));
        tableBody.appendChild(tr);
      });
    }

    function makeTag(cls, text) {
      return el("span", cls, text);
    }
    function numCell(text, cls) {
      var td = el("td", cls || null, text);
      return td;
    }

    function renderSummary(rows, bestReal, worstReal, inp) {
      summary.textContent = "";

      var planned = rows.filter(function (r) { return r.planned; })[0];

      // 1: best real keep / month
      summary.appendChild(statCard(
        "Most you keep today",
        money(bestReal.keepMonthly) + "/mo",
        "on " + bestReal.name + ", at " + money(inp.price) + " × " + inp.units + " sales"
      ));

      // 2: spread between best and worst real option
      var spreadMonthly = bestReal.keepMonthly - worstReal.keepMonthly;
      summary.appendChild(statCard(
        "Platform choice is worth",
        money(spreadMonthly) + "/mo",
        bestReal.name + " vs " + worstReal.name + " — " + money(spreadMonthly * 12) + "/yr"
      ));

      // 3: planned CreatorVault difference vs best real (highlight)
      if (planned) {
        var annualDiff = planned.keepAnnual - bestReal.keepAnnual;
        var card = statCard(
          "CreatorVault (planned) vs best today",
          (annualDiff >= 0 ? "+" : "") + money(annualDiff) + "/yr",
          "extra kept per year vs " + bestReal.name + " at planned " +
            planned.pct + "% + " + money(planned.flat)
        );
        card.classList.add("planned-card");
        summary.appendChild(card);
      }
    }

    function statCard(label, value, sub) {
      var card = el("div", "stat-card");
      card.appendChild(el("p", "stat-label", label));
      card.appendChild(el("div", "stat-val", value));
      if (sub) card.appendChild(el("p", "stat-sub", sub));
      return card;
    }

    function announce(msg) { if (live) live.textContent = msg; }

    /* ------------------ wire-up ------------------ */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      recompute();
    });
    [elPrice, elUnits].forEach(function (input) {
      input.addEventListener("input", function () {
        // Recompute live only once results are already showing, so the page
        // doesn't jump on first keystroke.
        if (!output.hidden) recompute();
      });
    });

    var resetAssump = $("assump-reset");
    if (resetAssump) {
      resetAssump.addEventListener("click", function () {
        platforms = DEFAULT_PLATFORMS.map(function (p) {
          return { id: p.id, name: p.name, pct: p.pct, flat: p.flat, planned: p.planned, note: p.note };
        });
        buildAssumptions();
        if (!output.hidden) recompute();
        announce("Fee assumptions reset to defaults.");
      });
    }

    var exampleBtn = $("calc-example");
    if (exampleBtn) {
      exampleBtn.addEventListener("click", function () {
        elPrice.value = "29";
        elUnits.value = "100";
        recompute();
      });
    }

    buildAssumptions();
  }

  /* ================================================================== *
   * Tool switcher (tabs)
   * ================================================================== */
  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll("[role=tab]"));
    if (!tabs.length) return;

    function activate(tab, focus) {
      tabs.forEach(function (t) {
        var selected = t === tab;
        t.setAttribute("aria-selected", selected ? "true" : "false");
        t.setAttribute("tabindex", selected ? "0" : "-1");
        var panel = $(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !selected;
      });
      if (focus && typeof tab.focus === "function") tab.focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { activate(tab, false); });
      tab.addEventListener("keydown", function (e) {
        var idx = i;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          activate(tabs[(idx + 1) % tabs.length], true);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          activate(tabs[(idx - 1 + tabs.length) % tabs.length], true);
        } else if (e.key === "Home") {
          e.preventDefault();
          activate(tabs[0], true);
        } else if (e.key === "End") {
          e.preventDefault();
          activate(tabs[tabs.length - 1], true);
        }
      });
    });

    // Honor a #generator / #calculator hash on load.
    var hash = (window.location.hash || "").replace("#", "");
    if (hash === "calculator") {
      var calcTab = document.querySelector('[aria-controls="panel-calculator"]');
      if (calcTab) activate(calcTab, false);
    }
  }

  /* ================================================================== *
   * Boot
   * ================================================================== */
  function init() {
    initTabs();
    initKeygen();
    initCalc();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
