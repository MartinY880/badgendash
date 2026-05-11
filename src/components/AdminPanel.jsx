import { useState, useEffect, useRef } from 'react';
import {
  getEmployees,
  upsertEmployee,
  bulkImportEmployees,
  getTodayScans,
  clearCache,
  getHealth,
  pdkSync,
} from '../utils/api';

const ADMIN_PIN = '1234';

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-80 space-y-4">
          <h2 className="text-xl font-bold text-center">Admin Access</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pin === ADMIN_PIN) {
                setAuthenticated(true);
              } else {
                setPinError(true);
                setPin('');
              }
            }}
          >
            <input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setPinError(false);
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:border-cyan-500"
              autoFocus
            />
            {pinError && (
              <p className="text-red-400 text-sm text-center mt-2">Incorrect PIN</p>
            )}
            <button
              type="submit"
              className="w-full mt-4 bg-cyan-600 hover:bg-cyan-500 rounded-lg px-4 py-2 font-semibold transition-colors"
            >
              Unlock
            </button>
          </form>
          <a href="/" className="block text-center text-gray-500 hover:text-gray-300 text-sm">
            ← Back to Scanner
          </a>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [tab, setTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [scans, setScans] = useState([]);
  const [scanCount, setScanCount] = useState(0);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, scanRes, healthRes] = await Promise.all([
        getEmployees(),
        getTodayScans(),
        getHealth(),
      ]);
      setEmployees(empRes.employees);
      setScans(scanRes.scans);
      setScanCount(scanRes.count);
      setHealth(healthRes);
    } catch {
      showMessage('Failed to load data', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleClearCache = async () => {
    try {
      const res = await clearCache();
      showMessage(res.message);
      loadData();
    } catch {
      showMessage('Failed to clear cache', 'error');
    }
  };

  const [syncing, setSyncing] = useState(false);
  const handlePdkSync = async () => {
    setSyncing(true);
    try {
      const res = await pdkSync();
      showMessage(`Synced ${res.employeesUpserted} employees from ${res.holdersFound} PDK holders`);
      loadData();
    } catch (err) {
      showMessage(err.data?.error || 'PDK sync failed', 'error');
    }
    setSyncing(false);
  };

  const tabs = [
    { id: 'employees', label: 'Employees' },
    { id: 'scans', label: `Scans Today (${scanCount})` },
    { id: 'add', label: 'Add Employee' },
    { id: 'import', label: 'Bulk Import' },
    { id: 'status', label: 'Status' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="text-gray-500 hover:text-white transition-colors">
            ← Scanner
          </a>
          <h1 className="text-xl font-bold">Badge n' Dash Admin</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handlePdkSync}
            disabled={syncing}
            className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            {syncing ? 'Syncing...' : 'Sync from PDK'}
          </button>
          <button
            onClick={handleClearCache}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Clear Photo Cache
          </button>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div
          className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm ${
            message.type === 'error'
              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : 'bg-green-500/20 text-green-300 border border-green-500/30'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6 flex gap-1 mt-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-gray-800 text-white border-b-2 border-cyan-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {tab === 'employees' && (
              <EmployeeTable employees={employees} />
            )}
            {tab === 'scans' && <ScanLog scans={scans} />}
            {tab === 'add' && (
              <AddEmployeeForm
                onSuccess={() => {
                  showMessage('Employee saved');
                  loadData();
                  setTab('employees');
                }}
                onError={(msg) => showMessage(msg, 'error')}
              />
            )}
            {tab === 'import' && (
              <BulkImport
                onSuccess={(count) => {
                  showMessage(`Imported ${count} employees`);
                  loadData();
                  setTab('employees');
                }}
                onError={(msg) => showMessage(msg, 'error')}
              />
            )}
            {tab === 'status' && <StatusPanel health={health} />}
          </>
        )}
      </div>
    </div>
  );
}

function EmployeeTable({ employees }) {
  const [search, setSearch] = useState('');

  const filtered = employees.filter(
    (e) =>
      e.display_name.toLowerCase().includes(search.toLowerCase()) ||
      e.card_number.includes(search) ||
      e.upn.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by name, card number, or UPN..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500"
      />
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-left">
            <tr>
              <th className="px-4 py-3">Card Number</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">UPN</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Job Title</th>
              <th className="px-4 py-3">PDK ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-gray-900/50">
                <td className="px-4 py-3 font-mono text-cyan-400">{e.card_number}</td>
                <td className="px-4 py-3 font-medium">{e.display_name}</td>
                <td className="px-4 py-3 text-gray-400">{e.upn}</td>
                <td className="px-4 py-3 text-gray-400">{e.department || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{e.job_title || '—'}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{e.pdk_person_id || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No employees found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600">{employees.length} total employees</p>
    </div>
  );
}

function ScanLog({ scans }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400 text-left">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Card Number</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {scans.map((s) => (
            <tr key={s.id} className="hover:bg-gray-900/50">
              <td className="px-4 py-3 text-gray-400 font-mono">
                {new Date(s.scanned_at).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </td>
              <td className="px-4 py-3 font-medium">{s.display_name || '—'}</td>
              <td className="px-4 py-3 font-mono text-cyan-400">{s.card_number}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    s.status === 'success'
                      ? 'bg-green-500/20 text-green-400'
                      : s.status === 'pdk_failed'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {s.status}
                </span>
              </td>
            </tr>
          ))}
          {scans.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                No scans today
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AddEmployeeForm({ onSuccess, onError }) {
  const [form, setForm] = useState({
    cardNumber: '',
    upn: '',
    displayName: '',
    department: '',
    jobTitle: '',
    pdkPersonId: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cardNumber || !form.upn || !form.displayName) {
      onError('Card number, UPN, and display name are required');
      return;
    }
    try {
      await upsertEmployee(form);
      onSuccess();
      setForm({ cardNumber: '', upn: '', displayName: '', department: '', jobTitle: '', pdkPersonId: '' });
    } catch {
      onError('Failed to save employee');
    }
  };

  const fields = [
    { key: 'cardNumber', label: 'Card Number *', placeholder: '02681234' },
    { key: 'upn', label: 'UPN (Email) *', placeholder: 'user@mtgpros.com' },
    { key: 'displayName', label: 'Display Name *', placeholder: 'John Smith' },
    { key: 'department', label: 'Department', placeholder: 'Loan Processing' },
    { key: 'jobTitle', label: 'Job Title', placeholder: 'Sr. Processor' },
    { key: 'pdkPersonId', label: 'PDK Person ID', placeholder: 'PDK-001' },
  ];

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-sm text-gray-400 mb-1">{f.label}</label>
          <input
            type="text"
            placeholder={f.placeholder}
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
      ))}
      <button
        type="submit"
        className="bg-cyan-600 hover:bg-cyan-500 px-6 py-2 rounded-lg font-semibold transition-colors"
      >
        Save Employee
      </button>
    </form>
  );
}

