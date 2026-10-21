declare module 'react/jsx-runtime' {
  export function jsx(type: any, props: any, key?: string | null): any;
  export function jsxs(type: any, props: any, key?: string | null): any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

import { useState, useCallback, useMemo, useRef, useEffect, type ChangeEvent } from 'react';
import {
  LayoutDashboard,
  Upload,
  BarChart3,
  Table2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Files,
  HardDrive,
  Filter,
  X,
} from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { KPICards } from './components/KPICards';
import { SummaryStrip } from './components/SummaryStrip';
import {
  AgentPerformanceChart,
  ContactTypeChart,
  CompanyBreakdownChart,
  DepartmentChart,
  PTPStatusChart,
  CallDurationChart,
  AgentPTPChart,
} from './components/Charts';
import { HourlyComparisonCharts } from './components/HourlyComparisonCharts';
import { DataTable } from './components/DataTable';
import { ThemeToggle } from './components/ThemeToggle';
import { DatasetTabs } from './components/DatasetTabs';
import { CompareView } from './components/CompareView';
import { MultiDepartmentFilter } from './components/MultiDepartmentFilter';
import { useTheme } from './hooks/useTheme';
import { parseExcelFile, ParseError } from './utils/excelParser';
import { processData } from './utils/dataProcessor';
import { generateSampleData } from './utils/sampleData';
import {
  MAX_DATASETS,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_ROWS,
  checkAdmission,
  formatBytes,
  formatRows,
  getUsage,
  heapLooksExhausted,
} from './utils/memoryBudget';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { CollectionRecord, ParseProgress, Dataset } from './types';
import { cn } from './utils/cn';

const DATASET_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316', '#14b8a6', '#e879f9', '#22c55e', '#fb7185', '#38bdf8'];

function makeId(): string {
  return `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatUploadedLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getDateRangeLabel(records: CollectionRecord[]): string {
  const dates = records.map((r) => r.date).filter(Boolean).sort();
  if (dates.length === 0) return '';
  const min = dates[0];
  const max = dates[dates.length - 1];
  const fmtDay = (s: string) => {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  if (min === max) {
    const d = new Date(min);
    if (isNaN(d.getTime())) return min;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const maxDate = new Date(max);
  const year = isNaN(maxDate.getTime()) ? '' : `, ${maxDate.getFullYear()}`;
  return `${fmtDay(min)} → ${fmtDay(max)}${year}`;
}

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'records'>('overview');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDataset: Dataset | null = useMemo(() => {
    if (datasets.length === 0) return null;
    return datasets.find((d) => d.id === activeDatasetId) ?? datasets[0];
  }, [datasets, activeDatasetId]);

  const memoizedData = activeDataset?.data ?? null;
  const fileName = activeDataset?.fileName ?? null;
  const loadStats = activeDataset ? { rowCount: activeDataset.rowCount, durationMs: activeDataset.durationMs } : null;
  const isUploadView = datasets.length === 0;

  // Departments selected on the Analytics tab — drives KPIs + every chart.
  const [analyticsDepts, setAnalyticsDepts] = useState<string[]>([]);

  // Reset the department filter whenever the viewed file changes.
  useEffect(() => {
    setAnalyticsDepts([]);
  }, [activeDataset?.id]);

  // Analytics data scoped to the selected departments (full data when none/all).
  const analyticsData = useMemo(() => {
    if (!memoizedData) return null;
    if (analyticsDepts.length === 0 || analyticsDepts.length === memoizedData.departments.length) {
      return memoizedData;
    }
    const deptSet = new Set(analyticsDepts);
    const filtered = memoizedData.records.filter((r) => deptSet.has(r.department));
    return processData(filtered);
  }, [memoizedData, analyticsDepts]);

  const analyticsIsFiltered =
    memoizedData !== null &&
    analyticsDepts.length > 0 &&
    analyticsDepts.length < memoizedData.departments.length;

  const analyticsScopeLabel = analyticsIsFiltered
    ? analyticsDepts.length === 1
      ? `Dept: ${analyticsDepts[0]}`
      : `${analyticsDepts.length} departments selected`
    : 'All departments';

  const buildDataset = useCallback(
    (
      records: CollectionRecord[],
      name: string,
      durationMs: number,
      colorIndex: number,
      meta: { bytes: number; truncated: boolean; totalRowsInFile: number; sheetName: string }
    ): Dataset => {
      const processed = processData(records);
      const now = new Date();
      return {
        id: makeId(),
        fileName: name,
        uploadedAt: now.toISOString(),
        uploadedLabel: formatUploadedLabel(now),
        data: processed,
        rowCount: records.length,
        durationMs,
        color: DATASET_COLORS[colorIndex % DATASET_COLORS.length],
        dateRangeLabel: getDateRangeLabel(records),
        bytes: meta.bytes,
        truncated: meta.truncated,
        totalRowsInFile: meta.totalRowsInFile,
        sheetName: meta.sheetName,
      };
    },
    []
  );

  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      if (isLoading) return;

      // Guard 1: heap already near its ceiling — refuse before doing damage.
      if (heapLooksExhausted()) {
        setError(
          'Browser memory is almost full. Remove one or more tabs, then try loading again.'
        );
        setTimeout(() => setError(null), 8000);
        return;
      }

      // Guard 2: admit files against the 50 MB / row / tab budgets.
      const usage = getUsage(datasets.map((d) => ({ bytes: d.bytes, rows: d.rowCount })));
      const admission = checkAdmission(files, usage);
      if (!admission.ok) {
        setError(admission.reason ?? 'No files could be loaded within the memory budget.');
        setTimeout(() => setError(null), 8000);
        return;
      }

      setIsLoading(true);
      setError(null);

      const toLoad = admission.accepted;
      const newDatasets: Dataset[] = [];
      const failures: string[] = [...admission.rejections];
      const startedRowCount = usage.usedRows;

      for (let i = 0; i < toLoad.length; i++) {
        const file = toLoad[i];
        const tag = toLoad.length > 1 ? `[${i + 1}/${toLoad.length}] ${file.name}` : file.name;
        setProgress({ stage: 'reading', percent: 5, message: `Starting ${tag}...` });
        const startTime = performance.now();
        try {
          const result = await parseExcelFile(file, (p) => {
            setProgress({
              ...p,
              message: toLoad.length > 1 ? `${tag}: ${p.message}` : p.message,
            });
          });

          if (result.records.length === 0) {
            failures.push(`${file.name}: no data rows found`);
            continue;
          }

          // Guard 3: stop mid-batch if the row budget would be blown.
          if (startedRowCount + newDatasets.reduce((s, d) => s + d.rowCount, 0) + result.records.length > MAX_TOTAL_ROWS) {
            failures.push(`${file.name}: skipped to stay under ${formatRows(MAX_TOTAL_ROWS)} total records`);
            break;
          }

          const durationMs = Math.round(performance.now() - startTime);
          const ds = buildDataset(
            result.records,
            file.name,
            durationMs,
            datasets.length + newDatasets.length,
            {
              bytes: file.size,
              truncated: result.truncated,
              totalRowsInFile: result.totalRowsInFile,
              sheetName: result.sheetName,
            }
          );
          newDatasets.push(ds);

          if (result.truncated) {
            failures.push(
              `${file.name}: loaded the first ${formatRows(result.records.length)} of ${formatRows(result.totalRowsInFile)} rows (per-file cap)`
            );
          }
          if (result.usedFallbackSheet) {
            failures.push(`${file.name}: used sheet "${result.sheetName}" (first sheet had no matching columns)`);
          }

          // Give the GC a beat between multi-file loads.
          await new Promise((resolve) => setTimeout(resolve, 0));
        } catch (err) {
          // ParseError messages are user-facing; anything else gets a safe generic text.
          const message =
            err instanceof ParseError
              ? err.message
              : 'could not be processed (unsupported or damaged file)';
          failures.push(`${file.name}: ${message}`);
        }
      }

      if (newDatasets.length > 0) {
        setDatasets((prev) => [...prev, ...newDatasets]);
        setActiveDatasetId(newDatasets[0].id);
        setIsCompareMode(false);
        setActiveTab('overview');
      }
      if (failures.length > 0) {
        setError(
          newDatasets.length === 0
            ? failures.join(' | ')
            : `Loaded ${newDatasets.length} file(s). Notes: ${failures.join(' | ')}`
        );
        setTimeout(() => setError(null), 9000);
      }
      setIsLoading(false);
      setProgress(null);
    },
    [isLoading, datasets, buildDataset]
  );

  const handleFileUpload = useCallback(
    (file: File) => {
      void handleFilesUpload([file]);
    },
    [handleFilesUpload]
  );

  const handleLoadSample = useCallback(() => {
    if (isLoading) return;
    if (datasets.length >= MAX_DATASETS) {
      setError(`You can load up to ${MAX_DATASETS} files at a time. Remove a tab to add more.`);
      setTimeout(() => setError(null), 6000);
      return;
    }
    const n = datasets.length + 1;
    const sampleRecords = generateSampleData(250);
    const ds = buildDataset(sampleRecords, `Sample Data ${n} (Demo)`, 45, datasets.length, {
      bytes: 0,
      truncated: false,
      totalRowsInFile: sampleRecords.length,
      sheetName: 'Generated',
    });
    setDatasets((prev) => [...prev, ds]);
    setActiveDatasetId(ds.id);
    setIsCompareMode(false);
    setActiveTab('overview');
    setError(null);
  }, [isLoading, datasets.length, buildDataset]);

  const handleRemoveDataset = useCallback(
    (id: string) => {
      setDatasets((prev) => {
        const next = prev.filter((d) => d.id !== id);
        if (next.length < 2) setIsCompareMode(false);
        if (activeDatasetId === id) {
          setActiveDatasetId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [activeDatasetId]
  );

  const handleClear = useCallback(() => {
    setDatasets([]);
    setActiveDatasetId(null);
    setIsCompareMode(false);
    setError(null);
    setProgress(null);
    setActiveTab('overview');
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
    setTimeout(() => setError(null), 5000);
  }, []);

  const handleAddClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDashboardFilesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) void handleFilesUpload(files);
      e.target.value = '';
    },
    [handleFilesUpload]
  );

  const handleSelectDataset = useCallback((id: string) => {
    setActiveDatasetId(id);
    setIsCompareMode(false);
  }, []);

  const handleSelectCompare = useCallback(() => {
    if (datasets.length >= 2) setIsCompareMode(true);
  }, [datasets.length]);

  // ============================ UPLOAD VIEW ============================
  if (isUploadView) {
    return (
      <ErrorBoundary onReset={handleClear}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 transition-colors duration-200 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/40">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200 dark:shadow-indigo-950">
                  <LayoutDashboard className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">Collections Dashboard</h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Upload your Excel files to get started</p>
                </div>
              </div>
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-800">
              <Sparkles className="h-4 w-4" />
              Multi-File 12-Hour Analytics + Compare
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Dump Your Collections Files
            </h2>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
              Drop <span className="font-bold text-indigo-600 dark:text-indigo-400">one or many</span> Excel files at
              once. Each file gets its own uniquely-dated tab — then pit any two against each other in the{' '}
              <span className="font-bold">Compare</span> tab.
            </p>
            <div className="mx-auto mt-5 flex max-w-xl items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900">
                <HardDrive className="h-3.5 w-3.5" />
                {formatBytes(MAX_TOTAL_BYTES)} multi-file pool
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900">
                up to {MAX_DATASETS} tabs
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-4 py-1.5 text-xs font-bold text-purple-700 ring-1 ring-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:ring-purple-900">
                {formatRows(MAX_TOTAL_ROWS)} record ceiling
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 transition-colors duration-200 dark:bg-slate-900/95 dark:ring-slate-800">
            <FileUpload
              onFileLoad={handleFileUpload}
              onFilesLoad={handleFilesUpload}
              onError={handleError}
              isLoading={isLoading}
              progress={progress}
              fileName={null}
              onClear={handleClear}
              onLoadSample={handleLoadSample}
            />
          </div>

          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-colors duration-200 dark:bg-slate-900/95 dark:ring-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Expected Excel Columns (28 Fields)
              </h3>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                Auto-Converts "21-10-2026 22:01:10" to 12-Hour Format
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {[
                'Company name', 'Agreement id', 'Credit assignment date', 'Department',
                'Initial DPD', 'Actual DPD', 'Agent login', 'Agent name',
                'Action type', 'Contact type', 'Action result', 'Overdue reason',
                'Date', 'Execution dtime (12-Hr)', 'Dialed phone', 'Requested payment channel',
                'PTP status', 'PTP due date', 'PTP amount', 'PTP paid amount',
                'Payment plan summary', 'Payment plan status', 'Payment plan target amount', 'Payment plan paid amount',
                'Payment plan not paid amount', 'Agents note', 'Call duration, minutes', 'Additional action',
              ].map((col) => (
                <div
                  key={col}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 transition-colors dark:bg-slate-800/60"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                  <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{col}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { icon: Files, title: 'Multi-File Tabs', desc: 'Dump many files — each gets a dated tab + color' },
              { icon: BarChart3, title: 'A-vs-B Compare', desc: 'KPI deltas, charts & agent face-off per file' },
              { icon: Upload, title: 'Large File Engine', desc: 'Optimized for 10,000+ KB files without crashing' },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-200 transition-colors duration-200 dark:bg-slate-900/95 dark:ring-slate-800"
              >
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/60">
                  <feature.icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{feature.title}</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
      </ErrorBoundary>
    );
  }

  // ============================ DASHBOARD VIEW ============================
  return (
    <ErrorBoundary onReset={handleClear}>
    <div className="min-h-screen bg-slate-100 transition-colors duration-200 dark:bg-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-sm transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200 dark:shadow-indigo-950">
                <LayoutDashboard className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">Collections Dashboard</h1>
                  {loadStats && !isCompareMode && (
                    <span className="hidden items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 sm:inline-flex">
                      <Sparkles className="h-3 w-3" />
                      {loadStats.rowCount.toLocaleString()} rows in {(loadStats.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {isCompareMode && (
                    <span className="hidden items-center gap-1 rounded-full bg-gradient-to-r from-indigo-600 to-pink-600 px-2 py-0.5 text-[11px] font-bold text-white sm:inline-flex">
                      Compare mode
                    </span>
                  )}
                </div>
                <p className="max-w-[200px] truncate text-xs text-slate-500 dark:text-slate-400 sm:max-w-none">
                  {isCompareMode ? `${datasets.length} files loaded — comparing two` : fileName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle isDark={isDark} onToggle={toggleTheme} />

              <button
                onClick={handleAddClick}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Dump Files</span>
              </button>

              <button
                onClick={handleLoadSample}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Add Sample</span>
              </button>
            </div>
          </div>
        </div>
        {/* Hidden multi-file input for dumping more files from the dashboard */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          onChange={handleDashboardFilesChange}
        />
      </header>

      {/* File tab bar: one uniquely-dated tab per dumped Excel file + Compare tab */}
      <DatasetTabs
        datasets={datasets}
        activeId={activeDataset?.id ?? null}
        isCompareMode={isCompareMode}
        onSelect={handleSelectDataset}
        onSelectCompare={handleSelectCompare}
        onRemove={handleRemoveDataset}
        onAdd={handleAddClick}
        isLoading={isLoading}
        progress={progress}
      />

      {/* View tabs (hidden in compare mode) */}
      {!isCompareMode && (
        <div className="border-b border-slate-200 bg-white transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
            <nav className="flex gap-1">
              {[
                { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
                { id: 'analytics' as const, label: 'Analytics (12-Hour Hourly)', icon: BarChart3 },
                { id: 'records' as const, label: 'Records', icon: Table2 },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {isCompareMode ? (
          <CompareView key={`compare-${datasets.map((d) => d.id).join('-')}`} datasets={datasets} isDark={isDark} />
        ) : (
          <>
            {activeTab === 'overview' && memoizedData && activeDataset && (
              <div className="space-y-6">
                <SummaryStrip data={memoizedData} fileName={fileName || undefined} />
                <KPICards kpi={memoizedData.kpi} />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <CompanyBreakdownChart data={memoizedData.companyBreakdown} isDark={isDark} />
                  <ContactTypeChart data={memoizedData.contactTypeStats} isDark={isDark} />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <PTPStatusChart data={memoizedData.ptpStatusStats} isDark={isDark} />
                  <CallDurationChart data={memoizedData.callDurationBuckets} isDark={isDark} />
                </div>
              </div>
            )}

            {activeTab === 'analytics' && analyticsData && activeDataset && (
              <div className="space-y-6">
                {/* Department filter — scopes the KPIs and every chart below */}
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-colors duration-200 dark:bg-slate-900/95 dark:ring-slate-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60">
                        <Filter className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">Department Filter</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Applies to KPIs, hourly charts, agent PTP amounts and every breakdown below
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MultiDepartmentFilter
                        departments={analyticsData.departments}
                        selected={analyticsDepts}
                        onChange={setAnalyticsDepts}
                      />
                      {analyticsIsFiltered && (
                        <button
                          type="button"
                          onClick={() => setAnalyticsDepts([])}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          <X className="h-3.5 w-3.5" />
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* KPI cards scoped to the selected departments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {analyticsIsFiltered
                        ? `${analyticsScopeLabel} Metrics (${analyticsData.records.length.toLocaleString()} accounts)`
                        : 'All Departments Metrics'}
                    </span>
                  </div>
                  <KPICards kpi={analyticsData.kpi} />
                </div>

                <HourlyComparisonCharts
                  key={activeDataset.id + (analyticsIsFiltered ? `-${analyticsDepts.join(',')}` : '')}
                  records={analyticsData.records}
                  isDark={isDark}
                  scopeLabel={analyticsScopeLabel}
                />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <AgentPerformanceChart data={analyticsData.agentPerformance} isDark={isDark} />
                  <AgentPTPChart data={analyticsData.agentPerformance} isDark={isDark} />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <DepartmentChart data={analyticsData.departmentStats} isDark={isDark} />
                  <ContactTypeChart data={analyticsData.contactTypeStats} isDark={isDark} />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <CompanyBreakdownChart data={analyticsData.companyBreakdown} isDark={isDark} />
                  <PTPStatusChart data={analyticsData.ptpStatusStats} isDark={isDark} />
                </div>
                <CallDurationChart data={analyticsData.callDurationBuckets} isDark={isDark} />
              </div>
            )}

            {activeTab === 'records' && memoizedData && activeDataset && (
              <DataTable
                key={activeDataset.id}
                records={memoizedData.records}
                companies={memoizedData.companies}
                departments={memoizedData.departments}
                agents={memoizedData.agents}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-[1600px] px-4 text-center text-sm text-slate-500 dark:text-slate-400 sm:px-6 lg:px-8">
          Collections Dashboard • {datasets.length} file{datasets.length === 1 ? '' : 's'} loaded
          {activeDataset && !isCompareMode && (
            <> • Viewing: {activeDataset.fileName} ({activeDataset.rowCount.toLocaleString()} records)</>
          )}{' '}
          • 12-Hour Format Active
        </div>
      </footer>
    </div>
    </ErrorBoundary>
  );
}
