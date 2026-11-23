import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sparkles, AlertCircle } from 'lucide-react';
import type { AiModelMeta } from '../types/nova';

export const DEFAULT_MODELS: AiModelMeta[] = [
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'gemini',
    name: 'Gemini 3.5 Flash',
    providerName: 'Google Gemini',
    badge: 'Active · Ready',
    logo: '/models/gemini.png',
    status: 'active',
    description: 'Ultra-fast multimodal SQL generation and schema reasoning (Google)',
  },
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek V3',
    providerName: 'DeepSeek',
    badge: 'Key Added · Needs Credits',
    logo: '/models/deepseek.png',
    status: 'quota_needed',
    description: 'High-capability code & database architecture synthesis (DeepSeek)',
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    providerName: 'OpenAI',
    badge: 'Key Added · Needs Credits',
    logo: '/models/openai.png',
    status: 'quota_needed',
    description: 'Advanced logical reasoning and query optimization (OpenAI)',
  },
  {
    id: 'claude-3-5-sonnet',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    providerName: 'Anthropic',
    badge: 'Key Added · Needs Credits',
    logo: '/models/claude.png',
    status: 'quota_needed',
    description: 'Nuanced SQL DDL design and architectural analysis (Anthropic)',
  },
];

export const DEFAULT_ACTIVE_MODEL: AiModelMeta = DEFAULT_MODELS[0];

interface ModelSelectorProps {
  value: AiModelMeta;
  onChange: (model: AiModelMeta) => void;
  models?: AiModelMeta[];
  className?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  models = DEFAULT_MODELS,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-8 px-2.5 bg-[#f6f4ef] border border-[#141414]/25 hover:border-[#141414] font-mono-label text-[10.5px] text-[#141414] inline-flex items-center gap-2 transition-colors cursor-pointer focus:outline-none"
        title={`Selected Model: ${value.name} (${value.providerName})`}
      >
        <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
          <img
            src={value.logo}
            alt={value.providerName}
            className="w-4 h-4 object-contain rounded-xs"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-[#f6f4ef] ${
              value.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
        </span>
        <span className="font-medium tracking-tight whitespace-nowrap hidden sm:inline">
          {value.name}
        </span>
        <span className="font-medium tracking-tight whitespace-nowrap sm:hidden">
          {value.providerName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#141414]/50 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Select AI Model"
          className="absolute right-0 top-full mt-1.5 w-80 sm:w-96 bg-[#fbf9f5] border border-[#141414] shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-150 divide-y divide-[#141414]/10"
        >
          {/* Header */}
          <div className="p-3 bg-[#f2eee6]">
            <div className="flex items-center justify-between">
              <span className="font-mono-label text-[9.5px] tracking-wider text-[#141414]/70 uppercase font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#ff5a5f]" />
                Select AI Engine
              </span>
              <span className="font-mono text-[9px] text-[#141414]/50">
                {models.length} Available
              </span>
            </div>
            <p className="text-[11px] text-[#141414]/75 mt-0.5">
              Switch the foundation model driving SQL reasoning, schema design, and query optimization.
            </p>
          </div>

          {/* Model Options */}
          <div className="p-1.5 space-y-1 max-h-[380px] overflow-y-auto nova-scroll">
            {models.map((m) => {
              const isSelected = m.id === value.id;
              const isActive = m.status === 'active';

              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(m);
                    setIsOpen(false);
                  }}
                  className={`w-full p-2.5 text-left border transition-all cursor-pointer flex items-start gap-3 rounded-none group ${
                    isSelected
                      ? 'border-[#141414] bg-[#efece6]'
                      : 'border-transparent hover:border-[#141414]/20 hover:bg-[#f6f4ef]'
                  }`}
                >
                  {/* Model Logo */}
                  <div className="w-8 h-8 rounded border border-[#141414]/15 bg-white flex items-center justify-center shrink-0 p-1 mt-0.5 shadow-xs">
                    <img
                      src={m.logo}
                      alt={m.providerName}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Model Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[12px] font-semibold text-[#141414] truncate">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-[#141414]/50 font-mono">
                          ({m.providerName})
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-[#141414] shrink-0" />
                      )}
                    </div>

                    <p className="text-[11px] text-[#141414]/70 mt-0.5 line-clamp-2 leading-relaxed">
                      {m.description}
                    </p>

                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] font-medium border ${
                          isActive
                            ? 'bg-emerald-50 border-emerald-500/30 text-emerald-700'
                            : 'bg-amber-50 border-amber-500/30 text-amber-800'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        {m.badge}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="p-2.5 bg-[#f6f4ef] flex items-center gap-2 text-[10px] text-[#141414]/65">
            <AlertCircle className="w-3 h-3 text-[#141414]/40 shrink-0" />
            <span>
              Google Gemini is active and ready. DeepSeek, OpenAI, &amp; Claude keys are saved and active once prepaid credits exist.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
