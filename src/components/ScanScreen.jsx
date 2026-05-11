import { useState, useCallback, useEffect, useRef } from 'react';
import useCardReader from '../hooks/useCardReader';
import { scanCard, getTodayScans } from '../utils/api';
import IdleClock from './IdleClock';
import EmployeeCard from './EmployeeCard';
import ScanTicker from './ScanTicker';

const DISPLAY_DURATION = 5000;

const STATES = {
  IDLE: 'idle',
  SCANNING: 'scanning',
  SUCCESS: 'success',
  ERROR: 'error',
};

export default function ScanScreen() {
  const [state, setState] = useState(STATES.IDLE);
  const [employee, setEmployee] = useState(null);
  const [todayCount, setTodayCount] = useState(0);
  const [recentScans, setRecentScans] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const dismissTimer = useRef(null);

  // Load today's scans on mount
  useEffect(() => {
    getTodayScans()
      .then((data) => {
        setTodayCount(data.count);
        setRecentScans(data.scans.slice(0, 5));
      })
      .catch(() => {});
  }, []);

  const returnToIdle = useCallback(() => {
    clearTimeout(dismissTimer.current);
    setState(STATES.IDLE);
    setEmployee(null);
    setErrorMsg('');
  }, []);

  const handleScan = useCallback(
    async (cardNumber) => {
      // If showing a result, dismiss it on next scan
      clearTimeout(dismissTimer.current);
      setState(STATES.SCANNING);

      try {
        const result = await scanCard(cardNumber);
        setEmployee(result.employee);
        setState(STATES.SUCCESS);
        setTodayCount((c) => c + 1);
        setRecentScans((prev) => {
          const entry = {
            display_name: result.employee.displayName,
            scanned_at: new Date().toISOString(),
          };
          return [entry, ...prev].slice(0, 5);
        });
      } catch (err) {
        if (err.status === 404) {
          setErrorMsg('Badge Not Recognized');
        } else {
          setErrorMsg('Scan Error — Please Try Again');
        }
        setState(STATES.ERROR);
      }

      // Auto-dismiss
      dismissTimer.current = setTimeout(returnToIdle, DISPLAY_DURATION);
    },
    [returnToIdle]
  );

  useCardReader({ onScan: handleScan, enabled: true });

  // SSE: listen for scans from other sources (emulator, API)
  useEffect(() => {
    const es = new EventSource('/api/scans/stream');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'scan' && data.employee) {
          clearTimeout(dismissTimer.current);
          setEmployee(data.employee);
          setState(STATES.SUCCESS);
          setTodayCount((c) => c + 1);
          setRecentScans((prev) => {
            const entry = {
              display_name: data.employee.displayName,
              scanned_at: new Date().toISOString(),
            };
            return [entry, ...prev].slice(0, 5);
          });
          dismissTimer.current = setTimeout(returnToIdle, DISPLAY_DURATION);
        }
      } catch {}
    };
    return () => es.close();
  }, [returnToIdle]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(dismissTimer.current);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col relative overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center">
        {state === STATES.IDLE && <IdleClock todayCount={todayCount} />}

        {state === STATES.SCANNING && (
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="w-20 h-20 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xl text-gray-400">Reading badge...</p>
          </div>
        )}

        {state === STATES.SUCCESS && employee && (
          <EmployeeCard employee={employee} />
        )}

        {state === STATES.ERROR && (
          <div className="flex flex-col items-center gap-6 animate-in">
            <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-14 h-14 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-red-400">{errorMsg}</h2>
            <p className="text-gray-400 text-lg">Please see the front desk for assistance</p>
          </div>
        )}
      </div>

      {/* Bottom ticker */}
      <ScanTicker scans={recentScans} todayCount={todayCount} />

    </div>
  );
}
