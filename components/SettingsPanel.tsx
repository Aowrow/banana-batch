import React, { useState, useEffect, useRef } from 'react';
import { Layers, Monitor, Square, Key, Check, Sun, Moon, Trash2 } from 'lucide-react';
import { AppSettings, AspectRatio, Resolution } from '../types';

interface SettingsPanelProps {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onClearAll?: () => void;
  hasMessages?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, updateSettings, apiKey, onApiKeyChange, theme, onThemeChange, onClearAll, hasMessages }) => {
  const [isKeyOpen, setIsKeyOpen] = useState(false);
  const [localKey, setLocalKey] = useState(apiKey);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsKeyOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
      setLocalKey(apiKey);
  }, [apiKey]);

  const handleKeySave = () => {
    onApiKeyChange(localKey);
    setIsKeyOpen(false);
  };

  const isLight = theme === 'light';

  return (
    <div className={`flex flex-wrap items-center gap-4 backdrop-blur-md px-4 py-2 rounded-lg border relative transition-colors duration-200 ${
      isLight
        ? 'bg-gray-100/80 border-gray-300'
        : 'bg-zinc-900/50 border-zinc-800'
    }`}>
      
      {/* Batch Size Slider */}
      <div className={`flex items-center space-x-3 border-r pr-4 ${
        isLight ? 'border-gray-300' : 'border-zinc-700'
      }`}>
        <div className={`flex items-center ${isLight ? 'text-gray-600' : 'text-zinc-400'}`} title="Batch Size">
          <Layers size={16} />
        </div>
        <input 
            type="range" 
            min="1" 
            max="20" 
            step="1"
            value={settings.batchSize} 
            onChange={(e) => updateSettings({ batchSize: Number(e.target.value) })}
            className={`w-20 h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all focus:outline-none ${
              isLight ? 'bg-gray-300' : 'bg-zinc-700'
            }`}
        />
        <div className={`min-w-[1.5rem] text-center text-sm font-bold ${
          isLight ? 'text-indigo-600' : 'text-indigo-400'
        }`}>
            {settings.batchSize}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="flex items-center space-x-2">
         <Square size={16} className={isLight ? 'text-gray-600' : 'text-zinc-400'} />
         <select 
            value={settings.aspectRatio} 
            onChange={(e) => updateSettings({ aspectRatio: e.target.value as AspectRatio })}
            className={`text-xs font-medium rounded px-2 py-1 border focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
         >
            <option value="Auto">Auto Ratio</option>
            <option value="1:1">1:1 Square</option>
            <option value="3:4">3:4 Portrait</option>
            <option value="4:3">4:3 Landscape</option>
            <option value="9:16">9:16 Tall</option>
            <option value="16:9">16:9 Wide</option>
         </select>
      </div>

      {/* Resolution */}
      <div className={`flex items-center space-x-2 border-r pr-4 ${
        isLight ? 'border-gray-300' : 'border-zinc-700'
      }`}>
         <Monitor size={16} className={isLight ? 'text-gray-600' : 'text-zinc-400'} />
         <select 
            value={settings.resolution} 
            onChange={(e) => updateSettings({ resolution: e.target.value as Resolution })}
            className={`text-xs font-medium rounded px-2 py-1 border focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
         >
            <option value="1K">1K (Fast)</option>
            <option value="2K">2K (Pro)</option>
            <option value="4K">4K (Pro)</option>
         </select>
      </div>

      {/* Theme Toggle */}
      <div className="flex items-center">
        <button 
          onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
          className={`p-1.5 rounded transition-colors ${
            isLight 
              ? 'text-yellow-600 hover:text-yellow-700' 
              : 'text-yellow-400 hover:text-yellow-300'
          }`}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      {/* Clear All Messages */}
      {onClearAll && hasMessages && (
        <div className={`flex items-center border-r pr-4 ${
          isLight ? 'border-gray-300' : 'border-zinc-700'
        }`}>
          <button 
            onClick={() => {
              if (window.confirm('确定要清除所有对话历史吗？此操作不可撤销。')) {
                onClearAll();
              }
            }}
            className={`p-1.5 rounded transition-colors ${
              isLight
                ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                : 'text-red-400 hover:text-red-300 hover:bg-red-900/20'
            }`}
            title="清除所有对话历史"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* API Key Toggle */}
      <div className="relative" ref={dropdownRef}>
         <button 
           onClick={() => setIsKeyOpen(!isKeyOpen)}
           className={`p-1.5 rounded transition-colors ${
             apiKey 
               ? 'text-green-500 hover:text-green-400' 
               : isLight 
                 ? 'text-gray-500 hover:text-gray-700' 
                 : 'text-zinc-400 hover:text-zinc-200'
           }`}
           title="Configure API Key"
         >
            <Key size={16} />
         </button>

         {isKeyOpen && (
            <div className={`absolute top-full right-0 mt-3 w-72 border rounded-xl shadow-2xl p-4 z-50 animate-in slide-in-from-top-2 duration-200 ${
              isLight
                ? 'bg-white border-gray-300'
                : 'bg-zinc-950 border-zinc-800'
            }`}>
                <div className={`text-xs font-medium mb-2 ${
                  isLight ? 'text-gray-600' : 'text-zinc-400'
                }`}>Gemini API Key</div>
                <div className="flex space-x-2">
                    <input 
                       type="password"
                       value={localKey}
                       onChange={(e) => setLocalKey(e.target.value)}
                       placeholder="Enter API Key..."
                       className={`flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 ${
                         isLight
                           ? 'bg-gray-50 border-gray-300 text-gray-900'
                           : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                       }`}
                    />
                    <button 
                       onClick={handleKeySave}
                       className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded"
                    >
                       <Check size={16} />
                    </button>
                </div>
                <p className={`text-[10px] mt-2 leading-tight ${
                  isLight ? 'text-gray-500' : 'text-zinc-600'
                }`}>
                    Key is stored locally in your browser. <br/>
                    Leave empty to use system default.
                </p>
            </div>
         )}
      </div>

    </div>
  );
};

export default SettingsPanel;