function BulkImport({ onSuccess, onError }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.trim().split('\n');
        const header = lines[0].split(',').map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
          const vals = line.split(',').map((v) => v.trim());
          const row = {};
          header.forEach((h, i) => {
            row[h] = vals[i] || '';
          });
          return row;
        });
        setPreview(rows);
      } catch {
        onError('Failed to parse CSV');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview || preview.length === 0) return;
    try {
      const res = await bulkImportEmployees(preview);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      onSuccess(res.count);
    } catch {
      onError('Bulk import failed');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-400 mb-2">
          Upload a CSV with columns: <code className="text-cyan-400">cardNumber, upn, displayName, department, jobTitle, pdkPersonId</code>
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-800 file:text-white file:cursor-pointer hover:file:bg-gray-700"
        />
      </div>
      {preview && (
        <div className="space-y-3">
          <p className="text-sm text-gray-300">{preview.length} rows to import:</p>
          <div className="overflow-x-auto max-h-64 rounded-lg border border-gray-800">
            <table className="w-full text-xs">
              <thead className="bg-gray-900 text-gray-400 sticky top-0">
                <tr>
                  {Object.keys(preview[0]).map((k) => (
                    <th key={k} className="px-3 py-2 text-left">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {preview.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="px-3 py-2 text-gray-300">{v || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 10 && (
            <p className="text-xs text-gray-500">...and {preview.length - 10} more</p>
          )}
          <button
            onClick={handleImport}
            className="bg-cyan-600 hover:bg-cyan-500 px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            Import {preview.length} Employees
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPanel({ health }) {
  if (!health) return <p className="text-gray-500">No health data</p>;

  const items = [
    { label: 'Server Uptime', value: `${Math.floor(health.uptime)}s`, ok: true },
    { label: 'MS Graph', value: health.graphConfigured ? 'Connected' : 'Not Configured', ok: health.graphConfigured },
    { label: 'PDK Cloud', value: health.pdkConfigured ? 'Connected' : 'Not Configured', ok: health.pdkConfigured },
    { label: 'Photo Cache', value: `${health.cacheSize} entries`, ok: true },
  ];

  return (
    <div className="max-w-md space-y-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
        >
          <span className="text-gray-300">{item.label}</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${item.ok ? 'bg-green-400' : 'bg-yellow-400'}`} />
            <span className={`text-sm ${item.ok ? 'text-green-400' : 'text-yellow-400'}`}>
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
