/**
 * AnimatedPlaceholder - Typewriter Effect for Input Placeholders
 *
 * Cycles through example prompts with typing animation to showcase
 * KripTik AI's capabilities.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// Example prompts showcasing KripTik AI capabilities
const EXAMPLE_PROMPTS = [
  "Deploy an AI video generator model to RunPod and create a frontend that calls it...",
  "Build a SaaS CRM with Stripe subscriptions, user auth, and email automation...",
  "Fine-tune the Qwen Coder model to be better at Svelte development...",
  "Create a Next.js app with Supabase auth, real-time chat, and file uploads...",
  "Build an AI image generator with SDXL on Modal.com and a React frontend...",
  "Clone the app at github.com/example/repo and add payment processing...",
  "Create a voice-controlled smart home dashboard with real-time IoT data...",
  "Build a multiplayer game with WebRTC, matchmaking, and leaderboards...",
  "Deploy a custom LLM on RunPod with a RAG pipeline and vector search...",
  "Create an e-commerce platform with inventory, payments, and shipping API...",
  "Build a video transcription service with Whisper and automatic summarization...",
  "Create a mobile-first fitness app with workout tracking and social features...",
  "Build a real-time stock trading dashboard with WebSocket feeds...",
  "Create an AI code review bot that integrates with GitHub webhooks...",
  "Build a document management system with OCR and semantic search...",
  "Create a podcast hosting platform with audio processing and RSS feeds...",
  "Build a collaborative whiteboard with real-time cursors and canvas...",
  "Create an AI-powered resume builder with PDF generation...",
  "Build a recipe app with ingredient recognition and meal planning...",
  "Create a booking system with calendar integration and payments...",
  "Build a learning management system with video courses and quizzes...",
  "Create an AI writing assistant with grammar checking and style suggestions...",
  "Build a social media scheduler with analytics and multi-platform posting...",
  "Create a property management app with tenant portal and maintenance requests...",
  "Build a telemedicine platform with video calls and appointment booking...",
];

interface AnimatedPlaceholderProps {
  isInputFocused: boolean;
  hasValue: boolean;
}

export function AnimatedPlaceholder({ isInputFocused, hasValue }: AnimatedPlaceholderProps) {
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [isPausing, setIsPausing] = useState(false);

  const currentPrompt = EXAMPLE_PROMPTS[currentPromptIndex];

  // Typing effect
  useEffect(() => {
    if (isInputFocused || hasValue) {
      setDisplayedText('');
      return;
    }

    if (isPausing) {
      const pauseTimer = setTimeout(() => {
        setIsPausing(false);
        setIsTyping(false);
      }, 2000);
      return () => clearTimeout(pauseTimer);
    }

    if (isTyping) {
      // Type out the current prompt
      if (displayedText.length < currentPrompt.length) {
        const typeTimer = setTimeout(() => {
          setDisplayedText(currentPrompt.slice(0, displayedText.length + 1));
        }, 35 + Math.random() * 25); // Variable typing speed for realism
        return () => clearTimeout(typeTimer);
      } else {
        // Finished typing, pause before erasing
        setIsPausing(true);
      }
    } else {
      // Erase the text
      if (displayedText.length > 0) {
        const eraseTimer = setTimeout(() => {
          setDisplayedText(displayedText.slice(0, -1));
        }, 15);
        return () => clearTimeout(eraseTimer);
      } else {
        // Finished erasing, move to next prompt
        setCurrentPromptIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
        setIsTyping(true);
      }
    }
  }, [displayedText, currentPrompt, isTyping, isPausing, isInputFocused, hasValue]);

  // Don't show when focused or has value
  if (isInputFocused || hasValue) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        fontSize: '12px',
        fontWeight: 400,
        lineHeight: '1.3',
        padding: '12px 16px',
        letterSpacing: '-0.01em',
      }}
    >
      <span
        style={{
          color: 'rgba(80, 80, 90, 0.55)',
          textShadow: '0 1px 0 rgba(255,255,255,0.5)',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {displayedText}
      </span>

      {/* Blinking cursor - Amber accent */}
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          display: 'inline-block',
          width: '2px',
          height: '14px',
          marginLeft: '2px',
          verticalAlign: 'middle',
          background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
          boxShadow: '0 0 8px rgba(245, 158, 11, 0.5)',
          borderRadius: '1px',
        }}
      />
    </motion.div>
  );
}

export default AnimatedPlaceholder;
