import { useState, useEffect } from 'react';

export default function IdleClock({ todayCount = 0 }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Badge icon with pulse */}
      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-cyan-500/10 flex items-center justify-center animate-pulse-slow">
          <svg className="w-20 h-20 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
            />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-full bg-cyan-400/5 animate-ping-slow" />
      </div>

      {/* Prompt */}
      <h1 className="text-4xl font-light tracking-wide text-gray-200">
        Tap Your Badge
      </h1>

      {/* Clock */}
      <div className="text-center">
        <p className="text-6xl font-bold tabular-nums text-white">{timeStr}</p>
        <p className="text-xl text-gray-400 mt-2">{dateStr}</p>
      </div>

      {/* Branding */}
      <p className="text-lg text-gray-600 tracking-widest uppercase">Mortgage Pros</p>

      {/* Today's count */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
        <p className="text-gray-500 text-sm">
          <span className="text-cyan-400 font-semibold">{todayCount}</span> employee{todayCount !== 1 ? 's' : ''} checked in today
        </p>
      </div>
    </div>
  );
}
