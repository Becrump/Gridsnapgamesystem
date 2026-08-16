
import { useState, useEffect, useRef, useCallback } from 'react';

export function useVibeVoice(enabled: boolean = true) {
  const [isReady, setIsReady] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const isSpeakingRef = useRef(false);
  
  // Initialize Voice Engine - Lightweight Mode
  useEffect(() => {
    if (!window.speechSynthesis) return;

    const loadVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            // Priority: Google English -> Microsoft David/Daniel -> Any English Male
            const preferred = voices.find(v => 
                (v.name.includes('Google') && v.name.includes('English') && !v.name.includes('Female')) || 
                v.name.includes('Daniel') || 
                v.name.includes('Microsoft David') ||
                (v.lang.startsWith('en') && v.name.includes('Male'))
            ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
            
            voiceRef.current = preferred || null;
            setIsReady(true);
        }
    };

    loadVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoice;
    }
    
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const speak = useCallback((text: string) => {
      if (!enabled || !window.speechSynthesis || !voiceRef.current) return;

      // Cancel any ongoing speech to prevent resource backlog/lag
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.voice = voiceRef.current;
      u.rate = 1.0; // Keep standard rate for performance stability
      u.pitch = 1.0; // Keep standard pitch to avoid artifacting on low-end devices
      
      u.onstart = () => { isSpeakingRef.current = true; };
      u.onend = () => { isSpeakingRef.current = false; };
      u.onerror = () => { isSpeakingRef.current = false; };

      window.speechSynthesis.speak(u);
  }, [enabled]);

  return { speak, isReady };
}
