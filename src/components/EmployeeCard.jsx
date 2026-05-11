function getInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function nameToColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 40%)`;
}

export default function EmployeeCard({ employee }) {
  const firstName = employee.displayName?.split(' ')[0] || 'there';

  return (
    <div className="flex flex-col items-center gap-6 animate-scale-in">
      {/* Photo or initials */}
      <div className="relative">
        {employee.photo ? (
          <img
            src={employee.photo}
            alt={employee.displayName}
            className="w-72 h-72 rounded-full object-cover border-4 border-cyan-400/50 shadow-2xl shadow-cyan-500/20"
          />
        ) : (
          <div
            className="w-72 h-72 rounded-full flex items-center justify-center border-4 border-cyan-400/50 shadow-2xl shadow-cyan-500/20 text-6xl font-bold text-white"
            style={{ backgroundColor: nameToColor(employee.displayName) }}
          >
            {getInitials(employee.displayName)}
          </div>
        )}
        {/* Green check overlay */}
        <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg animate-bounce-in">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Welcome message */}
      <h2 className="text-4xl font-bold text-white">
        Welcome, <span className="text-cyan-400">{firstName}</span>!
      </h2>

      {/* Details */}
      <div className="text-center space-y-1">
        <p className="text-2xl text-gray-300">{employee.displayName}</p>
        {employee.jobTitle && (
          <p className="text-lg text-gray-400">{employee.jobTitle}</p>
        )}
        {employee.department && (
          <p className="text-lg text-gray-500">{employee.department}</p>
        )}
      </div>
    </div>
  );
}
