const SUPPORTED_EXTENSIONS = ["TXT", "MD", "CSV", "TSV", "JSON", "XLS", "XLSX"];

export const BUSINESS_MATERIAL_ACCEPT = ".txt,.md,.markdown,.csv,.tsv,.json,.xls,.xlsx,text/plain,text/markdown,text/csv,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const BUSINESS_MATERIAL_MAX_CHARS = 30000;

function fileExtension(fileName) {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

function pushDelimitedCell(rows, row, cell) {
  row.push(cell.trim());
  if (row.some((value) => value)) rows.push(row);
}

/** Parse quoted CSV/TSV cells without relying on browser-specific APIs. */
export function parseDelimitedRows(value = "", delimiter = ",") {
  const source = String(value || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      pushDelimitedCell(rows, row, cell);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }
  if (cell || row.length) pushDelimitedCell(rows, row, cell);
  return rows;
}

function formatTableRows(rows = []) {
  const normalized = rows
    .map((row) => (Array.isArray(row) ? row.map((value) => String(value ?? "").trim()) : []))
    .filter((row) => row.some(Boolean));
  if (!normalized.length) return "";
  const headers = normalized[0];
  const hasHeaders = normalized.length > 1 && headers.length > 1 && headers.some(Boolean);
  const dataRows = hasHeaders ? normalized.slice(1) : normalized;
  return dataRows.map((row) => {
    const values = row
      .map((value, index) => {
        if (!value) return "";
        if (!hasHeaders) return value;
        return `${headers[index] || `第${index + 1}列`}：${value}`;
      })
      .filter(Boolean);
    return values.join(hasHeaders ? "；" : "，");
  }).filter(Boolean).join("\n");
}

function parseJsonMaterial(value) {
  const parsed = JSON.parse(String(value || "").replace(/^\uFEFF/, ""));
  if (typeof parsed === "string") return parsed.trim();
  return JSON.stringify(parsed, null, 2);
}

function importedMaterialError(message, code = "BUSINESS_MATERIAL_IMPORT_ERROR") {
  return Object.assign(new Error(message), { code });
}

/** Read and turn supported business-material files into editable plain text. */
export async function readBusinessMaterialFile(file) {
  if (!file) throw importedMaterialError("请选择一个资料文件。", "BUSINESS_MATERIAL_FILE_MISSING");
  const name = String(file.name || "未命名文件");
  const extension = fileExtension(name);
  let content = "";
  let rowCount = 0;

  if (["txt", "md", "markdown"].includes(extension)) {
    content = String(await file.text()).replace(/^\uFEFF/, "").trim();
  } else if (["csv", "tsv"].includes(extension)) {
    const raw = await file.text();
    const rows = parseDelimitedRows(raw, extension === "tsv" ? "\t" : ",");
    rowCount = rows.length;
    content = formatTableRows(rows);
  } else if (extension === "json") {
    content = parseJsonMaterial(await file.text()).trim();
  } else if (["xls", "xlsx"].includes(extension)) {
    const XLSX = await import("../../../node_modules/xlsx/xlsx.mjs");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sections = workbook.SheetNames.map((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      rowCount += rows.length;
      const text = formatTableRows(rows);
      return text ? `【${sheetName}】\n${text}` : "";
    }).filter(Boolean);
    content = sections.join("\n\n");
  } else {
    throw importedMaterialError(`暂支持 ${SUPPORTED_EXTENSIONS.join("、")} 文件。`, "BUSINESS_MATERIAL_FILE_TYPE_UNSUPPORTED");
  }

  if (!content) throw importedMaterialError("这个文件里没有找到可导入的文字内容。", "BUSINESS_MATERIAL_FILE_EMPTY");
  if (content.length > BUSINESS_MATERIAL_MAX_CHARS) {
    throw importedMaterialError(`资料超过 ${BUSINESS_MATERIAL_MAX_CHARS} 字，请拆分后导入。`, "BUSINESS_MATERIAL_TOO_LARGE");
  }
  return { name, extension, content, rowCount, charCount: content.length };
}
