/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  Newspaper, 
  Lightbulb, 
  BarChart3, 
  Menu, 
  X, 
  Plus, 
  Settings, 
  History,
  ChevronLeft,
  Download,
  Maximize2,
  Volume2,
  VolumeX,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { geminiService, Message } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ViewMode = 'home' | 'chat' | 'image' | 'news' | 'analysis';

export default function App() {
  const [view, setView] = useState<ViewMode>('home');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('keshra_history');
    if (saved) {
      setMessages(JSON.parse(saved));
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('keshra_history', JSON.stringify(messages));
    }
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsRecording(false);
        handleSend(transcript);
      };

      recognitionRef.current.onerror = () => {
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, []);

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setView('chat');
    setIsStreaming(true);

    try {
      const stream = await geminiService.chat(messages, text);
      let fullResponse = '';
      
      const modelMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: '',
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, modelMsg]);

      for await (const chunk of stream) {
        const chunkText = chunk.text || '';
        fullResponse += chunkText;
        setMessages(prev => prev.map(msg => 
          msg.id === modelMsg.id ? { ...msg, content: fullResponse } : msg
        ));
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleVoiceInput = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current?.start();
    }
  };

  const handleTextToSpeech = async (text: string) => {
    if (isPlayingAudio) {
      audioRef.current?.pause();
      setIsPlayingAudio(false);
      return;
    }

    try {
      const audioUrl = await geminiService.textToSpeech(text);
      if (audioUrl) {
        // Cleanup previous URL if it was a blob
        if (audioRef.current?.src.startsWith('blob:')) {
          URL.revokeObjectURL(audioRef.current.src);
        }

        if (audioRef.current) {
          audioRef.current.src = audioUrl;
        } else {
          audioRef.current = new Audio(audioUrl);
        }
        
        audioRef.current.play();
        setIsPlayingAudio(true);
        audioRef.current.onended = () => {
          setIsPlayingAudio(false);
          if (audioRef.current?.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src);
          }
        };
      }
    } catch (error) {
      console.error("TTS Error:", error);
    }
  };

  const handleImageGen = async () => {
    if (!input.trim()) return;
    setIsImageLoading(true);
    setView('image');
    try {
      const url = await geminiService.generateImage(input);
      setGeneratedImage(url);
      setInput('');
    } catch (error) {
      console.error(error);
    } finally {
      setIsImageLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setView('analysis');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setIsStreaming(true);
      try {
        const analysis = await geminiService.analyzeData(content);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          content: analysis || "Analysis failed.",
          timestamp: Date.now(),
          type: 'analysis'
        }]);
        setView('chat');
      } catch (error) {
        console.error(error);
      } finally {
        setIsStreaming(false);
      }
    };
    reader.readAsText(file);
  };

  const quickActions = [
    { icon: ImageIcon, label: 'Create Image', color: 'text-emerald-400', action: () => setView('image') },
    { icon: Newspaper, label: 'Latest News', color: 'text-blue-400', action: () => setView('news') },
    { icon: Lightbulb, label: 'Get Advice', color: 'text-amber-400', action: () => setInput('Give me some creative advice for...') },
    { icon: BarChart3, label: 'Analyze Data', color: 'text-purple-400', action: () => document.getElementById('file-upload')?.click() },
  ];

  return (
    <div className="flex h-screen w-full bg-bg-dark overflow-hidden relative">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={{ x: '-100%' }}
        animate={{ x: isSidebarOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute left-0 top-0 bottom-0 w-72 bg-card-dark border-r border-border-dark z-50 p-6 flex flex-col"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Keshra AI</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <button 
          onClick={() => { setMessages([]); setView('home'); setIsSidebarOpen(false); }}
          className="flex items-center gap-3 w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors mb-6"
        >
          <Plus className="w-5 h-5 text-emerald-400" />
          <span className="font-medium">New Chat</span>
        </button>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4 px-2">Recent History</div>
          <div className="space-y-1">
            {messages.filter(m => m.role === 'user').slice(-5).map(m => (
              <button 
                key={m.id}
                onClick={() => { setView('chat'); setIsSidebarOpen(false); }}
                className="w-full text-left p-3 rounded-xl hover:bg-white/5 text-sm text-white/70 truncate"
              >
                {m.content}
              </button>
            ))}
            {messages.length === 0 && <div className="px-2 text-sm text-white/30 italic">No recent chats</div>}
          </div>
        </div>

        <div className="pt-6 border-t border-border-dark space-y-2">
          <button className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-white/70">
            <History className="w-5 h-5" />
            <span>Activity</span>
          </button>
          <button className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 text-white/70">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-border-dark bg-bg-dark/80 backdrop-blur-md z-30">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/5 rounded-full">
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-display font-bold tracking-tight">Keshra</span>
          </div>

          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px]">
            <div className="w-full h-full rounded-full bg-bg-dark flex items-center justify-center overflow-hidden">
              <img src="https://picsum.photos/seed/user/100/100" alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar relative">
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full flex flex-col items-center justify-center p-6 text-center"
              >
                {/* Glowing Orb */}
                <div className="relative mb-12">
                  <div className="w-32 h-32 rounded-full bg-emerald-500/20 orb-glow absolute -inset-4" />
                  <div className="w-32 h-32 rounded-full bg-emerald-500/40 orb-glow absolute -inset-2" />
                  <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-emerald-400 to-teal-300 shadow-[0_0_50px_rgba(16,185,129,0.5)] flex items-center justify-center relative z-10">
                    <Sparkles className="w-12 h-12 text-white" />
                  </div>
                </div>

                <h1 className="text-3xl font-display font-bold mb-2">How can I help you?</h1>
                <p className="text-white/50 mb-12 max-w-xs">Your premium AI assistant for creation, analysis, and daily tasks.</p>

                <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                  {quickActions.map((action, i) => (
                    <motion.button
                      key={action.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={action.action}
                      className="p-4 rounded-2xl bg-card-dark border border-border-dark hover:border-emerald-500/50 transition-all flex flex-col items-center gap-3 group"
                    >
                      <action.icon className={cn("w-6 h-6", action.color)} />
                      <span className="text-sm font-medium text-white/80">{action.label}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {view === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col p-4 space-y-6 pb-24"
                ref={scrollRef}
              >
                {messages.map((msg) => (
                  <div 
                    key={msg.id}
                    className={cn(
                      "flex w-full",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className={cn(
                      "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-emerald-600 text-white rounded-tr-none" 
                        : "bg-card-dark border border-border-dark text-white/90 rounded-tl-none"
                    )}>
                      <div className="markdown-body">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                      {msg.role === 'model' && (
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-4">
                          <button 
                            onClick={() => handleTextToSpeech(msg.content)}
                            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                          >
                            {isPlayingAudio ? <VolumeX className="w-4 h-4 text-emerald-400" /> : <Volume2 className="w-4 h-4 text-white/40" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-card-dark border border-border-dark p-4 rounded-2xl rounded-tl-none">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {view === 'image' && (
              <motion.div 
                key="image"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center p-6"
              >
                <div className="w-full max-w-md aspect-square rounded-3xl bg-card-dark border border-border-dark overflow-hidden relative flex items-center justify-center">
                  {isImageLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                      <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                      <p className="text-white/50 text-sm animate-pulse">Generating your masterpiece...</p>
                    </div>
                  ) : generatedImage ? (
                    <>
                      <img src={generatedImage} alt="Generated" className="w-full h-full object-cover" />
                      <div className="absolute bottom-4 right-4 flex gap-2">
                        <button className="p-3 bg-black/60 backdrop-blur-md rounded-xl hover:bg-black/80 transition-colors">
                          <Download className="w-5 h-5" />
                        </button>
                        <button className="p-3 bg-black/60 backdrop-blur-md rounded-xl hover:bg-black/80 transition-colors">
                          <Maximize2 className="w-5 h-5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-8">
                      <ImageIcon className="w-12 h-12 text-white/20 mx-auto mb-4" />
                      <p className="text-white/40">Describe an image below to generate it.</p>
                    </div>
                  )}
                </div>
                
                <div className="mt-8 w-full max-w-md">
                  <h3 className="font-display font-bold mb-2">Prompt Tips</h3>
                  <div className="flex flex-wrap gap-2">
                    {['Cyberpunk city', 'Oil painting', 'Hyper-realistic', 'Minimalist logo'].map(tip => (
                      <button 
                        key={tip}
                        onClick={() => setInput(tip)}
                        className="px-3 py-1.5 rounded-full bg-white/5 border border-border-dark text-xs text-white/60 hover:bg-white/10"
                      >
                        {tip}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'news' && (
              <motion.div 
                key="news"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full p-6 space-y-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-display font-bold">AI News</h2>
                  <button onClick={() => setView('home')} className="text-emerald-400 text-sm font-medium">Back Home</button>
                </div>
                
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-card-dark border border-border-dark rounded-2xl overflow-hidden group">
                    <div className="h-40 bg-white/5 relative overflow-hidden">
                      <img 
                        src={`https://picsum.photos/seed/news${i}/600/400`} 
                        alt="News" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-3 left-3 px-2 py-1 bg-emerald-500 text-[10px] font-bold uppercase rounded">Trending</div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold mb-2 line-clamp-2">Gemini 3.1 Pro Preview: The next leap in AI reasoning and multimodal understanding</h3>
                      <p className="text-sm text-white/50 line-clamp-2 mb-4">Google announces major updates to its flagship models, bringing enhanced performance to developers worldwide.</p>
                      <div className="flex items-center justify-between text-xs text-white/30">
                        <span>2 hours ago</span>
                        <span>Read more →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-bg-dark via-bg-dark/95 to-transparent z-40">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-card-dark border border-border-dark rounded-2xl p-2 shadow-2xl focus-within:border-emerald-500/50 transition-colors">
              <div className="flex items-center gap-1 pb-1">
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  accept=".csv,.txt" 
                  onChange={handleFileUpload}
                />
                <button 
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    view === 'image' ? handleImageGen() : handleSend();
                  }
                }}
                placeholder={view === 'image' ? "Describe the image..." : "Message Keshra..."}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-2 no-scrollbar resize-none max-h-32 min-h-[40px]"
                rows={1}
              />

              <div className="flex items-center gap-1 pb-1">
                <button 
                  onClick={handleVoiceInput}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    isRecording ? "bg-red-500 text-white animate-pulse" : "hover:bg-white/5 text-white/40 hover:text-white"
                  )}
                >
                  <Mic className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => view === 'image' ? handleImageGen() : handleSend()}
                  disabled={!input.trim() || isStreaming || isImageLoading}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    input.trim() && !isStreaming && !isImageLoading
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                      : "bg-white/5 text-white/20"
                  )}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="mt-2 flex justify-center gap-4">
              <button 
                onClick={() => setView('chat')}
                className={cn(
                  "text-[10px] font-bold uppercase tracking-widest transition-colors",
                  view === 'chat' ? "text-emerald-400" : "text-white/20"
                )}
              >
                Chat
              </button>
              <button 
                onClick={() => setView('home')}
                className={cn(
                  "text-[10px] font-bold uppercase tracking-widest transition-colors",
                  view === 'home' ? "text-emerald-400" : "text-white/20"
                )}
              >
                Home
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
