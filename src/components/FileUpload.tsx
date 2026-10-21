import { useCallback, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  X,
  Loader2,
  Download,
  FileDown,
  Zap,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { downloadSampleExcel } from '../utils/excelTemplate';
import type { ParseProgress } from '../types';
import { MAX_TOTAL_BYTES, MAX_DATASETS, formatBytes } from '../utils/memoryBudget';

interface FileUploadProps {
  onFileLoad: (file: File) => void;
  onFilesLoad?: (files: File[]) => void;
  onError: (error: string) => void;
  isLoading: boolean;
  progress: ParseProgress | null;
  fileName: string | null;
  onClear: () => void;
  onLoadSample: () => void;
}

export function FileUpload({
  onFileLoad,
  onFilesLoad,
  onError,
  isLoading,
  progress,
  fileName,
  onClear,
  onLoadSample,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      validateAndLoad(files);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      validateAndLoad(files);
    }
  };

  const validateAndLoad = (files: File[]) => {
    const validExts = ['.xlsx', '.xls', '.csv'];
    const valid = files.filter((f) => validExts.includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))));
    if (valid.length === 0) {
      onError('Please upload valid Excel files (.xlsx, .xls) or CSV files.');
      return;
    }
    if (valid.length < files.length) {
      onError(`Skipped ${files.length - valid.length} file(s) with unsupported extensions. Loading ${valid.length} valid file(s)...`);
    }

    const totalMB = valid.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
    setSelectedFileSize(valid.length === 1 ? `${(valid[0].size / (1024 * 1024)).toFixed(1)} MB` : `${totalMB.toFixed(1)} MB • ${valid.length} files`);
    if (onFilesLoad) {
      onFilesLoad(valid);
    } else {
      onFileLoad(valid[0]);
    }

    // Reset input
    const input = document.getElementById('file-input') as HTMLInputElement;
    if (input) input.value = '';
  };

  if (fileName) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/60">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/80">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-emerald-900 dark:text-emerald-200">{fileName}</p>
            {selectedFileSize && (
              <span className="rounded bg-emerald-200/60 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-800/60 dark:text-emerald-200">
                {selectedFileSize}
              </span>
            )}
          </div>
          <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> File parsed and loaded successfully
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedFileSize(null);
            onClear();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/60"
          title="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* High-speed large file indicator badge */}
      <div className="flex items-center justify-between rounded-xl bg-indigo-50/70 px-3.5 py-2 text-xs font-medium text-indigo-900 ring-1 ring-indigo-100 dark:bg-slate-800/80 dark:text-indigo-300 dark:ring-slate-700">
        <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
          <Zap className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>High-Speed Streaming Engine</span>
        </div>
        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>
            Up to {formatBytes(MAX_TOTAL_BYTES)} across {MAX_DATASETS} files • crash-guarded
          </span>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200',
          isLoading
            ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-slate-900/80'
            : isDragging
            ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
            : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-indigo-500 dark:hover:bg-slate-800/40'
        )}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          onChange={handleFileChange}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950/60">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>

            <div className="w-full max-w-md space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span className="truncate pr-2">{progress?.message || 'Processing file...'}</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{progress?.percent || 0}%</span>
              </div>

              {/* Progress Bar */}
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(5, progress?.percent || 0)}%` }}
                />
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Chunked parser with live progress • files are checked against the {formatBytes(MAX_TOTAL_BYTES)} pool
                before loading, so the tab can't run out of memory
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950/60">
              <Upload className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800 dark:text-white">
                Drop one or more Excel / CSV files here, or click to browse
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Dump multiple files at once — up to {formatBytes(MAX_TOTAL_BYTES)} total • each gets its own dated tab
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">or</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={onLoadSample}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700/80"
        >
          <Download className="h-4 w-4" />
          Load Sample Data (Demo)
        </button>
        <button
          onClick={downloadSampleExcel}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
        >
          <FileDown className="h-4 w-4" />
          Download Sample Template (.xlsx)
        </button>
      </div>
    </div>
  );
}
