import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Film,
  HardDrive,
  Mic,
  Play,
  Share2,
  Square,
  Trash2,
  Video,
} from 'lucide-react';
import { apiFetch, fetchAuthorizedBlobUrl } from '../lib/api.ts';
import type { EvidenceRecord, SosSession, UserPublic } from '../types/safeher.ts';

interface EvidenceGalleryViewProps {
  user: UserPublic;
  evidence: EvidenceRecord[];
  totalBytes: number;
  activeSos: SosSession | null;
  onEvidenceUpdated: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function EvidenceGalleryView({
  user,
  evidence,
  totalBytes,
  activeSos,
  onEvidenceUpdated,
}: EvidenceGalleryViewProps) {
  const [filter, setFilter] = useState<'all' | 'audio' | 'video'>('all');
  const [recordingKind, setRecordingKind] = useState<'audio' | 'video' | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [playingItem, setPlayingItem] = useState<EvidenceRecord | null>(null);
  const [playingBlobUrl, setPlayingBlobUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (playingBlobUrl) URL.revokeObjectURL(playingBlobUrl);
    };
  }, [playingBlobUrl]);

  const startRecording = async (kind: 'audio' | 'video') => {
    setError(null);
    setStatusNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video' ? { facingMode: 'environment' } : false,
      });
      streamRef.current = stream;

      if (kind === 'video' && previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setRecordingKind(kind);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const durationSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const mimeType = recorder.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm');
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordingKind(null);
        await saveDualLocation(blob, kind, mimeType, durationSec);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      timerRef.current = window.setInterval(() => {
        setElapsedSec(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Permission or device error: ${err.message}`
          : 'Unable to access microphone or camera.'
      );
      setRecordingKind(null);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const saveDualLocation = async (
    blob: Blob,
    kind: 'audio' | 'video',
    mimeType: string,
    durationSec: number
  ) => {
    setSaving(true);
    try {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `SAFEHER_${kind.toUpperCase()}_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-')}.${ext}`;

      // Location 2: Automatic save to device gallery / downloads when enabled
      let savedToDeviceGallery = false;
      if (user.settings.media.autoSaveGallery) {
        try {
          const dlUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(dlUrl), 3000);
          savedToDeviceGallery = true;
        } catch {
          savedToDeviceGallery = false;
        }
      }

      // Convert Blob to base64 for Location 1 (SAFEHER Evidence Gallery server vault)
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = String(reader.result || '');
          const commaIdx = result.indexOf(',');
          resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = () => reject(new Error('Failed to encode recording.'));
        reader.readAsDataURL(blob);
      });

      await apiFetch('/api/evidence', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          fileName,
          mimeType,
          durationSec,
          base64Data,
          savedToDeviceGallery,
          sosSessionId: activeSos?.id || null,
        }),
      });

      setStatusNotice(
        savedToDeviceGallery
          ? 'Saved in both SAFEHER Evidence Gallery and exported to your device media folder.'
          : 'Saved securely in SAFEHER Evidence Gallery. Use Export anytime to save to your device gallery.'
      );
      onEvidenceUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store recording.');
    } finally {
      setSaving(false);
    }
  };

  const handlePlay = async (item: EvidenceRecord) => {
    setError(null);
    if (playingBlobUrl) {
      URL.revokeObjectURL(playingBlobUrl);
      setPlayingBlobUrl(null);
    }
    try {
      const url = await fetchAuthorizedBlobUrl(`/api/evidence/${item.id}/media`);
      setPlayingItem(item);
      setPlayingBlobUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback failed.');
    }
  };

  const handleExport = async (item: EvidenceRecord) => {
    try {
      const url = await fetchAuthorizedBlobUrl(`/api/evidence/${item.id}/media`);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleShare = async (item: EvidenceRecord) => {
    try {
      const res = await apiFetch<{ shareUrl: string }>(`/api/evidence/${item.id}/share`, {
        method: 'POST',
      });
      setShareUrl(`${window.location.origin}${res.shareUrl}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create share link.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/evidence/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      if (playingItem?.id === id) {
        setPlayingItem(null);
        setPlayingBlobUrl(null);
      }
      onEvidenceUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const visibleItems = evidence.filter((i) => (filter === 'all' ? true : i.kind === filter));

  return (
    <div className="space-y-6">
      {/* Capture Controls & Transparency */}
      <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold">SAFEHER Evidence Gallery</h2>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2] mt-0.5">
              Authorized emergency audio and video recordings are stored securely in SAFEHER and
              automatically exported to your device gallery when permitted.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
            <HardDrive className="w-4 h-4 text-purple-700 dark:text-purple-300" />
            <span>
              {evidence.length} files · {formatBytes(totalBytes)}
            </span>
          </div>
        </div>

        {/* Recording Buttons */}
        {!recordingKind ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void startRecording('audio')}
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              <Mic className="w-4 h-4" />
              <span>Record Audio Evidence</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => void startRecording('video')}
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              <Video className="w-4 h-4" />
              <span>Record Video Evidence</span>
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-red-700 dark:text-red-300">
                <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
                <span className="font-semibold text-sm">
                  Recording {recordingKind === 'video' ? 'Video & Audio' : 'Audio'} Active
                </span>
                <span className="font-mono-tabular text-sm font-bold">
                  {formatDuration(elapsedSec)}
                </span>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-2"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop & Dual-Save</span>
              </button>
            </div>
            {recordingKind === 'video' && (
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full max-w-sm rounded-xl border border-red-200 dark:border-red-800 bg-black"
              />
            )}
          </div>
        )}

        {saving && (
          <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
            Encrypting and saving recording to SAFEHER Evidence Gallery & device export...
          </p>
        )}

        {statusNotice && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
            {error}
          </div>
        )}
      </section>

      {/* Active Playback Panel */}
      {playingItem && playingBlobUrl && (
        <section className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-300 dark:border-purple-700 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">{playingItem.fileName}</p>
              <p className="text-xs text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
                {new Date(playingItem.createdAt).toLocaleString()} ·{' '}
                {formatDuration(playingItem.durationSec)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPlayingItem(null);
                if (playingBlobUrl) URL.revokeObjectURL(playingBlobUrl);
                setPlayingBlobUrl(null);
              }}
              className="min-h-[36px] px-3 py-1 rounded-lg border border-purple-200 dark:border-purple-800 text-xs font-semibold"
            >
              Close Player
            </button>
          </div>

          {playingItem.kind === 'video' ? (
            <video src={playingBlobUrl} controls className="w-full max-h-[360px] rounded-xl bg-black" />
          ) : (
            <audio src={playingBlobUrl} controls className="w-full" />
          )}
        </section>
      )}

      {/* Share Link Dialog */}
      {shareUrl && (
        <section className="p-4 rounded-2xl bg-purple-50 dark:bg-[#221A34] border border-purple-200 dark:border-purple-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Secure Evidence Share Link Generated</p>
            <p className="font-mono-tabular truncate text-[#574C70] dark:text-[#B9AED2] mt-0.5">
              {shareUrl}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-purple-700 text-white font-semibold flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
            <button
              type="button"
              onClick={() => setShareUrl(null)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-purple-300 dark:border-purple-700 font-semibold"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* Filter & Recordings Grid */}
      <section className="space-y-4">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-purple-100/80 dark:bg-[#201833] w-fit">
          {(
            [
              { id: 'all', label: `All (${evidence.length})` },
              {
                id: 'audio',
                label: `Audio (${evidence.filter((e) => e.kind === 'audio').length})`,
              },
              {
                id: 'video',
                label: `Video (${evidence.filter((e) => e.kind === 'video').length})`,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === t.id
                  ? 'bg-white dark:bg-purple-700 text-purple-950 dark:text-white shadow-sm'
                  : 'text-[#574C70] dark:text-[#B9AED2]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {visibleItems.length === 0 ? (
          <div className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-8 text-center space-y-2">
            <Film className="w-7 h-7 text-purple-600 dark:text-purple-300 mx-auto" />
            <p className="font-semibold text-sm">No recordings saved yet</p>
            <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
              Use Record Audio or Record Video above, or enable auto-recording in SOS Settings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        item.kind === 'video'
                          ? 'bg-pink-100 dark:bg-pink-950/50 text-pink-700 dark:text-pink-300'
                          : 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                      }`}
                    >
                      {item.kind === 'video' ? (
                        <Video className="w-5 h-5" />
                      ) : (
                        <Mic className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{item.fileName}</p>
                      <p className="text-xs text-[#574C70] dark:text-[#B9AED2] font-mono-tabular">
                        {new Date(item.createdAt).toLocaleDateString()} ·{' '}
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {formatDuration(item.durationSec)} · {item.mimeType}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#4C4166] dark:text-[#C8BEE3]">{item.galleryNote}</p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handlePlay(item)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Play</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport(item)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShare(item)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(item.id)}
                    aria-label="Delete recording"
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/70 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-1.5 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

                {confirmDeleteId === item.id && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 flex items-center justify-between gap-2 text-xs">
                    <span>Permanently delete this evidence?</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
