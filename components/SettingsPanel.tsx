import React, { useState, useEffect, useRef } from 'react';
import { Layers, Monitor, Square, Key, Check } from 'lucide-react';
import { AppSettings, AspectRatio, Resolution } from '../types';

interface SettingsPanelProps {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, updateSettings, apiKey, onApiKeyChange }) => {
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

  return (
    <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 backdrop-blur-md px-4 py-2 rounded-lg border border-zinc-800 relative">
      
      {/* Batch Size Slider */}
      <div className="flex items-center space-x-3 border-r border-zinc-700 pr-4">
        <div className="flex items-center text-zinc-400" title="Batch Size">
          <Layers size={16} />
        </div>
        <input 
            type="range" 
            min="1" 
            max="20" 
            step="1"
            value={settings.batchSize} 
            onChange={(e) => updateSettings({ batchSize: Number(e.target.value) })}
            className="w-20 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all focus:outline-none"
        />
        <div className="min-w-[1.5rem] text-center text-sm font-bold text-indigo-400">
            {settings.batchSize}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="flex items-center space-x-2">
         <Square size={16} className="text-zinc-400" />
         <select 
            value={settings.aspectRatio} 
            onChange={(e) => updateSettings({ aspectRatio: e.target.value as AspectRatio })}
            className="bg-zinc-800 text-xs font-medium rounded px-2 py-1 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-indigo-500 hover:bg-zinc-700 cursor-pointer"
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
      <div className="flex items-center space-x-2 border-r border-zinc-700 pr-4">
         <Monitor size={16} className="text-zinc-400" />
         <select 
            value={settings.resolution} 
            onChange={(e) => updateSettings({ resolution: e.target.value as Resolution })}
            className="bg-zinc-800 text-xs font-medium rounded px-2 py-1 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-indigo-500 hover:bg-zinc-700 cursor-pointer"
         >
            <option value="1K">1K (Fast)</option>
            <option value="2K">2K (Pro)</option>
            <option value="4K">4K (Pro)</option>
         </select>
      </div>

      {/* API Key Toggle */}
      <div className="relative" ref={dropdownRef}>
         <button 
           onClick={() => setIsKeyOpen(!isKeyOpen)}
           className={`p-1.5 rounded transition-colors ${apiKey ? 'text-green-500 hover:text-green-400' : 'text-zinc-400 hover:text-zinc-200'}`}
           title="Configure API Key"
         >
            <Key size={16} />
         </button>

         {isKeyOpen && (
            <div className="absolute top-full right-0 mt-3 w-72 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-4 z-50 animate-in slide-in-from-top-2 duration-200">
                <div className="text-xs font-medium text-zinc-400 mb-2">Gemini API Key</div>
                <div className="flex space-x-2">
                    <input 
                       type="password"
                       value={localKey}
                       onChange={(e) => setLocalKey(e.target.value)}
                       placeholder="Enter API Key..."
                       className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                    <button 
                       onClick={handleKeySave}
                       className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded"
                    >
                       <Check size={16} />
                    </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2 leading-tight">
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