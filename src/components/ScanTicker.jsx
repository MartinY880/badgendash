export default function ScanTicker({ scans = [], todayCount = 0 }) {
  if (scans.length === 0) return null;

  return (
    <div className="bg-gray-900/80 border-t border-gray-800 px-6 py-3">
      <div className="flex items-center gap-6 overflow-hidden">
        <span className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">Recent</span>
        <div className="flex gap-4 overflow-x-auto">
          {scans.map((scan, i) => {
            const time = new Date(scan.scanned_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
            return (
              <div
                key={`${scan.scanned_at}-${i}`}
                className="flex items-center gap-2 whitespace-nowrap text-sm"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-gray-300">{scan.display_name}</span>
                <span className="text-gray-600">{time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
