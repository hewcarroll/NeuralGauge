import React from 'react';
import { ComponentType } from '../types';
import { COMPONENT_ICONS, COMPONENT_COLORS } from '../constants';
import { Play } from 'lucide-react';

interface BenchmarkCardProps {
  type: ComponentType;
  label: string;
  description: string;
  onRun: (type: ComponentType) => void;
  disabled: boolean;
}

const BenchmarkCard: React.FC<BenchmarkCardProps> = ({ type, label, description, onRun, disabled }) => {
  const colorClass = COMPONENT_COLORS[type];

  return (
    <div className={`
      relative group overflow-hidden bg-surface border border-white/10 p-6 rounded-xl
      transition-all duration-300 hover:border-white/30 hover:shadow-lg hover:-translate-y-1
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    `}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110" />

      <div className="flex justify-between items-start mb-4">
        <div className={`inline-flex p-3 rounded-lg bg-white/5 ${colorClass.split(' ')[0]}`}>
          {COMPONENT_ICONS[type]}
        </div>
      </div>

      <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{label}</h3>
      <p className="text-gray-400 text-sm mb-6 h-12">{description}</p>

      <button
        onClick={() => !disabled && onRun(type)}
        disabled={disabled}
        className={`
          w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2
          transition-all duration-200
          ${disabled ? 'bg-white/5 text-gray-500' : 'bg-white/10 hover:bg-white/20 text-white'}
        `}
      >
        <Play size={16} fill={disabled ? "none" : "currentColor"} />
        <span>Run Test</span>
      </button>
    </div>
  );
};

export default BenchmarkCard;
