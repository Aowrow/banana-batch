import React, { useState, KeyboardEvent } from 'react';
import { SendHorizontal, Square } from 'lucide-react';

interface InputAreaProps {
  onSend: (text: string) => void;
  onStop: () => void;
  disabled: boolean; // This now means "isGenerating" essentially
}

const InputArea: React.FC<InputAreaProps> = ({ onSend, onStop, disabled }) => {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800">
      <div className="max-w-4xl mx-auto relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Generating images... Press stop to cancel." : "Describe the image you want to generate..."}
          className="w-full bg-zinc-900 text-zinc-100 border-0 rounded-2xl py-4 pl-4 pr-14 focus:ring-2 focus:ring-indigo-500/50 resize-none min-h-[60px] max-h-[120px] shadow-xl placeholder-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
          rows={1}
          style={{ height: '60px' }} 
        />
        
        {disabled ? (
          <button
            onClick={onStop}
            className="absolute right-2 top-2 bottom-2 aspect-square rounded-xl flex items-center justify-center transition-all bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/50"
            title="Stop Generating"
          >
            <Square size={18} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className={`
              absolute right-2 top-2 bottom-2 aspect-square rounded-xl flex items-center justify-center transition-all
              ${!text.trim() 
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'}
            `}
          >
            <SendHorizontal size={20} />
          </button>
        )}
      </div>
      <div className="max-w-4xl mx-auto mt-2 text-center text-xs text-zinc-600">
        Uses <strong>Flash Image</strong> for 1K (Fast) and <strong>Pro Image</strong> for 2K/4K. Only selected images are remembered.
      </div>
    </div>
  );
};

export default InputArea;