
import React from 'react';
import { SavedSession } from '../types';
import { Clock, Trash2, ChevronRight, BarChart } from 'lucide-react';

interface SessionHistoryProps {
  sessions: SavedSession[];
  onLoad: (session: SavedSession) => void;
  onDelete: (id: string) => void;
}

const SessionHistory: React.FC<SessionHistoryProps> = ({ sessions, onLoad, onDelete }) => {
  if (sessions.length === 0) return null;

  return (
    <div className="mt-12 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-6">
        <Clock className="text-gray-400" size={20} />
        <h3 className="text-xl font-bold text-white">Saved Sessions</h3>
        <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-gray-400">{sessions.length}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.sort((a, b) => b.timestamp - a.timestamp).map((session) => (
          <div 
            key={session.id}
            className="group relative bg-surface border border-white/5 hover:border-white/20 rounded-lg p-4 transition-all hover:bg-white/5"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-white group-hover:text-primary transition-colors truncate max-w-[200px]" title={session.name}>
                  {session.name}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(session.timestamp).toLocaleDateString()} • {new Date(session.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
              <div className="flex gap-2">
                 <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded transition-colors"
                  title="Delete Session"
                 >
                   <Trash2 size={14} />
                 </button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <BarChart size={14} className={session.analysis ? "text-primary" : "text-gray-600"} />
                <span className={`text-sm font-mono ${session.analysis ? "text-primary font-bold" : "text-gray-500"}`}>
                  {session.analysis ? `Score: ${session.analysis.aiReadinessScore}` : 'No Analysis'}
                </span>
              </div>
              
              <button
                onClick={() => onLoad(session)}
                className="flex items-center gap-1 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded transition-colors"
              >
                Load Results <ChevronRight size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SessionHistory;
