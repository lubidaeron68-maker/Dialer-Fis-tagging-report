import * as XLSX from 'xlsx';
import type { CollectionRecord, ParseProgress } from '../types';
import { convertTo12HourFormat } from './dateFormatter';
import { MAX_ROWS_PER_FILE, PARSE_CHUNK_SIZE } from './memoryBudget';

/** Error with a message that is safe to show directly in the UI. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Fast header mapping lookup table - lowercase and space-normalized
const headerMap: Record<string, keyof CollectionRecord> = {
  // 1. Company name
  'company': 'company',
  'company name': 'company',
  'companyname': 'company',

  // 2. Agreement id
  'agreement': 'agreementNumber',
  'agreement id': 'agreementNumber',
  'agreementid': 'agreementNumber',
  'agreement no': 'agreementNumber',
  'agreement number': 'agreementNumber',
  'agreement #': 'agreementNumber',
  'agreement no.': 'agreementNumber',

  // 3. Credit assignment date
  'credit assignment date': 'creditAssignmentDate',
  'credit assignment': 'creditAssignmentDate',
  'credit assigned date': 'creditAssignmentDate',
  'creditassigneddate': 'creditAssignmentDate',
  'assignment date': 'creditAssignmentDate',
  'credit assigned': 'creditAssigned',
  'credit ass': 'creditAssigned',
  'credit': 'creditAssigned',

  // 4. Department
  'department': 'department',
  'dept': 'department',

  // 5. Initial DPD
  'initial dpd': 'initialDP',
  'initial dp': 'initialDP',
  'initialdp': 'initialDP',
  'initial days': 'initialDP',
  'initial days past due': 'initialDP',

  // 6. Actual DPD
  'actual dpd': 'actualDF',
  'actual df': 'actualDF',
  'actualdf': 'actualDF',
  'actual': 'actualDF',
  'actual days past due': 'actualDF',

  // 7. Agent login
  'agent login': 'agentLog',
  'agent log': 'agentLog',
  'agentlog': 'agentLog',
  'agent code': 'agentLog',
  'login': 'agentLog',
  'agent id': 'agentLog',

  // 8. Agent name
  'agent name': 'agentName',
  'agentname': 'agentName',
  'agent': 'agentName',
  'name': 'agentName',

  // 9. Action type
  'action type': 'actionType',
  'actiontype': 'actionType',
  'action': 'actionType',

  // 10. Contact type
  'contact type': 'contactType',
  'contacttype': 'contactType',
  'contact': 'contactType',
  'contact_type': 'contactType',
  'contact-type': 'contactType',
  'call type': 'contactType',
  'calltype': 'contactType',
  'call contact type': 'contactType',

  // 11. Action result
  'action result': 'actionResult',
  'actionresult': 'actionResult',
  'result': 'actionResult',
  'action res': 'actionResult',
  'action_result': 'actionResult',
  'action-result': 'actionResult',
  'call result': 'actionResult',
  'callresult': 'actionResult',
  'action status': 'actionResult',
  'disposition': 'actionResult',

  // 12. Overdue reason
  'overdue reason': 'overdueReason',
  'overduereason': 'overdueReason',
  'reason': 'overdueReason',
  'overdue': 'overdueAmount',
  'overdue amount': 'overdueAmount',
  'overdue amt': 'overdueAmount',
  'amount overdue': 'overdueAmount',
  'balance': 'overdueAmount',
  'outstanding': 'overdueAmount',
  'outstanding balance': 'overdueAmount',

  // 13. Date
  'date': 'date',
  'call date': 'date',

  // 14. Execution dtime
  'execution dtime': 'executionTime',
  'execution time': 'executionTime',
  'execution datetime': 'executionTime',
  'execution': 'executionTime',
  'executiontime': 'executionTime',
  'time': 'executionTime',
  'call time': 'executionTime',

  // 15. Dialed phone
  'dialed phone': 'dialedPhone',
  'dialed ph': 'dialedPhone',
  'dialedphone': 'dialedPhone',
  'phone': 'dialedPhone',
  'phone number': 'dialedPhone',
  'mobile': 'dialedPhone',
  'contact number': 'dialedPhone',

  // 16. Requested payment channel
  'requested payment channel': 'requestedPaymentChannel',
  'payment channel': 'requestedPaymentChannel',
  'requested channel': 'requestedPaymentChannel',
  'requested ptp': 'requestedPTP',
  'ptp request': 'requestedPTP',
  'request ptp': 'requestedPTP',

  // 17. PTP status
  'ptp status': 'ptpStatus',
  'ptpstatus': 'ptpStatus',
  'status': 'ptpStatus',

  // 18. PTP due date
  'ptp due date': 'ptpDueDate',
  'ptp duedate': 'ptpDueDate',
  'ptp due': 'ptpDueDate',
  'due date': 'ptpDueDate',

  // 19. PTP amount
  'ptp amount': 'ptpAmount',
  'ptp amt': 'ptpAmount',

  // 20. PTP paid amount
  'ptp paid amount': 'ptpPaid',
  'ptp paid': 'ptpPaid',
  'ptppaid': 'ptpPaid',
  'paid amount': 'ptpPaid',

  // 21. Payment plan summary
  'payment plan summary': 'paymentPlanSummary',
  'payment plan': 'paymentPlanSummary',
  'plan summary': 'paymentPlanSummary',
  'paymentplan': 'paymentPlanSummary',

  // 22. Payment plan status
  'payment plan status': 'paymentPlanStatus',
  'plan status': 'paymentPlanStatus',
  'paymentplanstatus': 'paymentPlanStatus',

  // 23. Payment plan target amount
  'payment plan target amount': 'paymentPlanTargetAmount',
  'payment plan target': 'paymentPlanTargetAmount',
  'plan target amount': 'paymentPlanTargetAmount',
  'target amount': 'paymentPlanTargetAmount',
  'paymentplantargetamount': 'paymentPlanTargetAmount',

  // 24. Payment plan paid amount
  'payment plan paid amount': 'paymentPlanPaidAmount',
  'payment plan paid': 'paymentPlanPaidAmount',
  'plan paid amount': 'paymentPlanPaidAmount',
  'paymentplanpaidamount': 'paymentPlanPaidAmount',

  // 25. Payment plan not paid amount
  'payment plan not paid amount': 'paymentPlanNotPaidAmount',
  'payment plan not paid': 'paymentPlanNotPaidAmount',
  'plan not paid amount': 'paymentPlanNotPaidAmount',
  'not paid amount': 'paymentPlanNotPaidAmount',
  'paymentplannotpaidamount': 'paymentPlanNotPaidAmount',
  'unpaid amount': 'paymentPlanNotPaidAmount',

  // Legacy Payments
  'payment': 'payment1',
  'payment 1': 'payment1',
  'payment1': 'payment1',
  'payment 2': 'payment2',
  'payment2': 'payment2',
  'payment 3': 'payment3',
  'payment3': 'payment3',
  'payment 4': 'payment4',
  'payment4': 'payment4',

  // 26. Agents note
  'agents note': 'agentNotes',
  'agent notes': 'agentNotes',
  'agentnotes': 'agentNotes',
  'agents notes': 'agentNotes',
  'notes': 'agentNotes',
  'note': 'agentNotes',
  'remarks': 'agentNotes',

  // 27. Call duration, minutes
  'call duration, minutes': 'callDuration',
  'call duration minutes': 'callDuration',
  'call duration': 'callDuration',
  'callduration': 'callDuration',
  'duration': 'callDuration',
  'call dur': 'callDuration',
  'duration, minutes': 'callDuration',
  'duration (minutes)': 'callDuration',
  'call duration (minutes)': 'callDuration',
  'call duration (min)': 'callDuration',
  'duration (min)': 'callDuration',
  'call duration min': 'callDuration',
  'call_duration': 'callDuration',
  'talk time': 'callDuration',
  'talktime': 'callDuration',
  'minutes': 'callDuration',

  // 28. Additional action
  'additional action': 'additionalAction',
  'additionalaction': 'additionalAction',
  'additional info': 'additionalInfo',
  'additionalinfo': 'additionalInfo',
  'additional': 'additionalAction',

  // ID
  'id': 'id',
  'no': 'id',
  'no.': 'id',
  '#': 'id',
};

// Fast inline number parser
function fastNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '' || s[0] === '#') return null;
    let clean = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch !== '₱' && ch !== '$' && ch !== ',' && ch !== ' ') {
        clean += ch;
      }
    }
    const n = Number(clean);
    return isNaN(n) ? null : n;
  }
  return null;
}

// Fast inline string parser
function fastString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  return String(val).trim();
}

// Fast inline date parser
function fastDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const m = d.m < 10 ? '0' + d.m : d.m;
      const day = d.d < 10 ? '0' + d.d : d.d;
      return `${d.y}-${m}-${day}`;
    }
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }
  return '';
}

// Fast inline datetime parser with 12-Hour conversion
function fastDateTime(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const m = d.m < 10 ? '0' + d.m : d.m;
      const day = d.d < 10 ? '0' + d.d : d.d;
      const H = d.H < 10 ? '0' + d.H : d.H;
      const M = d.M < 10 ? '0' + d.M : d.M;
      const S = d.S < 10 ? '0' + d.S : d.S;
      const formatted24 = `${d.y}-${m}-${day} ${H}:${M}:${S}`;
      return convertTo12HourFormat(formatted24);
    }
  }
  if (typeof val === 'string') {
    return convertTo12HourFormat(val.trim());
  }
  return '';
}

export interface ParseResult {
  records: CollectionRecord[];
  /** True when rows were dropped because the file exceeded MAX_ROWS_PER_FILE. */
  truncated: boolean;
  totalRowsInFile: number;
  /** Name of the sheet the data came from. */
  sheetName: string;
  /** True when the chosen sheet had none of the expected columns. */
  usedFallbackSheet: boolean;
}

