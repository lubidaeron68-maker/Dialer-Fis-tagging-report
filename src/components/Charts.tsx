import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import type {
  AgentPerformance,
  CompanyBreakdown,
  ContactTypeStat,
  DepartmentStat,
  PTPStatusStat,
  CallDurationBucket,
} from '../types';

// Vivid, high-energy palettes that shine on dark backgrounds and remain crisp on light backgrounds
const COLORS = [
  '#6366f1', // Electric Indigo
  '#10b981', // Neon Emerald
  '#f59e0b', // Radiant Amber
  '#f43f5e', // Hot Coral
  '#8b5cf6', // Bright Purple
  '#06b6d4', // Cyan
  '#ec4899', // Hot Pink
  '#84cc16', // Lime Green
  '#f97316', // Orange
  '#14b8a6', // Teal
];

const PIE_COLORS = [
  '#10b981', // Mint/Emerald
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#f43f5e', // Rose/Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, subtitle, children, className }: ChartCardProps) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-colors duration-200 dark:bg-slate-900/95 dark:ring-slate-800 ${
        className || ''
      }`}
    >
      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function getChartTheme(isDark?: boolean) {
  return {
    grid: isDark ? '#334155' : '#e2e8f0',
    axis: isDark ? '#94a3b8' : '#64748b',
    tooltipStyle: {
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      borderColor: isDark ? '#334155' : '#e2e8f0',
      color: isDark ? '#f8fafc' : '#0f172a',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      fontSize: '12px',
    },
  };
}

interface AgentChartProps {
  data: AgentPerformance[];
  isDark?: boolean;
}

// Custom tooltip: shows RPC, PTP and the conversion rate for the hovered agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RpcPtpTooltip({ active, payload, isDark }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d: AgentPerformance = payload[0].payload;
  const rate = d.rpc > 0 ? (d.ptp / d.rpc) * 100 : 0;
  return (
    <div
      style={{
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '10px 14px',
        fontSize: '12px',
        color: isDark ? '#f8fafc' : '#0f172a',
      }}
    >
      <p className="mb-1 font-bold text-sm">{d.name}</p>
      <p>
        <span style={{ color: '#6366f1' }} className="font-semibold">RPC</span>:{' '}
        {d.rpc.toLocaleString()}
      </p>
      <p>
        <span style={{ color: '#f59e0b' }} className="font-semibold">PTP</span>:{' '}
        {d.ptp.toLocaleString()}
      </p>
      <p className="mt-1 border-t pt-1 font-bold" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
        Conversion: <span style={{ color: '#10b981' }}>{rate.toFixed(1)}%</span>
      </p>
    </div>
  );
}

export function AgentPerformanceChart({ data, isDark = false }: AgentChartProps) {
  // Sort by RPC volume (top 10) and precompute conversion rates for axis labels
  const top10 = useMemo(
    () => [...data].sort((a, b) => b.rpc - a.rpc).slice(0, 10),
    [data]
  );
  const rateByAgent = useMemo(() => {
    const m = new Map<string, number>();
    top10.forEach((a) => m.set(a.name, a.rpc > 0 ? (a.ptp / a.rpc) * 100 : 0));
    return m;
  }, [top10]);

  const theme = getChartTheme(isDark);

  return (
    <ChartCard title="Agent RPC to PTP Conversion" subtitle="Right Party Contacts that converted to Promise to Pay, by agent">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={true} vertical={false} />
            <XAxis type="number" stroke={theme.axis} fontSize={12} tick={{ fill: theme.axis }} allowDecimals={false} />
            <YAxis
              dataKey="name"
              type="category"
              stroke={theme.axis}
              fontSize={11}
              width={110}
              tick={{ fill: theme.axis }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tickFormatter={(name: any) => {
                const rate = rateByAgent.get(name);
                return rate === undefined ? name : `${name} (${rate.toFixed(0)}%)`;
              }}
            />
            <Tooltip
              content={<RpcPtpTooltip isDark={isDark} />}
              cursor={{ fill: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(99,102,241,0.07)' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="rpc" fill="#6366f1" name="RPC (Right Party Contact)" radius={[0, 4, 4, 0]} barSize={14} />
            <Bar dataKey="ptp" fill="#f59e0b" name="PTP (Promise to Pay)" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

interface ContactTypeChartProps {
  data: ContactTypeStat[];
  isDark?: boolean;
}

export function ContactTypeChart({ data, isDark = false }: ContactTypeChartProps) {
  const theme = getChartTheme(isDark);

  return (
    <ChartCard title="Contact Type Distribution" subtitle="Breakdown of contact outcomes">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="count"
              nameKey="type"
              stroke={isDark ? '#0f172a' : '#ffffff'}
              strokeWidth={2}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={theme.tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any, props: any) => [
                `${Number(value).toLocaleString()} (${props?.payload?.percentage?.toFixed(1) || 0}%)`,
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

interface CompanyChartProps {
  data: CompanyBreakdown[];
  isDark?: boolean;
}

export function CompanyBreakdownChart({ data, isDark = false }: CompanyChartProps) {
  const theme = getChartTheme(isDark);

  return (
    <ChartCard title="Company Breakdown" subtitle="Accounts and overdue portfolio by company">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="company" stroke={theme.axis} fontSize={11} tick={{ fill: theme.axis }} />
            <YAxis yAxisId="left" stroke={theme.axis} fontSize={11} tick={{ fill: theme.axis }} />
            <YAxis yAxisId="right" orientation="right" stroke={theme.axis} fontSize={11} tick={{ fill: theme.axis }} />
            <Tooltip
              contentStyle={theme.tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [
                name === 'count' ? Number(value).toLocaleString() : formatCurrency(Number(value)),
                name === 'count' ? 'Accounts' : 'Overdue',
              ]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar yAxisId="left" dataKey="count" fill="#6366f1" name="Accounts" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="overdue" fill="#f43f5e" name="Overdue" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

interface DepartmentChartProps {
  data: DepartmentStat[];
  isDark?: boolean;
}

export function DepartmentChart({ data, isDark = false }: DepartmentChartProps) {
  const theme = getChartTheme(isDark);

  return (
    <ChartCard title="Department Performance" subtitle="Account volume and debt portfolio by department">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="department" stroke={theme.axis} fontSize={12} tick={{ fill: theme.axis }} />
            <YAxis stroke={theme.axis} fontSize={11} tick={{ fill: theme.axis }} />
            <Tooltip
              contentStyle={theme.tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [
                name === 'count' ? Number(value).toLocaleString() : formatCurrency(Number(value)),
                name === 'count' ? 'Accounts' : 'Overdue',
              ]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="count" fill="#8b5cf6" name="Accounts" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

interface PTPChartProps {
  data: PTPStatusStat[];
  isDark?: boolean;
}

export function PTPStatusChart({ data, isDark = false }: PTPChartProps) {
  const theme = getChartTheme(isDark);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    return `${props.status}: ${props.count}`;
  };

  return (
    <ChartCard title="PTP Status" subtitle="Promise to Pay breakdown and collection rate">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={88}
              dataKey="count"
              nameKey="status"
              label={renderLabel}
              labelLine={false}
              stroke={isDark ? '#0f172a' : '#ffffff'}
              strokeWidth={2}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={theme.tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any, props: any) => [
                `${Number(value).toLocaleString()} accounts (${formatCurrency(props?.payload?.amount || 0)})`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

interface CallDurationChartProps {
  data: CallDurationBucket[];
  isDark?: boolean;
}

export function CallDurationChart({ data, isDark = false }: CallDurationChartProps) {
  const theme = getChartTheme(isDark);

  return (
    <ChartCard title="Call Duration Distribution" subtitle="Calls bucketed by duration (minutes)">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="range" stroke={theme.axis} fontSize={12} tick={{ fill: theme.axis }} />
            <YAxis stroke={theme.axis} fontSize={11} tick={{ fill: theme.axis }} />
            <Tooltip
              contentStyle={theme.tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`${Number(value).toLocaleString()} calls`, 'Count']}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#06b6d4"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorCalls)"
              name="Calls"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

interface AgentPTPChartProps {
  data: AgentPerformance[];
  isDark?: boolean;
}

// Agent PTP Amount — top agents by committed PTP value.
// The data array is whatever the current department filter produces, so the
// ranking, totals and tooltip all update automatically when filtered.
export function AgentPTPChart({ data, isDark = false }: AgentPTPChartProps) {
  const top10 = useMemo(() => [...data].sort((a, b) => b.ptpAmount - a.ptpAmount).slice(0, 10), [data]);
  const theme = getChartTheme(isDark);

  return (
    <ChartCard title="Agent PTP Amount" subtitle="PTP amount committed by agent (updates with department filter)">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 60, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={true} vertical={false} />
            <XAxis
              type="number"
              stroke={theme.axis}
              fontSize={11}
              tick={{ fill: theme.axis }}
              tickFormatter={(v) => `₱${(Number(v) / 1000).toFixed(0)}k`}
            />
            <YAxis dataKey="name" type="category" stroke={theme.axis} fontSize={11} width={75} tick={{ fill: theme.axis }} />
            <Tooltip
              contentStyle={theme.tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [formatCurrency(Number(value)), 'PTP Amount']}
            />
            <Bar dataKey="ptpAmount" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
