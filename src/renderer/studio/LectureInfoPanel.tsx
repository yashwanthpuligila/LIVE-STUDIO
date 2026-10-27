import React from 'react';
import { GraduationCap, Film, Lock } from 'lucide-react';
import { BrandingInfo, LectureInfo } from '../../shared/types';

interface LectureInfoPanelProps {
  info: LectureInfo;
  onChange: (partial: Partial<LectureInfo>) => void;
  branding: BrandingInfo | null;
  disabled?: boolean;
}

const formatSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export const LectureInfoPanel: React.FC<LectureInfoPanelProps> = ({ info, onChange, branding, disabled }) => {
  return (
    <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-3 flex flex-col gap-2.5 text-xs">
      <div className="flex items-center gap-2 text-gray-200 font-semibold pb-2 border-b border-[#222634]">
        <GraduationCap className="w-4 h-4 text-blue-400" />
        <span>Lecture Details</span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400">Professor name</span>
        <input
          type="text"
          value={info.professorName}
          disabled={disabled}
          maxLength={60}
          placeholder="e.g. Dr. A. Ravi Kumar"
          onChange={(e) => onChange({ professorName: e.target.value })}
          className="bg-[#10121a] border border-[#2a3042] rounded px-2 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-60"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400">Subject / topic</span>
        <input
          type="text"
          value={info.subject}
          disabled={disabled}
          maxLength={80}
          placeholder="e.g. Data Structures – Unit 3: Trees"
          onChange={(e) => onChange({ subject: e.target.value })}
          className="bg-[#10121a] border border-[#2a3042] rounded px-2 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-60"
        />
      </label>

      <div className="flex flex-col gap-1.5 pt-1">
        <label className="flex items-center justify-between gap-2 text-gray-300">
          <span>Show top banner</span>
          <input
            type="checkbox"
            checked={info.showBanner}
            onChange={(e) => onChange({ showBanner: e.target.checked })}
            className="w-4 h-4 accent-blue-600"
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-gray-300">
          <span>Show name under webcam</span>
          <input
            type="checkbox"
            checked={info.showNameTag}
            onChange={(e) => onChange({ showNameTag: e.target.checked })}
            className="w-4 h-4 accent-blue-600"
          />
        </label>
      </div>

      {/* Admin-set clips are informational here; they can only be changed in Settings with the admin PIN */}
      <div className="mt-1 p-2 rounded-lg bg-[#181b24] border border-[#262c3e] flex flex-col gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Lock className="w-3 h-3" />
          <span>Set by admin</span>
        </div>
        {(['intro', 'outro'] as const).map((kind) => {
          const clip = branding?.[kind];
          return (
            <div key={kind} className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-gray-300 capitalize">
                <Film className="w-3 h-3 text-blue-400" />
                {kind}
              </span>
              <span className={clip ? 'text-emerald-400 font-mono' : 'text-gray-500'}>
                {clip ? formatSec(clip.durationSec) : 'None'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
