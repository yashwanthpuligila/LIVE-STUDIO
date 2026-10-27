import React, { useState, useEffect } from 'react';
import {
  Film,
  Play,
  Trash2,
  FolderOpen,
  Edit2,
  Search,
  ArrowLeft,
  Calendar,
  Clock,
  HardDrive,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { RecordingItem } from '../../shared/types';

interface RecordingsPageProps {
  onBackToStudio: () => void;
}

export const RecordingsPage: React.FC<RecordingsPageProps> = ({ onBackToStudio }) => {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingItem, setPlayingItem] = useState<RecordingItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRecordings = async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const list = await window.electronAPI.recordings.getAll();
        setRecordings(list);
      }
    } catch (e) {
      console.error('Failed to load recordings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const handleReveal = (filePath: string) => {
    window.electronAPI?.recordings.reveal(filePath);
  };

  const handleDelete = async (id: string) => {
    if (window.electronAPI) {
      await window.electronAPI.recordings.delete(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (playingItem?.id === id) setPlayingItem(null);
      setDeleteConfirmId(null);
    }
  };

  const handleStartRename = (item: RecordingItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveRename = async (id: string) => {
    if (editTitle.trim() && window.electronAPI) {
      await window.electronAPI.recordings.update(id, { title: editTitle.trim() });
      setRecordings((prev) =>
        prev.map((r) => (r.id === id ? { ...r, title: editTitle.trim() } : r))
      );
    }
    setEditingId(null);
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const filtered = recordings.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0c0d10] text-gray-100 overflow-hidden select-none">
      {/* Top Header */}
      <header className="h-14 bg-[#12141a] border-b border-[#202534] flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToStudio}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a1e2b] hover:bg-[#252b3d] text-gray-300 hover:text-white border border-[#2c3347] text-xs font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Studio Workspace</span>
          </button>
          <div className="h-4 w-[1px] bg-[#292f42]" />
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Film className="w-4 h-4 text-blue-400" />
            <span>Recordings Library</span>
          </div>
          <span className="text-xs text-gray-500 font-mono">({recordings.length} items)</span>
        </div>

        {/* Search */}
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recordings..."
            className="w-full bg-[#181b24] border border-[#2b3142] rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </header>

      {/* Main Grid View */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-gray-500 text-xs gap-3">
            <Film className="w-12 h-12 stroke-[1.2] opacity-30 text-blue-400" />
            <span className="text-sm font-medium text-gray-400">No recordings found</span>
            <p className="text-gray-500">Record a session in the Studio to automatically save high-definition MP4 videos here.</p>
            <button
              onClick={onBackToStudio}
              className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/20"
            >
              Start New Recording
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((item) => {
              const isEditing = editingId === item.id;
              const isDeleting = deleteConfirmId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-[#14161f] border border-[#242938] hover:border-[#353c52] rounded-2xl overflow-hidden shadow-lg flex flex-col group transition-all"
                >
                  {/* Thumbnail / Play trigger */}
                  <div
                    onClick={() => setPlayingItem(item)}
                    className="relative aspect-video bg-[#0a0b0f] cursor-pointer overflow-hidden flex items-center justify-center group-hover:brightness-105 transition-all"
                  >
                    {item.thumbnailPath ? (
                      <img
                        src={item.thumbnailPath}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-10 h-10 text-gray-700" />
                    )}

                    {/* Play button overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl shadow-blue-600/40 transform scale-90 group-hover:scale-100 transition-transform">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur text-[10px] text-gray-200 font-mono-numbers border border-white/10">
                      {formatDuration(item.durationSec)}
                    </div>

                    {/* Resolution badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[10px] text-gray-300 font-mono border border-white/10">
                      {item.resolution}
                    </div>
                  </div>

                  {/* Metadata and Title */}
                  <div className="p-4 flex flex-col gap-2.5 flex-1 justify-between">
                    <div>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(item.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="flex-1 bg-[#10121a] text-white px-2 py-1 rounded text-xs border border-blue-500 focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveRename(item.id)}
                            className="p-1 text-green-400"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <h3
                          className="font-semibold text-gray-200 text-xs truncate hover:text-white cursor-pointer"
                          onClick={() => setPlayingItem(item)}
                          title={item.title}
                        >
                          {item.title}
                        </h3>
                      )}

                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{item.filename}</p>
                    </div>

                    {/* Info rows */}
                    <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono-numbers pt-2 border-t border-[#1e2330]">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-500" />
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-gray-500" />
                        <span>{formatFileSize(item.fileSize)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleStartRename(item)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2434] transition-colors"
                          title="Rename Recording"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleReveal(item.filePath)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2434] transition-colors"
                          title="Show in Windows Explorer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Delete with inline confirmation */}
                      {isDeleting ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete Recording"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- In-App Video Player Modal --- */}
      {playingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in">
          <div className="bg-[#14161f] border border-[#2b3040] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#242938]">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-white text-sm">{playingItem.title}</h3>
                <span className="text-gray-500 text-xs">({playingItem.resolution})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReveal(playingItem.filePath)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#202534] hover:bg-[#2b3246] text-gray-300 hover:text-white text-xs transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Reveal in Explorer</span>
                </button>
                <button
                  onClick={() => setPlayingItem(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#202534]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video Player */}
            <div className="flex-1 bg-black aspect-video flex items-center justify-center overflow-hidden">
              <video
                src={`file:///${playingItem.filePath.replace(/\\/g, '/')}`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
