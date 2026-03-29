import React from 'react';

const schedule378 = [
  { time: "05:30 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "06:15 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "07:00 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "07:45 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "08:30 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "09:15 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "10:00 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "11:30 AM", from: "Kengeri BS", to: "Electronic City" },
  { time: "01:00 PM", from: "Kengeri BS", to: "Electronic City" },
  { time: "02:30 PM", from: "Kengeri BS", to: "Electronic City" },
  { time: "03:45 PM", from: "Kengeri BS", to: "Electronic City" },
  { time: "04:30 PM", from: "Kengeri BS", to: "Electronic City" },
  { time: "05:15 PM", from: "Kengeri BS", to: "Electronic City" },
  { time: "06:00 PM", from: "Kengeri BS", to: "Electronic City" },
  { time: "07:30 PM", from: "Kengeri BS", to: "Electronic City" },
];

export const BusScheduleTable: React.FC = () => {
  return (
    <div className="w-full max-w-2xl mx-auto bg-[#1e1e1e]/80 backdrop-blur-xl rounded-[32px] border border-green-500/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="p-8 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-green-500 font-black uppercase tracking-[0.3em]">Official Schedule</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-white/40 text-[10px] uppercase font-bold tracking-widest">Route 378 Verified</span>
          </div>
        </div>
        <h2 className="text-3xl font-black text-white tracking-tighter">BMTC 378 Bus Schedule</h2>
        <p className="text-gray-400 text-xs mt-2 font-medium">Kengeri Bus Station ⇔ Electronic City Wipro Gate</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5">
              <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Departure Time</th>
              <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Origin</th>
              <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Destination</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {schedule378.map((row, idx) => (
              <tr key={idx} className="hover:bg-green-500/5 transition-colors group">
                <td className="px-8 py-4">
                  <span className="text-white font-black group-hover:text-green-400 transition-colors uppercase tabular-nums">
                    {row.time}
                  </span>
                </td>
                <td className="px-8 py-4 text-gray-400 text-sm font-medium">{row.from}</td>
                <td className="px-8 py-4 text-gray-400 text-sm font-medium">{row.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="p-6 bg-green-500/5 border-t border-green-500/10 text-center">
        <p className="text-[10px] text-green-500/60 font-black uppercase tracking-widest">
          Frequency: Every 45 - 60 minutes during peak hours
        </p>
      </div>
    </div>
  );
};
