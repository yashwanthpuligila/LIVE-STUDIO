import React, { useEffect, useState } from 'react';
import { Film, Lock, Unlock, ShieldCheck, Trash2, Upload, RefreshCw, KeyRound } from 'lucide-react';
import { BrandClipKind, BrandingInfo } from '../../shared/types';
import { BrandMark } from '../components/BrandMark';

const formatSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const formatMb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;

const inputCls =
  'bg-[#10121a] border border-[#2a3042] rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 w-56';
const primaryBtn =
  'flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50 transition-colors';
const secondaryBtn =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e2332] hover:bg-[#293044] text-gray-200 border border-[#2f374e] disabled:opacity-50 transition-colors';

/**
 * Admin-only branding: the intro/outro that every lecture recording starts and ends with.
 * The PIN is checked in the main process for every change; the unlocked state here is only UI.
 */
export const BrandingAdminPanel: React.FC = () => {
  const [info, setInfo] = useState<BrandingInfo | null>(null);
  const [pin, setPin] = useState('');
  const [unlockedPin, setUnlockedPin] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.branding.getInfo().then(setInfo).catch((e) => setError(e.message));
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (e: any) {
      // Electron prefixes IPC errors with "Error invoking remote method '...': Error: "
      setError(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(null);
    }
  };

  const createPin = () =>
    run('create', async () => {
      if (newPin !== confirmPin) throw new Error('PINs do not match.');
      setInfo(await window.electronAPI.branding.setPin(null, newPin));
      setUnlockedPin(newPin);
      setNewPin('');
      setConfirmPin('');
      setMessage('Admin PIN created.');
    });

  const unlock = () =>
    run('unlock', async () => {
      await window.electronAPI.branding.verifyPin(pin);
      setUnlockedPin(pin);
      setPin('');
    });

  const changePin = () =>
    run('change', async () => {
      if (newPin !== confirmPin) throw new Error('PINs do not match.');
      setInfo(await window.electronAPI.branding.setPin(unlockedPin, newPin));
      setUnlockedPin(newPin);
      setNewPin('');
      setConfirmPin('');
      setMessage('Admin PIN changed.');
    });

  const chooseClip = (kind: BrandClipKind) =>
    run(`choose-${kind}`, async () => {
      setInfo(await window.electronAPI.branding.chooseClip(kind, unlockedPin!));
    });

  const removeClip = (kind: BrandClipKind) =>
    run(`remove-${kind}`, async () => {
      setInfo(await window.electronAPI.branding.removeClip(kind, unlockedPin!));
    });

  if (!info) {
    return <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-white">Branding (Admin)</h3>
        <p className="text-gray-500">
          The intro and outro set here are added to the start and end of every lecture recording. Professors cannot change them.
        </p>
      </div>

      <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5">
        <BrandMark size="md" />
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">{error}</div>}
      {message && <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">{message}</div>}

      {/* First-time setup */}
      {!info.hasAdminPin && (
        <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-white font-semibold">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Create admin PIN</span>
          </div>
          <p className="text-gray-400">Choose a PIN of at least 4 characters. Only people with this PIN can change the intro and outro.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" placeholder="New PIN" value={newPin} onChange={(e) => setNewPin(e.target.value)} className={inputCls} />
            <input type="password" placeholder="Confirm PIN" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} className={inputCls} />
            <button onClick={createPin} disabled={!!busy || !newPin} className={primaryBtn}>
              <KeyRound className="w-4 h-4" />
              <span>Create PIN</span>
            </button>
          </div>
        </div>
      )}

      {/* Locked */}
      {info.hasAdminPin && !unlockedPin && (
        <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Lock className="w-4 h-4 text-blue-400" />
            <span>Admin access required</span>
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              unlock();
            }}
          >
            <input type="password" placeholder="Admin PIN" value={pin} onChange={(e) => setPin(e.target.value)} className={inputCls} autoFocus />
            <button type="submit" disabled={!!busy || !pin} className={primaryBtn}>
              <Unlock className="w-4 h-4" />
              <span>Unlock</span>
            </button>
          </form>
        </div>
      )}

      {/* Clips: always visible, editable only when unlocked */}
      {info.hasAdminPin && (
        <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Film className="w-4 h-4 text-blue-400" />
              <span>Lecture intro & outro</span>
            </div>
            {unlockedPin && (
              <button onClick={() => setUnlockedPin(null)} className={secondaryBtn}>
                <Lock className="w-3.5 h-3.5" />
                <span>Lock</span>
              </button>
            )}
          </div>

          {(['intro', 'outro'] as const).map((kind) => {
            const clip = info[kind];
            const choosing = busy === `choose-${kind}`;
            return (
              <div key={kind} className="p-3 rounded-xl bg-[#10121a] border border-[#222736] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-white capitalize">{kind}</div>
                  {clip ? (
                    <div className="text-[11px] text-gray-400 truncate" title={clip.originalName}>
                      {clip.originalName} • {formatSec(clip.durationSec)} • {formatMb(clip.sizeBytes)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500">Not set — recordings {kind === 'intro' ? 'start' : 'end'} without one</div>
                  )}
                  {choosing && <div className="text-[11px] text-blue-300 mt-1">Preparing video for all laptops… this can take a moment.</div>}
                </div>
                {unlockedPin && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => chooseClip(kind)} disabled={!!busy} className={secondaryBtn}>
                      {choosing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{clip ? 'Replace' : 'Choose video'}</span>
                    </button>
                    {clip && (
                      <button onClick={() => removeClip(kind)} disabled={!!busy} className={secondaryBtn} title={`Remove ${kind}`}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Change PIN */}
      {unlockedPin && (
        <div className="bg-[#14161f] border border-[#242938] rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-white font-semibold">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <span>Change admin PIN</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="password" placeholder="New PIN" value={newPin} onChange={(e) => setNewPin(e.target.value)} className={inputCls} />
            <input type="password" placeholder="Confirm PIN" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} className={inputCls} />
            <button onClick={changePin} disabled={!!busy || !newPin} className={primaryBtn}>
              <span>Change PIN</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
