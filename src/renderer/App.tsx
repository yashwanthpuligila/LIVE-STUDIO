import React, { useState, useEffect } from 'react';
import { DashboardPage } from './pages/DashboardPage';
import { StudioPage } from './pages/StudioPage';
import { RecordingsPage } from './pages/RecordingsPage';
import { SettingsPage } from './pages/SettingsPage';

export type AppPage = 'dashboard' | 'studio' | 'recordings' | 'settings';

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');

  return (
    <div className="w-screen h-screen bg-[#0c0d10] text-gray-100 overflow-hidden font-sans">
      {currentPage === 'dashboard' && (
        <DashboardPage
          onOpenStudio={() => setCurrentPage('studio')}
          onOpenRecordings={() => setCurrentPage('recordings')}
          onOpenSettings={() => setCurrentPage('settings')}
          onQuickRecord={() => setCurrentPage('studio')}
          onQuickLive={() => setCurrentPage('studio')}
        />
      )}

      {currentPage === 'studio' && (
        <StudioPage
          onNavigateToRecordings={() => setCurrentPage('recordings')}
          onNavigateToSettings={() => setCurrentPage('settings')}
        />
      )}

      {currentPage === 'recordings' && (
        <RecordingsPage onBackToStudio={() => setCurrentPage('studio')} />
      )}

      {currentPage === 'settings' && (
        <SettingsPage onBackToStudio={() => setCurrentPage('studio')} />
      )}
    </div>
  );
};