export async function parseExcelFile(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<ParseResult> {
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

  // 1. Read file as ArrayBuffer with progress
  onProgress?.({
    stage: 'reading',
    percent: 8,
    message: `Reading ${sizeMB} MB file into memory...`,
  });

  // `let` so the buffer reference can be dropped right after decoding.
  let arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer;
      if (result) resolve(result);
      else reject(new ParseError('Could not read the file contents.'));
    };
    reader.onerror = () => reject(new ParseError('The browser could not read this file.'));
    reader.onabort = () => reject(new ParseError('Reading the file was cancelled.'));
    reader.readAsArrayBuffer(file);
  });

  // Small yield to let browser UI paint and release the read buffer pressure
  await yieldToUI();

  // 2. Parse workbook with ultra-lean SheetJS configuration
  onProgress?.({
    stage: 'parsing',
    percent: 25,
    message: 'Parsing spreadsheet structure (high-speed engine)...',
  });

  // Yield before heavy XLSX.read so spinner shows
  await yieldToUI();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      dense: true,        // 90% memory reduction: stores 2D array, not cell objects
      cellDates: false,   // Prevents thousands of Date allocations
      cellNF: false,      // Skip number formats
      cellStyles: false,  // Skip cell styles
      cellFormula: false, // Skip formulas
      cellHTML: false,    // Skip HTML
      cellText: false,    // Return raw primitives directly
    });
  } catch (err) {
    throw new ParseError(
      `Could not decode "${file.name}". It may be corrupted, password-protected, or not a real spreadsheet.`
    );
  } finally {
    // The raw bytes are no longer needed once decoded. Dropping the reference
    // lets the GC reclaim up to 50 MB before we allocate the row objects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (arrayBuffer as any) = undefined;
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new ParseError(`"${file.name}" contains no sheets.`);
  }

  // Pick the sheet that actually has the expected columns, falling back to the first.
  const pickSheet = (): { sheet: XLSX.WorkSheet; name: string; usedFallback: boolean } => {
    const score = (s: XLSX.WorkSheet): number => {
      try {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(s, { header: 1, blankrows: false }).slice(0, 1);
        const head = (rows[0] ?? []) as unknown[];
        let n = 0;
        for (const cell of head) {
          if (cell === null || cell === undefined) continue;
          const key = String(cell).trim().toLowerCase().replace(/\s+/g, ' ');
          if (headerMap[key] || headerMap[key.replace(/[^a-z0-9]/g, '')]) n++;
        }
        return n;
      } catch {
        return -1;
      }
    };
    let bestName = firstSheetName;
    let bestScore = score(workbook.Sheets[firstSheetName]);
    if (bestScore < 3 && workbook.SheetNames.length > 1) {
      for (const name of workbook.SheetNames.slice(1)) {
        const s = score(workbook.Sheets[name]);
        if (s > bestScore) {
          bestScore = s;
          bestName = name;
        }
      }
    }
    return { sheet: workbook.Sheets[bestName], name: bestName, usedFallback: bestName !== firstSheetName };
  };

  const { sheet, name: chosenSheetName, usedFallback: usedFallbackSheet } = pickSheet();

  // 3. Extract array of arrays
  onProgress?.({
    stage: 'mapping',
    percent: 45,
    message: 'Extracting spreadsheet rows...',
  });

  await yieldToUI();

  let rawRows: unknown[][];
  try {
    rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      blankrows: false,
    });
  } catch {
    throw new ParseError(`Could not read rows from sheet "${chosenSheetName}" in "${file.name}".`);
  }

  if (!Array.isArray(rawRows) || rawRows.length <= 1) {
    return { records: [], truncated: false, totalRowsInFile: 0, sheetName: chosenSheetName, usedFallbackSheet };
  }

  // 4. Map columns once on the header row
  const headerRow = (rawRows[0] ?? []) as unknown[];
  const colIndex: Record<string, number> = {};

  for (let c = 0; c < headerRow.length; c++) {
    const rawH = headerRow[c];
    if (rawH === undefined || rawH === null) continue;
    const h = String(rawH).trim().toLowerCase().replace(/\s+/g, ' ');
    const stripped = h.replace(/[^a-z0-9]/g, '');
    let field = headerMap[h] || headerMap[stripped];

    // Fallback fuzzy search if exact match isn't in map
    if (!field) {
      if (h.includes('action') && h.includes('res')) field = 'actionResult';
      else if (h.includes('contact') && h.includes('type')) field = 'contactType';
      else if (h.includes('call') && h.includes('dur')) field = 'callDuration';
      else if (h.includes('agreement')) field = 'agreementNumber';
      else if (h.includes('company')) field = 'company';
      else if (h.includes('dept') || h.includes('department')) field = 'department';
      else if (h.includes('agent') && h.includes('name')) field = 'agentName';
      else if (h.includes('agent') && (h.includes('log') || h.includes('id'))) field = 'agentLog';
      else if (h.includes('ptp') && h.includes('stat')) field = 'ptpStatus';
      else if (h.includes('execution') || (h.includes('call') && h.includes('time'))) field = 'executionTime';
    }

    if (field && colIndex[field] === undefined) {
      colIndex[field] = c;
    }
  }

  // Helper for column index lookup
  const getCol = (key: keyof CollectionRecord): number => {
    const idx = colIndex[key as string];
    return idx !== undefined ? idx : -1;
  };

  const colCompany = getCol('company');
  const colAgreement = getCol('agreementNumber');
  const colCreditDate = getCol('creditAssignmentDate');
  const colCreditAssigned = getCol('creditAssigned');
  const colDept = getCol('department');
  const colInitialDP = getCol('initialDP');
  const colActualDF = getCol('actualDF');
  const colAgentLog = getCol('agentLog');
  const colAgentName = getCol('agentName');
  const colActionType = getCol('actionType');
  const colContactType = getCol('contactType');
  const colActionResult = getCol('actionResult');
  const colOverdueReason = getCol('overdueReason');
  const colOverdueAmount = getCol('overdueAmount');
  const colDate = getCol('date');
  const colExecution = getCol('executionTime');
  const colDialedPhone = getCol('dialedPhone');
  const colPmtChannel = getCol('requestedPaymentChannel');
  const colRequestedPTP = getCol('requestedPTP');
  const colPTPStatus = getCol('ptpStatus');
  const colPTPDueDate = getCol('ptpDueDate');
  const colPTPAmount = getCol('ptpAmount');
  const colPTPPaid = getCol('ptpPaid');
  const colPlanSummary = getCol('paymentPlanSummary');
  const colPlanStatus = getCol('paymentPlanStatus');
  const colPlanTarget = getCol('paymentPlanTargetAmount');
  const colPlanPaid = getCol('paymentPlanPaidAmount');
  const colPlanNotPaid = getCol('paymentPlanNotPaidAmount');
  const colPayment1 = getCol('payment1');
  const colPayment2 = getCol('payment2');
  const colPayment3 = getCol('payment3');
  const colPayment4 = getCol('payment4');
  const colAgentNotes = getCol('agentNotes');
  const colCallDuration = getCol('callDuration');
  const colAdditionalAction = getCol('additionalAction');
  const colAdditionalInfo = getCol('additionalInfo');
  const colId = getCol('id');

  const totalRowsInFile = rawRows.length - 1;

  // Safety valve: never let one sheet take the whole heap.
  const rowLimit = Math.min(totalRowsInFile, MAX_ROWS_PER_FILE);
  const truncated = rowLimit < totalRowsInFile;

  const records: CollectionRecord[] = new Array(rowLimit);

  if (truncated) {
    onProgress?.({
      stage: 'mapping',
      percent: 48,
      message: `Large sheet: loading the first ${rowLimit.toLocaleString()} of ${totalRowsInFile.toLocaleString()} rows...`,
      rowCount: rowLimit,
    });
    await yieldToUI();
  }

  // 5. Chunked processing so the UI thread never freezes
  const CHUNK_SIZE = PARSE_CHUNK_SIZE;

  for (let start = 1; start <= rowLimit; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, rowLimit + 1);

    for (let r = start; r < end; r++) {
      const row = (rawRows[r] || []) as unknown[];

      records[r - 1] = {
        id: colId >= 0 ? fastString(row[colId]) || `REC-${r}` : `REC-${r}`,
        company: colCompany >= 0 ? fastString(row[colCompany]) || 'Unknown' : 'Unknown',
        agreementNumber: colAgreement >= 0 ? fastString(row[colAgreement]) : '',
        creditAssignmentDate: colCreditDate >= 0 ? fastDate(row[colCreditDate]) : '',
        creditAssigned: colCreditAssigned >= 0 ? fastString(row[colCreditAssigned]) : '',
        department: colDept >= 0 ? fastString(row[colDept]) || 'Unknown' : 'Unknown',
        initialDP: colInitialDP >= 0 ? fastNumber(row[colInitialDP]) : null,
        actualDF: colActualDF >= 0 ? fastNumber(row[colActualDF]) : null,
        agentLog: colAgentLog >= 0 ? fastString(row[colAgentLog]) : '',
        agentName: colAgentName >= 0 ? fastString(row[colAgentName]) || 'Unknown' : 'Unknown',
        actionType: colActionType >= 0 ? fastString(row[colActionType]) || 'Outbound' : 'Outbound',
        contactType: colContactType >= 0 ? fastString(row[colContactType]) || 'Unknown' : 'Unknown',
        actionResult: colActionResult >= 0 ? fastString(row[colActionResult]) : '',
        overdueReason: colOverdueReason >= 0 ? fastString(row[colOverdueReason]) : '',
        overdueAmount: colOverdueAmount >= 0 ? fastNumber(row[colOverdueAmount]) : null,
        date: colDate >= 0 ? fastDate(row[colDate]) : '',
        executionTime: colExecution >= 0 ? fastDateTime(row[colExecution]) : '',
        dialedPhone: colDialedPhone >= 0 ? fastString(row[colDialedPhone]) : '',
        requestedPaymentChannel: colPmtChannel >= 0 ? fastString(row[colPmtChannel]) : '',
        requestedPTP: colRequestedPTP >= 0 ? fastString(row[colRequestedPTP]) : '',
        ptpStatus: colPTPStatus >= 0 ? fastString(row[colPTPStatus]) || 'Pending' : 'Pending',
        ptpDueDate: colPTPDueDate >= 0 ? fastDate(row[colPTPDueDate]) : '',
        ptpAmount: colPTPAmount >= 0 ? fastNumber(row[colPTPAmount]) : null,
        ptpPaid: colPTPPaid >= 0 ? fastNumber(row[colPTPPaid]) : null,
        paymentPlanSummary: colPlanSummary >= 0 ? fastString(row[colPlanSummary]) : '',
        paymentPlanStatus: colPlanStatus >= 0 ? fastString(row[colPlanStatus]) : '',
        paymentPlanTargetAmount: colPlanTarget >= 0 ? fastNumber(row[colPlanTarget]) : null,
        paymentPlanPaidAmount: colPlanPaid >= 0 ? fastNumber(row[colPlanPaid]) : null,
        paymentPlanNotPaidAmount: colPlanNotPaid >= 0 ? fastNumber(row[colPlanNotPaid]) : null,
        payment1: colPayment1 >= 0 ? fastNumber(row[colPayment1]) : null,
        payment2: colPayment2 >= 0 ? fastNumber(row[colPayment2]) : null,
        payment3: colPayment3 >= 0 ? fastNumber(row[colPayment3]) : null,
        payment4: colPayment4 >= 0 ? fastNumber(row[colPayment4]) : null,
        agentNotes: colAgentNotes >= 0 ? fastString(row[colAgentNotes]) : '',
        callDuration: colCallDuration >= 0 ? fastNumber(row[colCallDuration]) : null,
        additionalAction: colAdditionalAction >= 0 ? fastString(row[colAdditionalAction]) : '',
        additionalInfo: colAdditionalInfo >= 0 ? fastString(row[colAdditionalInfo]) : '',
      };
    }

    // Yield control so the UI thread doesn't freeze on large sheets
    if (end <= rowLimit) {
      const pct = Math.round(50 + (end / rowLimit) * 45);
      onProgress?.({
        stage: 'mapping',
        percent: pct,
        message: `Processed ${end.toLocaleString()} of ${rowLimit.toLocaleString()} rows (${pct}%)...`,
        rowCount: end,
      });
      await yieldToUI();
    }
  }

  onProgress?.({
    stage: 'done',
    percent: 100,
    message: truncated
      ? `Ready — ${records.length.toLocaleString()} records (capped from ${totalRowsInFile.toLocaleString()}).`
      : `Ready! Processed ${records.length.toLocaleString()} records.`,
    rowCount: records.length,
  });

  return { records, truncated, totalRowsInFile, sheetName: chosenSheetName, usedFallbackSheet };
}
