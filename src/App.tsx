/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  Search, 
  Play, 
  Download, 
  Trash2, 
  ChevronLeft, 
  Sparkles, 
  ListMusic, 
  Info,
  Pause,
  Eye,
  X,
  Zap
} from 'lucide-react';
import { Recording, View } from './types';

// --- Web Speech API Types ---
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// --- Components ---

const StarBackground = () => {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#050b18]">
      <div className="absolute inset-0 opacity-40">
        {[...Array(250)].map((_, i) => {
          const size = Math.random() * 2.5;
          const isColored = Math.random() > 0.8;
          const color = isColored 
            ? (Math.random() > 0.5 ? 'rgba(34, 211, 238, 0.8)' : 'rgba(168, 85, 247, 0.8)')
            : 'rgba(255, 255, 255, 0.8)';
          
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: color,
                boxShadow: `0 0 ${size * 4}px ${color}`,
                animation: `twinkle ${3 + Math.random() * 7}s infinite ease-in-out`,
                animationDelay: `${Math.random() * 5}s`,
              }}
            />
          );
        })}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,42,102,0.2)_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(34,211,238,0.05)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(168,85,247,0.05)_0%,transparent_50%)]" />
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

// --- IndexedDB Helper ---
const DB_NAME = 'NebulaDB';
const STORE_NAME = 'audio_blobs';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveAudioBlob = async (id: string, blob: Blob) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getAudioBlob = async (id: string): Promise<Blob | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const deleteAudioBlob = async (id: string) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export default function App() {
  const [view, setView] = useState<View>('main');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [expandedRecordingId, setExpandedRecordingId] = useState<string | null>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimeRef = useRef<number>(0);

  // Check for SpeechRecognition support on mount
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
    }
  }, []);

  // Load recordings from localStorage and re-generate blobUrls
  useEffect(() => {
    const loadRecordings = async () => {
      const saved = localStorage.getItem('nebula_recordings');
      if (saved) {
        try {
          const parsed: Recording[] = JSON.parse(saved);
          
          // Re-generate blobUrls from IndexedDB
          const updatedRecordings = await Promise.all(parsed.map(async (rec) => {
            const blob = await getAudioBlob(rec.id);
            if (blob) {
              return { ...rec, blobUrl: URL.createObjectURL(blob) };
            }
            return rec;
          }));
          
          setRecordings(updatedRecordings);
        } catch (e) {
          console.error("Failed to parse saved recordings", e);
        }
      }
    };
    loadRecordings();
  }, []);

  // Save recordings metadata to localStorage
  useEffect(() => {
    // We don't want to save the blobUrls to localStorage as they are temporary
    const metadataOnly = recordings.map(({ blobUrl, ...rest }) => rest);
    localStorage.setItem('nebula_recordings', JSON.stringify(metadataOnly));
  }, [recordings]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      transcriptRef.current = '';

      // Initialize Web Speech API for non-AI transcription
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let fullTranscript = '';
          for (let i = 0; i < event.results.length; ++i) {
            fullTranscript += event.results[i][0].transcript;
          }
          transcriptRef.current = fullTranscript;
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Give a tiny bit of time for the final speech recognition results to process
        setTimeout(async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const id = Date.now().toString();
          
          // Save blob to IndexedDB for persistence
          await saveAudioBlob(id, audioBlob);
          
          const blobUrl = URL.createObjectURL(audioBlob);
          
          const newRecording: Recording = {
            id,
            timestamp: Date.now(),
            duration: recordingTimeRef.current,
            blobUrl: blobUrl,
            transcript: transcriptRef.current || (SpeechRecognition ? "No voice detected." : "Transcription not supported in this browser.")
          };

          setRecordings(prev => [newRecording, ...prev]);
        }, 100);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 1;
          recordingTimeRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Removed processTranscription as it's now handled in real-time

  const deleteRecording = async (id: string) => {
    await deleteAudioBlob(id);
    setRecordings(prev => prev.filter(rec => rec.id !== id));
  };

  const playRecording = (rec: Recording) => {
    if (currentlyPlaying === rec.id) {
      audioRef.current?.pause();
      setCurrentlyPlaying(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = rec.blobUrl;
        audioRef.current.play();
        setCurrentlyPlaying(rec.id);
        audioRef.current.onended = () => setCurrentlyPlaying(null);
      }
    }
  };

  const downloadRecording = (rec: Recording) => {
    const date = new Date(rec.timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    const filename = `recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.mp4`;

    const link = document.createElement('a');
    link.href = rec.blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(new Date(timestamp)).toUpperCase();
  };

  const filteredRecordings = recordings.filter(rec => 
    rec.transcript?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    formatDate(rec.timestamp).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#050b18] text-white font-sans selection:bg-cyan-500/30">
      <StarBackground />
      <audio ref={audioRef} className="hidden" />

      <div className="relative z-10 flex flex-col h-screen max-w-4xl mx-auto px-6">
        
        {/* --- Navigation Header --- */}
        <header className="py-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {view !== 'main' && (
              <button 
                onClick={() => setView('main')}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                id="back-button"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            <h1 className="text-2xl font-bold tracking-tight">
              {view === 'main' ? '' : view === 'recordings' ? 'Recordings' : view === 'nebula' ? 'Nebula' : 'Nebula Fragment'}
            </h1>
          </div>
        </header>

        {/* --- Main Content --- */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            
            {/* --- Main View --- */}
            {view === 'main' && (
              <motion.div 
                key="main"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 flex flex-col items-center justify-center relative"
              >
                <div className="flex-1 flex flex-col items-center justify-center">
                  {!isSpeechSupported && (
                    <div className="mb-8 px-6 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-200/80 text-sm max-w-sm text-center">
                      <Info size={18} className="shrink-0" />
                      <p>Transcription is not supported in this browser. Try Chrome or Edge for the full experience.</p>
                    </div>
                  )}
                  <div className="relative">
                    {/* Ripple effects when recording */}
                    {isRecording && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div 
                          animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute w-64 h-64 rounded-full border border-cyan-500/30"
                        />
                        <motion.div 
                          animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                          className="absolute w-64 h-64 rounded-full border border-cyan-500/20"
                        />
                      </div>
                    )}
                    
                    <button 
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`relative z-10 w-48 h-48 rounded-full flex flex-col items-center justify-center transition-all duration-500 ${
                        isRecording 
                        ? 'bg-red-500/20 border-2 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.3)]' 
                        : 'bg-white/5 border border-white/10 hover:bg-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]'
                      }`}
                      id="mic-button"
                    >
                      <Mic size={48} className={isRecording ? 'text-red-500' : 'text-white'} />
                      <span className="mt-4 text-xs font-bold tracking-[0.2em] uppercase opacity-60">
                        {isRecording ? formatTime(recordingTime) : 'JUST SAY IT'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Bottom Navigation */}
                <div className="w-full pb-12 flex justify-center gap-24">
                  <button 
                    onClick={() => setView('recordings')}
                    className="flex flex-col items-center gap-2 group"
                    id="nav-recordings"
                  >
                    <div className="p-4 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                      <ListMusic size={24} className="text-white/60 group-hover:text-white" />
                    </div>
                    <span className="text-[10px] font-bold tracking-widest uppercase opacity-40 group-hover:opacity-100 transition-opacity">RECORDINGS</span>
                  </button>
                  <button 
                    onClick={() => setView('nebula')}
                    className="flex flex-col items-center gap-2 group"
                    id="nav-nebula"
                  >
                    <div className="p-4 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                      <Sparkles size={24} className="text-white/60 group-hover:text-white" />
                    </div>
                    <span className="text-[10px] font-bold tracking-widest uppercase opacity-40 group-hover:opacity-100 transition-opacity">NEBULA</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* --- Recordings View --- */}
            {view === 'recordings' && (
              <motion.div 
                key="recordings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto pr-2 space-y-4 pb-12"
              >
                {/* Search Input below heading */}
                <div className="relative mb-6">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input 
                    type="text"
                    placeholder="Search within memories..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:text-white/20"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    id="search-input"
                  />
                </div>

                {filteredRecordings.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20">
                    <ListMusic size={64} />
                    <p className="mt-4">No memories found</p>
                  </div>
                ) : (
                  filteredRecordings.map((rec) => (
                    <div 
                      key={rec.id}
                      className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all"
                      id={`recording-${rec.id}`}
                    >
                      <div className="p-6 flex items-center justify-between group hover:bg-white/[0.07] transition-all">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-mono text-white/40 tracking-wider">
                            {formatDate(rec.timestamp)}
                          </span>
                          <span className="text-[10px] font-bold tracking-widest text-white/20 uppercase">
                            {formatTime(rec.duration)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => playRecording(rec)}
                            className="p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                            title="Play"
                          >
                            {currentlyPlaying === rec.id ? <Pause size={18} /> : <Play size={18} />}
                          </button>
                          <button 
                            onClick={() => setExpandedRecordingId(expandedRecordingId === rec.id ? null : rec.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-xs font-bold tracking-wider ${
                              expandedRecordingId === rec.id ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 hover:bg-white/10'
                            }`}
                            title="Read Transcript"
                          >
                            <Eye size={16} />
                            READ
                          </button>
                          <button 
                            onClick={() => downloadRecording(rec)}
                            className="p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                            title="Download"
                          >
                            <Download size={18} />
                          </button>
                          <button 
                            onClick={() => deleteRecording(rec.id)}
                            className="p-3 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      
                      {/* Expanded Transcript Section */}
                      <AnimatePresence>
                        {expandedRecordingId === rec.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-white/10 bg-white/[0.02]"
                          >
                            <div className="p-6 pt-4">
                              <p className="text-sm text-white/60 italic leading-relaxed">
                                "{rec.transcript || "Transcribing your memory..."}"
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {/* --- Nebula View --- */}
            {view === 'nebula' && (
              <motion.div 
                key="nebula"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 mb-8 flex gap-4 items-start shrink-0">
                  <Info className="text-cyan-400 shrink-0 mt-1" size={20} />
                  <div className="space-y-1">
                    <h3 className="text-[10px] font-bold tracking-widest uppercase text-cyan-400">NEBULA SYSTEM v0.1</h3>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Each point represents a memory. Click a node to view its transcript.
                    </p>
                  </div>
                </div>

                <div className="flex-1 relative overflow-hidden border border-white/5 rounded-3xl bg-white/[0.02]">
                  {/* Sample Nebula Dot */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
                    <motion.button 
                      whileHover={{ scale: 1.2 }}
                      className="w-8 h-8 rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
                      onClick={() => setView('fragment')}
                      id="sample-nebula-dot"
                    />
                    <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-cyan-400">SAMPLE NEBULA</span>
                  </div>

                  {/* Real Memory Dots */}
                  {recordings.map((rec, i) => {
                    // Constrain positions to fit within the container
                    const angle = (i / Math.max(recordings.length, 1)) * Math.PI * 2;
                    const radius = 80 + (i * 15) % 100; // Varying radius but constrained
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    return (
                      <motion.button
                        key={rec.id}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.5 }}
                        className="absolute w-4 h-4 rounded-full shadow-lg bg-cyan-400 shadow-cyan-400/50"
                        style={{
                          left: `calc(50% + ${x}px)`,
                          top: `calc(50% + ${y}px)`,
                        }}
                        onClick={() => {
                          setSelectedRecording(rec);
                          setView('fragment');
                        }}
                        id={`nebula-dot-${rec.id}`}
                      />
                    );
                  })}
                </div>
                <div className="py-8 shrink-0" />
              </motion.div>
            )}

            {/* --- Fragment View --- */}
            {view === 'fragment' && (
              <motion.div 
                key="fragment"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
              >
                <button 
                  onClick={() => {
                    setView('nebula');
                    setSelectedRecording(null);
                  }}
                  className="absolute top-8 right-8 p-2 text-white/40 hover:text-white transition-colors"
                  id="close-fragment"
                >
                  <X size={32} />
                </button>

                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full max-w-2xl bg-[#0a0f1d] border border-white/10 rounded-[40px] overflow-hidden shadow-2xl"
                >
                  <div className="p-8 md:p-12 space-y-10">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {selectedRecording ? (
                          <>
                            <div className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.6)]" />
                            <h2 className="text-2xl font-bold tracking-tight">Nebula Fragment</h2>
                          </>
                        ) : (
                          <>
                            <Sparkles className="text-cyan-400" size={28} />
                            <h2 className="text-2xl font-bold tracking-tight">Future Vision</h2>
                          </>
                        )}
                      </div>
                      {selectedRecording && (
                        <div className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-mono tracking-widest uppercase text-white/40">
                          {formatDate(selectedRecording.timestamp)}
                        </div>
                      )}
                    </div>

                    {/* Content Section */}
                    <div className="space-y-10">
                      <div className="space-y-4">
                        <h3 className="text-[10px] font-bold tracking-widest uppercase text-white/20">
                          {selectedRecording ? "TRANSCRIPT" : "SAMPLE TRANSCRIPT"}
                        </h3>
                        <p className="text-xl md:text-2xl font-light italic leading-relaxed text-white/90">
                          "{selectedRecording?.transcript || "Feeling quite overwhelmed with the current project load. There's a persistent sense of pressure, but also a drive to see it through to completion."}"
                        </p>
                      </div>

                      <div className="h-px bg-white/5" />

                      {selectedRecording ? (
                        /* Resonance Mapping for real recordings */
                        <div className="flex gap-6 items-start opacity-40">
                          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                            <Zap className="text-purple-400" size={20} />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-[10px] font-bold tracking-widest uppercase text-white/40">RESONANCE MAPPING</h3>
                            <p className="text-xs text-white/40 leading-relaxed max-w-md">
                              Future versions will visualize emotional triggers and mental states through color shifts.
                            </p>
                          </div>
                        </div>
                      ) : (
                        /* Emotion Detected for Future Vision sample */
                        <div className="space-y-8">
                          <div className="flex gap-6 items-start">
                            <div className="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                              <Zap className="text-yellow-500" size={20} />
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-[10px] font-bold tracking-widest uppercase text-yellow-500">EMOTION DETECTED: FOCUSED ANXIETY</h3>
                              <p className="text-sm text-white/60 leading-relaxed">
                                The system identifies high <span className="text-white font-medium">Engagement</span> mixed with <span className="text-white font-medium">Stress</span> indicators.
                              </p>
                            </div>
                          </div>

                          <div className="p-8 bg-white/[0.03] rounded-3xl border border-white/5">
                            <p className="text-xs text-white/30 leading-relaxed italic text-center">
                              "If a recording today shares emotional themes with a recording from 25 days ago, a visual connection line will appear between the two nebulae, showing recurring emotional patterns over time."
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
