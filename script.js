const MAX_RENDERED_ROWS = 600;

const elements = {
  form: document.querySelector("#randomization-form"),
  methodInputs: document.querySelectorAll('input[name="method"]'),
  sampleSize: document.querySelector("#sample-size"),
  seed: document.querySelector("#seed"),
  idPrefix: document.querySelector("#id-prefix"),
  startNumber: document.querySelector("#start-number"),
  arms: document.querySelector("#arms"),
  ratios: document.querySelector("#ratios"),
  blockPanel: document.querySelector("#block-panel"),
  blockSizes: document.querySelectorAll(".block-size"),
  strataPanel: document.querySelector("#strata-panel"),
  strataNames: document.querySelectorAll(".strata-name"),
  strataLevels: document.querySelectorAll(".strata-levels"),
  buildStrataButton: document.querySelector("#build-strata-button"),
  strataCount: document.querySelector("#strata-count"),
  strataTableWrap: document.querySelector("#strata-table-wrap"),
  strataHeadRow: document.querySelector("#strata-head-row"),
  strataBody: document.querySelector("#strata-body"),
  resetButton: document.querySelector("#reset-button"),
  exportButton: document.querySelector("#export-button"),
  copyButton: document.querySelector("#copy-button"),
  metricTotal: document.querySelector("#metric-total"),
  metricStrata: document.querySelector("#metric-strata"),
  metricBlocks: document.querySelector("#metric-blocks"),
  metricSeed: document.querySelector("#metric-seed"),
  balanceCaption: document.querySelector("#balance-caption"),
  balanceBars: document.querySelector("#balance-bars"),
  messages: document.querySelector("#messages"),
  tableCaption: document.querySelector("#table-caption"),
  resultHead: document.querySelector("#result-head"),
  resultBody: document.querySelector("#result-body"),
  toast: document.querySelector("#toast")
};

const state = {
  strataVariables: [],
  strata: [],
  schedule: [],
  warnings: [],
  lastConfig: null
};

function xmur3(input) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function hash() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seedText) {
  const hash = xmur3(seedText || "rct-seed");
  return mulberry32(hash());
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sampleOneWeighted(arms, ratios, rng) {
  const total = ratios.reduce((sum, value) => sum + value, 0);
  let cursor = rng() * total;
  for (let i = 0; i < arms.length; i += 1) {
    cursor -= ratios[i];
    if (cursor < 0) {
      return arms[i];
    }
  }
  return arms[arms.length - 1];
}

function parseList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, label, errors) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 1) {
    errors.push(`${label} must be a positive integer.`);
    return null;
  }
  return number;
}

function getMethod() {
  return document.querySelector('input[name="method"]:checked').value;
}

function needsBlock(method) {
  return method === "block" || method === "stratified-block";
}

function needsStrata(method) {
  return method === "stratified" || method === "stratified-block";
}

function getConfig() {
  const errors = [];
  const method = getMethod();
  const sampleSize = parsePositiveInteger(elements.sampleSize.value, "Total sample size", errors);
  const startNumber = parsePositiveInteger(elements.startNumber.value, "Starting number", errors);
  const seed = elements.seed.value.trim() || `seed-${Date.now()}`;
  const idPrefix = elements.idPrefix.value.trim() || "P";
  const arms = parseList(elements.arms.value);
  const ratios = parseList(elements.ratios.value).map((value) => Number.parseInt(value, 10));

  if (arms.length < 2) {
    errors.push("Treatment arms must include at least two arms.");
  }

  if (ratios.length !== arms.length) {
    errors.push("Allocation ratio count must match the number of treatment arms.");
  }

  if (ratios.some((ratio) => !Number.isInteger(ratio) || ratio < 1)) {
    errors.push("Allocation ratios must be positive integers.");
  }

  const ratioSum = ratios.reduce((sum, value) => sum + value, 0);
  let blockSizes = [];

  if (needsBlock(method)) {
    const enteredBlockSizes = [...elements.blockSizes].map((input) => input.value.trim()).filter(Boolean);
    blockSizes = enteredBlockSizes.map((value) => Number(value));

    if (!enteredBlockSizes.length) {
      errors.push("Enter at least 1 block size. You can use 1, 2, or 3 block-size options.");
    }

    if (blockSizes.some((size) => !Number.isInteger(size) || size < 1)) {
      errors.push("Block sizes must be positive integers.");
    }

    const uniqueSizes = new Set(blockSizes);
    if (uniqueSizes.size !== blockSizes.length) {
      errors.push("Entered block sizes should be different.");
    }

    const invalidSizes = blockSizes.filter((size) => Number.isInteger(size) && ratioSum > 0 && size % ratioSum !== 0);
    if (invalidSizes.length) {
      errors.push(`Block sizes must be multiples of the allocation ratio total (${ratioSum}). Invalid: ${invalidSizes.join(", ")}.`);
    }
  }

  return {
    method,
    sampleSize,
    seed,
    idPrefix,
    startNumber,
    arms,
    ratios,
    ratioSum,
    blockSizes,
    errors
  };
}

