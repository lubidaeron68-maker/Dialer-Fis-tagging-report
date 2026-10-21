/**
 * Central guard rails for multi-file loading.
 *
 * Browsers give a single tab a limited JS heap (often 1–4 GB). A 50 MB .xlsx
 * can expand to 300–600 MB of live JS objects once parsed, so accepting
 * "unlimited" files is what actually causes the crash. These budgets keep the
 * total well inside a safe envelope instead of guessing after the OOM.
 */

/** Total bytes of raw file input allowed across ALL loaded datasets. */
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB

/** Never accept a single file larger than the whole pool. */
export const MAX_SINGLE_FILE_BYTES = MAX_TOTAL_BYTES;

/** Hard ceiling on total parsed records across all datasets (JS object safety). */
export const MAX_TOTAL_ROWS = 600_000;

/** Safety valve per file — prevents one giant sheet from eating the heap. */
export const MAX_ROWS_PER_FILE = 300_000;

/** Maximum number of tabs. Kept in sync with the byte/row budgets. */
export const MAX_DATASETS = 12;

/** Rows processed per chunk before yielding back to the UI thread. */
export const PARSE_CHUNK_SIZE = 4_000;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRows(rows: number): string {
  return new Intl.NumberFormat('en-US').format(rows);
}

export interface DatasetUsage {
  bytes: number;
  rows: number;
}

export interface BudgetUsage {
  usedBytes: number;
  usedRows: number;
  fileCount: number;
}

export function getUsage(datasets: DatasetUsage[]): BudgetUsage {
  return {
    usedBytes: datasets.reduce((s, d) => s + d.bytes, 0),
    usedRows: datasets.reduce((s, d) => s + d.rows, 0),
    fileCount: datasets.length,
  };
}

export interface AdmissionCheck {
  ok: boolean;
  /** Files that fit and should be loaded, in order. */
  accepted: File[];
  /** Human-readable reasons for anything rejected. */
  rejections: string[];
  /** Set when nothing can be loaded. */
  reason?: string;
}

/**
 * Decide which of the incoming files fit inside the remaining budget.
 * Files are admitted largest-first so a user dropping several files keeps the
 * most valuable ones instead of losing everything to an arbitrary order.
 */
export function checkAdmission(
  files: File[],
  used: BudgetUsage
): AdmissionCheck {
  const rejections: string[] = [];
  const accepted: File[] = [];

  let bytes = used.usedBytes;
  let rows = used.usedRows;

  const sorted = [...files].sort((a, b) => b.size - a.size);

  for (const file of sorted) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      rejections.push(`${file.name}: unsupported type (use .xlsx, .xls or .csv)`);
      continue;
    }
    if (file.size > MAX_SINGLE_FILE_BYTES) {
      rejections.push(`${file.name}: ${formatBytes(file.size)} is over the ${formatBytes(MAX_SINGLE_FILE_BYTES)} pool`);
      continue;
    }
    if (used.fileCount + accepted.length >= MAX_DATASETS) {
      rejections.push(`${file.name}: tab limit of ${MAX_DATASETS} files reached`);
      continue;
    }
    if (bytes + file.size > MAX_TOTAL_BYTES) {
      rejections.push(
        `${file.name}: would exceed the ${formatBytes(MAX_TOTAL_BYTES)} pool (${formatBytes(bytes)} already used)`
      );
      continue;
    }
    // Rough row projection: 28 columns of mixed data ≈ 1 row per 210 bytes.
    const projectedRows = Math.ceil(file.size / 210);
    if (rows + projectedRows > MAX_TOTAL_ROWS) {
      rejections.push(
        `${file.name}: would push the total past ${formatRows(MAX_TOTAL_ROWS)} records`
      );
      continue;
    }
    accepted.push(file);
    bytes += file.size;
    rows += projectedRows;
  }

  let reason: string | undefined;
  if (accepted.length === 0) {
    reason =
      rejections[0] ??
      `Not enough of the ${formatBytes(MAX_TOTAL_BYTES)} pool left. Remove a tab and try again.`;
  }

  return { ok: accepted.length > 0, accepted, rejections, reason };
}

/** Fraction of the byte pool consumed, 0..1 (clamped). */
export function poolPressure(usedBytes: number): number {
  return Math.min(1, Math.max(0, usedBytes / MAX_TOTAL_BYTES));
}

/**
 * How much headroom the heap looks to have right now. Uses the performance
 * memory API where available (Chromium) so we can refuse work before the OOM.
 */
export function heapHeadroom(): { available: boolean; pressure: number } {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (!perf.memory) return { available: false, pressure: 0 };
  const { usedJSHeapSize, jsHeapSizeLimit } = perf.memory;
  return { available: true, pressure: Math.min(1, usedJSHeapSize / jsHeapSizeLimit) };
}

/**
 * Refuse a new load when the heap is already near its limit. Being cautious
 * here is what stops the "Aw, Snap" white screen.
 */
export function heapLooksExhausted(): boolean {
  const { available, pressure } = heapHeadroom();
  return available && pressure > 0.85;
}
