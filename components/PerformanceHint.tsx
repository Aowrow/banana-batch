import React, { useState, useEffect } from 'react';
import { Info, AlertCircle, Zap } from 'lucide-react';

interface PerformanceHintProps {
  theme: 'light' | 'dark';
  batchSize: number;
  provider: 'gemini' | 'openai';
}

const PerformanceHint: React.FC<PerformanceHintProps> = ({ theme, batchSize, provider }) => {
  const isLight = theme === 'light';
  const [isExpanded, setIsExpanded] = useState(false);

  // Performance tips based on settings
  const tips = [];

  if (batchSize > 5) {
    tips.push({
      type: 'warning',
      message: `批次大小设置为 ${batchSize}，可能导致生成较慢。建议降至 2-4 以提升速度。`
    });
  }

  if (provider === 'gemini') {
    tips.push({
      type: 'info',
      message: '使用 Gemini API。免费账户有速率限制（每分钟 15 次请求），付费账户速度更快。'
    });
  } else {
    tips.push({
      type: 'info',
      message: '使用 OpenAI API。不同的账户级别有不同的速率限制。'
    });
  }

  if (tips.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-lg border p-3 ${
      isLight
        ? 'bg-blue-50 border-blue-200'
        : 'bg-blue-900/20 border-blue-800/50'
    }`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center space-x-2">
          <Zap size={16} className={isLight ? 'text-blue-600' : 'text-blue-400'} />
          <span className={`text-sm font-medium ${
            isLight ? 'text-blue-900' : 'text-blue-200'
          }`}>
            生成速度提示
          </span>
        </div>
        <Info size={14} className={isLight ? 'text-blue-500' : 'text-blue-400'} />
      </button>

      {isExpanded && (
        <div className={`mt-3 space-y-2 text-xs ${
          isLight ? 'text-blue-800' : 'text-blue-300'
        }`}>
          {tips.map((tip, index) => (
            <div key={index} className="flex items-start space-x-2">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{tip.message}</span>
            </div>
          ))}

          <div className={`mt-3 pt-3 border-t ${
            isLight ? 'border-blue-200' : 'border-blue-800/50'
          }`}>
            <p className="font-semibold mb-2">影响生成速度的因素：</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>API 账户类型（免费 vs 付费）</li>
              <li>批次大小设置（建议 2-4）</li>
              <li>网络延迟（地理位置）</li>
              <li>参考图片数量和大小</li>
              <li>API 提供商当前负载</li>
            </ul>

            <p className="mt-3 font-semibold">优化建议：</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>降低批次大小以减少等待时间</li>
              <li>使用付费 API 账户获得更高速率限制</li>
              <li>减少参考图片数量</li>
              <li>选择地理位置更近的 API 端点（如使用 BaseURL）</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceHint;
