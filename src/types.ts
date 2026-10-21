export interface CollectionRecord {
  id: string;
  company: string;
  agreementNumber: string;
  creditAssignmentDate: string;
  creditAssigned: string;
  department: string;
  initialDP: number | null;
  actualDF: number | null;
  agentLog: string;
  agentName: string;
  actionType: string;
  contactType: string;
  actionResult: string;
  overdueReason: string;
  overdueAmount: number | null;
  date: string;
  executionTime: string;
  dialedPhone: string;
  requestedPaymentChannel: string;
  requestedPTP: string;
  ptpStatus: string;
  ptpDueDate: string;
  ptpAmount: number | null;
  ptpPaid: number | null;
  paymentPlanSummary: string;
  paymentPlanStatus: string;
  paymentPlanTargetAmount: number | null;
  paymentPlanPaidAmount: number | null;
  paymentPlanNotPaidAmount: number | null;
  payment1: number | null;
  payment2: number | null;
  payment3: number | null;
  payment4: number | null;
  agentNotes: string;
  callDuration: number | null;
  additionalAction: string;
  additionalInfo: string;
  raw?: Record<string, unknown>;
}

export interface ParseProgress {
  stage: 'reading' | 'parsing' | 'mapping' | 'done';
  percent: number;
  message: string;
  rowCount?: number;
}

export interface KPIData {
  totalAccounts: number;
  /** Distinct non-empty Agreement IDs. */
  uniqueAccounts: number;
  totalOverdue: number;
  totalCalls: number;
  avgCallDuration: number;
  totalPTP: number;
  ptpPaidAmount: number;
  /** Count of rows whose contact type is Right Party Contact (RPC). */
  rpcCount: number;
  contactRate: number;
  noContactRate: number;
}

export interface AgentPerformance {
  name: string;
  calls: number;
  contacts: number;
  rpc: number;
  ptp: number;
  avgDuration: number;
  totalOverdue: number;
  /** Sum of PTP amount committed by this agent. */
  ptpAmount: number;
}

export interface CompanyBreakdown {
  company: string;
  count: number;
  overdue: number;
  calls: number;
}

export interface ContactTypeStat {
  type: string;
  count: number;
  percentage: number;
}

export interface DepartmentStat {
  department: string;
  count: number;
  overdue: number;
}

export interface PTPStatusStat {
  status: string;
  count: number;
  amount: number;
}

export interface CallDurationBucket {
  range: string;
  count: number;
}

export interface DashboardData {
  records: CollectionRecord[];
  kpi: KPIData;
  agentPerformance: AgentPerformance[];
  companyBreakdown: CompanyBreakdown[];
  contactTypeStats: ContactTypeStat[];
  departmentStats: DepartmentStat[];
  ptpStatusStats: PTPStatusStat[];
  callDurationBuckets: CallDurationBucket[];
  companies: string[];
  departments: string[];
  agents: string[];
}

export interface Dataset {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedLabel: string;
  data: DashboardData;
  rowCount: number;
  durationMs: number;
  color: string;
  dateRangeLabel: string;
  /** Raw file size in bytes (counts against the 50 MB pool). */
  bytes: number;
  /** True when rows were dropped by the per-file safety cap. */
  truncated: boolean;
  totalRowsInFile: number;
  sheetName: string;
}
