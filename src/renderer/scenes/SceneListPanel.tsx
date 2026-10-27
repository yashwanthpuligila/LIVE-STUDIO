import React, { useState } from 'react';
import { Layers, Plus, Copy, Trash2, Edit2, Check, X } from 'lucide-react';
import { Scene } from '../../shared/types';

interface SceneListPanelProps {
  scenes: Scene[];
  activeSceneId: string;
  onSelectScene: (id: string) => void;
  onAddScene: (name: string) => void;
  onDuplicateScene: (id: string) => void;
  onRenameScene: (id: string, newName: string) => void;
  onDeleteScene: (id: string) => void;
}

export const SceneListPanel: React.FC<SceneListPanelProps> = ({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onDuplicateScene,
  onRenameScene,
  onDeleteScene,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');

  const handleStartRename = (scene: Scene, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(scene.id);
    setRenameText(scene.name);
  };

  const handleSaveRename = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (renameText.trim()) {
      onRenameScene(id, renameText.trim());
    }
    setEditingId(null);
  };

  const handleCreateScene = () => {
    if (newSceneName.trim()) {
      onAddScene(newSceneName.trim());
      setNewSceneName('');
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-[#14161d] border border-[#262a36] rounded-xl p-3 flex flex-col gap-2 shadow-lg h-full text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-[#222634]">
        <div className="flex items-center gap-2 text-gray-200 font-semibold text-xs">
          <Layers className="w-4 h-4 text-purple-400" />
          <span>Scenes</span>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="p-1 rounded-md bg-[#1f2433] hover:bg-[#2b3247] text-gray-300 hover:text-white transition-colors"
          title="Add Scene"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New Scene inline input */}
      {isAdding && (
        <div className="flex items-center gap-1.5 p-1.5 bg-[#1b1f2c] rounded-lg border border-purple-500/40">
          <input
            autoFocus
            type="text"
            value={newSceneName}
            onChange={(e) => setNewSceneName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateScene();
              if (e.key === 'Escape') setIsAdding(false);
            }}
            placeholder="Scene name..."
            className="flex-1 bg-[#12141c] text-white px-2 py-1 rounded text-xs focus:outline-none"
          />
          <button
            onClick={handleCreateScene}
            className="p-1 text-green-400 hover:text-green-300"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsAdding(false)}
            className="p-1 text-gray-400 hover:text-gray-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Scene Items */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId;
          const isEditing = editingId === scene.id;

          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                isActive
                  ? 'bg-purple-600/20 text-purple-200 border border-purple-500/50 shadow-sm'
                  : 'text-gray-300 hover:bg-[#1a1e2b] border border-transparent'
              }`}
            >
              {isEditing ? (
                <div
                  className="flex items-center gap-1 flex-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    type="text"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename(scene.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="flex-1 bg-[#10121a] text-white px-1.5 py-0.5 rounded text-xs focus:outline-none"
                  />
                  <button
                    onClick={(e) => handleSaveRename(scene.id, e)}
                    className="text-green-400 p-0.5"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? 'bg-purple-400' : 'bg-gray-600'
                    }`}
                  />
                  <span className="font-medium truncate">{scene.name}</span>
                </div>
              )}

              {/* Action buttons on hover */}
              {!isEditing && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleStartRename(scene, e)}
                    className="p-1 hover:text-white text-gray-400"
                    title="Rename"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateScene(scene.id);
                    }}
                    className="p-1 hover:text-white text-gray-400"
                    title="Duplicate Scene"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {scenes.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteScene(scene.id);
                      }}
                      className="p-1 hover:text-red-400 text-gray-400"
                      title="Delete Scene"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
