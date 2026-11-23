import React from 'react';
import { LogOut, ShieldCheck, X } from 'lucide-react';
import type { AuthUser } from '../types/nova';
import { NovaLogo } from './NovaLogo';

interface AccountModalProps {
  user: AuthUser;
  savedCount: number;
  onClose: () => void;
  onLogout: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  user,
  savedCount,
  onClose,
  onLogout,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nova-account-title"
      className="fixed inset-0 z-50 bg-[#141414]/45 flex items-center justify-center p-4"
    >
      <div className="corner-brackets w-full max-w-[440px] bg-[#efece6] border border-[#141414]/30 text-[#141414] shadow-xl">
        <span className="cb-tl" />
        <span className="cb-tr" />
        <span className="cb-bl" />
        <span className="cb-br" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-[#141414]/15">
          <NovaLogo />
          <button
            type="button"
            aria-label="Close account settings"
            onClick={onClose}
            className="p-1.5 text-[#141414]/60 hover:text-[#141414] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-1 pb-4 border-b border-[#141414]/15">
            <h2 id="nova-account-title" className="text-[20px] font-medium tracking-[-0.02em]">
              {user.name}
            </h2>
            <p className="font-mono text-[12px] text-[#141414]/65">{user.email}</p>
            <p className="font-mono-label text-[10px] text-[#141414]/55 tabular-nums pt-1">
              {user.role} · {savedCount} saved {savedCount === 1 ? 'conversation' : 'conversations'}
            </p>
          </div>

          <div className="p-3.5 border border-[#141414]/15 bg-[#f6f4ef] flex items-start gap-2.5 text-[12.5px] text-[#141414]/75 leading-[1.5]">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#141414]" aria-hidden="true" />
            <div>
              <div className="font-medium text-[#141414] mb-0.5">
                {user.role.includes('Account') ? 'OAuth Single Sign-On Active' : 'Account Security Active'}
              </div>
              <p>
                {user.role.includes('Account')
                  ? `Your workspace session is authenticated via ${user.role}. Account credentials and security settings are managed directly by your identity provider.`
                  : 'Your workspace session is authenticated via email & password with scrypt password hashing and HttpOnly session cookies.'}
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="h-9 px-3.5 border border-[#141414]/30 hover:bg-[#141414] hover:text-[#efece6] font-mono-label text-[10.5px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
