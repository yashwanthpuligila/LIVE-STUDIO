import React from 'react';
import klhLogoUrl from '../assets/klh-logo.png';

/** KLH wordmark on a white card (the logo artwork is designed for light backgrounds) + product name. */
export const BrandMark: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'sm' }) => (
  <div className="flex items-center gap-2.5">
    <div className={`bg-white rounded-lg flex items-center ${size === 'md' ? 'px-2 py-1' : 'px-1.5 py-0.5'}`}>
      <img src={klhLogoUrl} alt="KLH University, Aziznagar Campus" className={size === 'md' ? 'h-9' : 'h-7'} draggable={false} />
    </div>
    <div className="flex flex-col leading-tight">
      <span className={`font-bold tracking-tight text-white ${size === 'md' ? 'text-base' : 'text-sm'}`}>Lecture Studio</span>
      {size === 'md' && <span className="text-[10px] text-gray-400">KLH University · Aziznagar Campus</span>}
    </div>
  </div>
);