function getStratificationVariables() {
  const variables = [];
  const errors = [];

  elements.strataNames.forEach((nameInput, index) => {
    const name = nameInput.value.trim();
    const levels = parseList(elements.strataLevels[index].value);

    if (!name && levels.length) {
      errors.push(`Variable ${index + 1} has levels but no name.`);
    }

    if (name && levels.length < 2) {
      errors.push(`${name} must have at least two levels.`);
    }

    if (name && levels.length >= 2) {
      variables.push({ name, levels });
    }
  });

  if (variables.length > 4) {
    errors.push("Use a maximum of 4 stratification variables.");
  }

  return { variables, errors };
}

function cartesianProduct(variables) {
  return variables.reduce(
    (rows, variable) =>
      rows.flatMap((row) =>
        variable.levels.map((level) => ({
          ...row,
          [variable.name]: level
        }))
      ),
    [{}]
  );
}

function distributeCounts(total, numberOfStrata) {
  const base = Math.floor(total / numberOfStrata);
  const remainder = total % numberOfStrata;
  return Array.from({ length: numberOfStrata }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildStrata(showToastMessage = true) {
  const config = getConfig();
  const { variables, errors } = getStratificationVariables();
  const allErrors = [...config.errors, ...errors];

  if (!variables.length) {
    allErrors.push("Add at least one stratification variable.");
  }

  if (allErrors.length) {
    renderMessages(allErrors, []);
    state.strataVariables = [];
    state.strata = [];
    renderStrataTable();
    return false;
  }

  const combinations = cartesianProduct(variables);
  const counts = distributeCounts(config.sampleSize, combinations.length);

  state.strataVariables = variables;
  state.strata = combinations.map((values, index) => ({
    id: `S${String(index + 1).padStart(3, "0")}`,
    values,
    count: counts[index]
  }));

  renderStrataTable();

  if (showToastMessage) {
    showToast(`${state.strata.length} strata built`);
  }

  return true;
}

function renderStrataTable() {
  elements.strataCount.textContent = `${state.strata.length} strata`;

  if (!state.strata.length) {
    elements.strataTableWrap.hidden = true;
    elements.strataHeadRow.innerHTML = "";
    elements.strataBody.innerHTML = "";
    return;
  }

  elements.strataTableWrap.hidden = false;
  elements.strataHeadRow.innerHTML = [
    "<th>Stratum</th>",
    ...state.strataVariables.map((variable) => `<th>${escapeHtml(variable.name)}</th>`),
    "<th>n</th>"
  ].join("");

  elements.strataBody.innerHTML = state.strata
    .map(
      (stratum, index) => `
        <tr>
          <td>${stratum.id}</td>
          ${state.strataVariables.map((variable) => `<td>${escapeHtml(stratum.values[variable.name])}</td>`).join("")}
          <td><input type="number" min="0" value="${stratum.count}" data-stratum-count="${index}" aria-label="${stratum.id} count" /></td>
        </tr>
      `
    )
    .join("");
}

function readStrataCounts() {
  const inputs = elements.strataBody.querySelectorAll("[data-stratum-count]");
  inputs.forEach((input) => {
    const index = Number.parseInt(input.dataset.stratumCount, 10);
    const value = Math.max(0, Number.parseInt(input.value, 10) || 0);
    state.strata[index].count = value;
    input.value = value;
  });
}

function makeBlockRows(count, config, rng, stratumBlockPrefix = "") {
  const rows = [];
  const warnings = [];
  let blockNumber = 0;
  let lastBlockWasTruncated = false;

  while (rows.length < count) {
    blockNumber += 1;
    const blockSize = config.blockSizes[Math.floor(rng() * config.blockSizes.length)];
    const multiplier = blockSize / config.ratioSum;
    const blockPool = [];

    config.arms.forEach((arm, armIndex) => {
      for (let i = 0; i < config.ratios[armIndex] * multiplier; i += 1) {
        blockPool.push(arm);
      }
    });

    const shuffledBlock = shuffle(blockPool, rng);
    shuffledBlock.forEach((allocation, index) => {
      rows.push({
        allocation,
        block: `${stratumBlockPrefix}${blockNumber}`,
        blockSize,
        sequenceInBlock: index + 1
      });
    });

    lastBlockWasTruncated = rows.length > count;
  }

  if (lastBlockWasTruncated) {
    warnings.push("The final block was truncated because sample size was not an exact sum of selected block sizes.");
  }

  return { rows: rows.slice(0, count), warnings };
}

function makeSimpleRows(count, config, rng) {
  return Array.from({ length: count }, () => ({
    allocation: sampleOneWeighted(config.arms, config.ratios, rng),
    block: "",
    blockSize: "",
    sequenceInBlock: ""
  }));
}

function formatParticipantId(prefix, startNumber, index, total) {
  const width = Math.max(3, String(startNumber + total - 1).length);
  return `${prefix}${String(startNumber + index).padStart(width, "0")}`;
}

function stratumLabel(stratum, variables) {
  if (!stratum) {
    return "";
  }

  return variables.map((variable) => `${variable.name}=${stratum.values[variable.name]}`).join("; ");
}

function generateSchedule(config) {
  const rng = createRng(config.seed);
  const schedule = [];
  const warnings = [];
  let totalRows = 0;

  if (needsStrata(config.method)) {
    if (!state.strata.length && !buildStrata(false)) {
      return { schedule: [], warnings };
    }

    readStrataCounts();
    const stratumTotal = state.strata.reduce((sum, stratum) => sum + stratum.count, 0);

    if (stratumTotal !== config.sampleSize) {
      warnings.push(`Stratum counts sum to ${stratumTotal}; total sample size is ${config.sampleSize}. The exported schedule uses the stratum-count total.`);
    }

    state.strata.forEach((stratum) => {
      if (stratum.count < 1) {
        return;
      }

      const generated = needsBlock(config.method)
        ? makeBlockRows(stratum.count, config, rng, `${stratum.id}-B`)
        : { rows: makeSimpleRows(stratum.count, config, rng), warnings: [] };

      warnings.push(...generated.warnings.map((warning) => `${stratum.id}: ${warning}`));

      generated.rows.forEach((row) => {
        schedule.push({
          ...row,
          stratumId: stratum.id,
          stratumLabel: stratumLabel(stratum, state.strataVariables),
          strataValues: { ...stratum.values }
        });
      });

      totalRows += stratum.count;
    });
  } else {
    const generated = needsBlock(config.method)
      ? makeBlockRows(config.sampleSize, config, rng, "B")
      : { rows: makeSimpleRows(config.sampleSize, config, rng), warnings: [] };

    warnings.push(...generated.warnings);

    generated.rows.forEach((row) => {
      schedule.push({
        ...row,
        stratumId: "",
        stratumLabel: "",
        strataValues: {}
      });
    });

    totalRows = config.sampleSize;
  }

  schedule.forEach((row, index) => {
    row.sequence = index + 1;
    row.participantId = formatParticipantId(config.idPrefix, config.startNumber, index, totalRows);
    row.method = methodLabel(config.method);
  });

  return { schedule, warnings };
}

function methodLabel(method) {
  const labels = {
    simple: "Simple Randomization",
    block: "Block Randomization",
    stratified: "Stratified Randomization",
    "stratified-block": "Stratified Block Randomization"
  };
  return labels[method] || method;
}

function renderSchedule(config, schedule, warnings) {
  state.schedule = schedule;
  state.warnings = warnings;
  state.lastConfig = config;

  elements.exportButton.disabled = schedule.length === 0;
  elements.copyButton.disabled = schedule.length === 0;
  elements.metricTotal.textContent = schedule.length;
  elements.metricStrata.textContent = needsStrata(config.method) ? state.strata.filter((stratum) => stratum.count > 0).length : 0;
  elements.metricBlocks.textContent = schedule.filter((row, index, rows) => row.block && rows.findIndex((candidate) => candidate.block === row.block) === index).length;
  elements.metricSeed.textContent = config.seed;

  renderMessages([], warnings);
  renderBalance(config, schedule);
  renderResultTable(config, schedule);
}

function renderMessages(errors, warnings, successMessage = "") {
  const messages = [
    ...errors.map((message) => ({ type: "error", message })),
    ...warnings.map((message) => ({ type: "warning", message }))
  ];

  if (successMessage) {
    messages.push({ type: "success", message: successMessage });
  }

  elements.messages.innerHTML = messages.map((item) => `<div class="message ${item.type}">${escapeHtml(item.message)}</div>`).join("");
}

function renderBalance(config, schedule) {
  const counts = new Map(config.arms.map((arm) => [arm, 0]));
  schedule.forEach((row) => {
    counts.set(row.allocation, (counts.get(row.allocation) || 0) + 1);
  });

  const max = Math.max(1, ...counts.values());
  elements.balanceCaption.textContent = schedule.length ? `${schedule.length} assignments generated` : "No schedule generated";

  elements.balanceBars.innerHTML = [...counts.entries()]
    .map(([arm, count]) => {
      const percent = Math.round((count / max) * 100);
      const share = schedule.length ? Math.round((count / schedule.length) * 1000) / 10 : 0;
      return `
        <div class="balance-row">
          <div class="balance-label">${escapeHtml(arm)}</div>
          <div class="balance-track"><span class="balance-fill" style="width:${percent}%"></span></div>
          <div class="balance-value">${count} (${share}%)</div>
        </div>
      `;
    })
    .join("");
}

function resultColumns(config) {
  const baseColumns = [
    { key: "sequence", label: "Seq" },
    { key: "participantId", label: "Participant ID" },
    { key: "allocation", label: "Allocation" },
    { key: "method", label: "Method" }
  ];

  const strataColumns = needsStrata(config.method)
    ? [
        { key: "stratumId", label: "Stratum" },
        ...state.strataVariables.map((variable) => ({
          key: `strata:${variable.name}`,
          label: variable.name
        }))
      ]
    : [];

  const blockColumns = needsBlock(config.method)
    ? [
        { key: "block", label: "Block" },
        { key: "blockSize", label: "Block size" },
        { key: "sequenceInBlock", label: "Within block" }
      ]
    : [];

  return [...baseColumns, ...strataColumns, ...blockColumns];
}

function renderResultTable(config, schedule) {
  const columns = resultColumns(config);
  elements.resultHead.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>`;

  if (!schedule.length) {
    elements.resultBody.innerHTML = `<tr><td colspan="${columns.length}"><div class="empty-state">No rows generated</div></td></tr>`;
    elements.tableCaption.textContent = "Generate a schedule to preview rows";
    return;
  }

  const renderedRows = schedule.slice(0, MAX_RENDERED_ROWS);
  elements.tableCaption.textContent =
    schedule.length > MAX_RENDERED_ROWS ? `Showing first ${MAX_RENDERED_ROWS} of ${schedule.length} rows` : `${schedule.length} rows`;

  elements.resultBody.innerHTML = renderedRows
    .map(
      (row) => `
        <tr>
          ${columns
            .map((column) => {
              const value = cellValue(row, column);
              if (column.key === "allocation") {
                return `<td><span class="allocation-chip">${escapeHtml(value)}</span></td>`;
              }
              return `<td>${escapeHtml(value)}</td>`;
            })
            .join("")}
        </tr>
      `
    )
    .join("");
}

function cellValue(row, column) {
  if (column.key.startsWith("strata:")) {
    const variableName = column.key.slice("strata:".length);
    return row.strataValues[variableName] ?? "";
  }

  return row[column.key] ?? "";
}

function toCsv(config, schedule) {
  const columns = resultColumns(config);
  const header = columns.map((column) => column.label);
  const lines = [header, ...schedule.map((row) => columns.map((column) => cellValue(row, column)))];
  return lines.map((line) => line.map(csvEscape).join(",")).join("\r\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function exportCsv() {
  if (!state.schedule.length || !state.lastConfig) {
    showToast("Generate a schedule first");
    return;
  }

  const csv = toCsv(state.lastConfig, state.schedule);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rct-randomization-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV exported");
}

async function copyCsv() {
  if (!state.schedule.length || !state.lastConfig) {
    showToast("Generate a schedule first");
    return;
  }

  const csv = toCsv(state.lastConfig, state.schedule);

  try {
    await navigator.clipboard.writeText(csv);
    showToast("Schedule copied");
  } catch (error) {
    showToast("Clipboard permission unavailable");
  }
}

function updateConditionalPanels() {
  const method = getMethod();
  elements.blockPanel.classList.toggle("active", needsBlock(method));
  elements.strataPanel.classList.toggle("active", needsStrata(method));
}

function resetExample() {
  document.querySelector('input[name="method"][value="stratified-block"]').checked = true;
  elements.sampleSize.value = "120";
  elements.seed.value = "RCT-2026-001";
  elements.idPrefix.value = "P";
  elements.startNumber.value = "1";
  elements.arms.value = "Control, Intervention";
  elements.ratios.value = "1, 1";
  const defaults = ["4", "6", "8"];
  elements.blockSizes.forEach((input, index) => {
    input.value = defaults[index];
  });
  elements.strataNames[0].value = "Site";
  elements.strataLevels[0].value = "A, B, C";
  elements.strataNames[1].value = "Sex";
  elements.strataLevels[1].value = "Female, Male";
  elements.strataNames[2].value = "";
  elements.strataLevels[2].value = "";
  elements.strataNames[3].value = "";
  elements.strataLevels[3].value = "";
  state.strata = [];
  state.strataVariables = [];
  updateConditionalPanels();
  buildStrata(false);
  generateFromCurrentForm("Example schedule generated.");
}

function generateFromCurrentForm(successMessage = "") {
  const config = getConfig();

  if (needsStrata(config.method) && !state.strata.length) {
    buildStrata(false);
  }

  const errors = [...config.errors];
  if (needsStrata(config.method)) {
    const { errors: strataErrors } = getStratificationVariables();
    errors.push(...strataErrors);
    if (!state.strata.length) {
      errors.push("Build strata before generating a stratified schedule.");
    } else {
      readStrataCounts();
      const stratumTotal = state.strata.reduce((sum, stratum) => sum + stratum.count, 0);
      if (stratumTotal < 1) {
        errors.push("At least one stratum must have a sample size above 0.");
      }
    }
  }

  if (errors.length) {
    renderMessages(errors, []);
    return false;
  }

  const { schedule, warnings } = generateSchedule(config);
  renderSchedule(config, schedule, warnings);
  renderMessages([], warnings, successMessage || `${schedule.length} assignments generated.`);
  return true;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.methodInputs.forEach((input) => {
  input.addEventListener("change", updateConditionalPanels);
});

elements.buildStrataButton.addEventListener("click", () => {
  buildStrata(true);
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  generateFromCurrentForm();
});

elements.resetButton.addEventListener("click", resetExample);
elements.exportButton.addEventListener("click", exportCsv);
elements.copyButton.addEventListener("click", copyCsv);

[elements.sampleSize, elements.arms, elements.ratios, ...elements.strataNames, ...elements.strataLevels].forEach((input) => {
  input.addEventListener("change", () => {
    if (needsStrata(getMethod())) {
      state.strata = [];
      state.strataVariables = [];
      renderStrataTable();
    }
  });
});

updateConditionalPanels();
resetExample();
