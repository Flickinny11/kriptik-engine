/**
 * PremiumGlassSelection.tsx - Photorealistic 3D Glass Tiles
 *
 * True 3D glass tiles with:
 * - MeshTransmissionMaterial for photorealistic glass
 * - Visible edges, depth, and thickness
 * - Perspective tilt and light refraction
 * - Real branded SVG icons from LobeHub
 * - GSAP-powered butter-smooth animations
 * - Spline Hanna glass-inspired design
 */

import { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { gsap } from 'gsap';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  MeshTransmissionMaterial,
  Float,
  Environment,
  Lightformer,
  RoundedBox,
  Sphere,
} from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

// =============================================================================
// BRAND SVG ICONS - Extracted from @lobehub/icons
// =============================================================================

const ICONS = {
  // Lovable - gradient path (uses built-in gradient, ignores color param)
  lovable: (_color: string) => (
    <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
      <defs>
        <radialGradient id="lovable-grad" cx="0" cy="0" r="1" gradientTransform="matrix(-1 22.5 -30.45 -1.35 14 3)" gradientUnits="userSpaceOnUse">
          <stop offset=".25" stopColor="#FE7B02"/>
          <stop offset=".433" stopColor="#FE4230"/>
          <stop offset=".548" stopColor="#FE529A"/>
          <stop offset=".654" stopColor="#DD67EE"/>
          <stop offset=".95" stopColor="#4B73FF"/>
        </radialGradient>
      </defs>
      <path clipRule="evenodd" d="M7.082 0c3.91 0 7.081 3.179 7.081 7.1v2.7h2.357c3.91 0 7.082 3.178 7.082 7.1 0 3.923-3.17 7.1-7.082 7.1H0V7.1C0 3.18 3.17 0 7.082 0z" fill="url(#lovable-grad)" fillRule="evenodd"/>
    </svg>
  ),

  // Bolt.new - Lightning bolt
  bolt: (brandColor: string) => (
    <svg viewBox="0 0 24 24" fill={brandColor} width="100%" height="100%">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),

  // V0 - Vercel's V0 logo
  v0: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} fillRule="evenodd" width="100%" height="100%">
      <path clipRule="evenodd" d="M14.252 8.25h5.624c.088 0 .176.006.26.018l-5.87 5.87a1.889 1.889 0 01-.019-.265V8.25h-2.25v5.623a4.124 4.124 0 004.125 4.125h5.624v-2.25h-5.624c-.09 0-.179-.006-.265-.018l5.874-5.875a1.9 1.9 0 01.02.27v5.623H24v-5.624A4.124 4.124 0 0019.876 6h-5.624v2.25zM0 7.5v.006l7.686 9.788c.924 1.176 2.813.523 2.813-.973V7.5H8.25v6.87L2.856 7.5H0z"/>
    </svg>
  ),

  // Create.xyz - Abstract creation symbol
  create: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      <circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth="2"/>
    </svg>
  ),

  // Tempo Labs - Speed/tempo icon
  tempo: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M3 12h4l3-9 4 18 3-9h4"/>
      <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5"/>
    </svg>
  ),

  // GPT Engineer - Code/engineering icon
  gptengineer: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
      <rect x="10" y="4" width="4" height="16" rx="1" opacity="0.3"/>
    </svg>
  ),

  // Databutton - Data/button icon
  databutton: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke={color} strokeWidth="2"/>
      <circle cx="8" cy="12" r="2"/>
      <circle cx="12" cy="12" r="2"/>
      <circle cx="16" cy="12" r="2"/>
      <path d="M7 7h10M7 17h10" stroke={color} strokeWidth="1.5" opacity="0.5"/>
    </svg>
  ),

  // Magic Patterns - Magic wand pattern
  magic_patterns: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 11.8L11 13M12.2 6.2L11 5"/>
      <path d="M15 9a3 3 0 11-6 0 3 3 0 016 0z" fill="none" stroke={color} strokeWidth="2"/>
      <path d="M3 21l6-6M9 21l-6-6" strokeWidth="2"/>
    </svg>
  ),

  // Claude - Anthropic's Claude
  claude: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} fillRule="evenodd" width="100%" height="100%">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/>
    </svg>
  ),

  // ChatGPT/OpenAI
  chatgpt: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} fillRule="evenodd" width="100%" height="100%">
      <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/>
    </svg>
  ),

  // Gemini
  gemini: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} fillRule="evenodd" width="100%" height="100%">
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/>
    </svg>
  ),

  // GitHub Copilot
  copilot: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M12 1C7.03 1 3 5.03 3 10v6.5C3 19 5 21 7.5 21h9c2.5 0 4.5-2 4.5-4.5V10c0-4.97-4.03-9-9-9zm0 2c3.87 0 7 3.13 7 7v6.5c0 1.38-1.12 2.5-2.5 2.5h-9C6.12 19 5 17.88 5 16.5V10c0-3.87 3.13-7 7-7zm-3.5 8a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>
    </svg>
  ),

  // Cursor
  cursor: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} fillRule="evenodd" width="100%" height="100%">
      <path d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"/>
    </svg>
  ),

  // Windsurf
  windsurf: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} fillRule="evenodd" width="100%" height="100%">
      <path clipRule="evenodd" d="M23.78 5.004h-.228a2.187 2.187 0 00-2.18 2.196v4.912c0 .98-.804 1.775-1.76 1.775a1.818 1.818 0 01-1.472-.773L13.168 5.95a2.197 2.197 0 00-1.81-.95c-1.134 0-2.154.972-2.154 2.173v4.94c0 .98-.797 1.775-1.76 1.775-.57 0-1.136-.289-1.472-.773L.408 5.098C.282 4.918 0 5.007 0 5.228v4.284c0 .216.066.426.188.604l5.475 7.889c.324.466.8.812 1.351.938 1.377.316 2.645-.754 2.645-2.117V11.89c0-.98.787-1.775 1.76-1.775h.002c.586 0 1.135.288 1.472.773l4.972 7.163a2.15 2.15 0 001.81.95c1.158 0 2.151-.973 2.151-2.173v-4.939c0-.98.787-1.775 1.76-1.775h.194c.122 0 .22-.1.22-.222V5.225a.221.221 0 00-.22-.222z"/>
    </svg>
  ),

  // VS Code
  vscode: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M17.583.063a1.5 1.5 0 00-1.032.392 1.5 1.5 0 00-.001 0L7.332 9.057 2.639 5.622l-.094-.065a1.5 1.5 0 00-1.899.336l-.002.002a1.5 1.5 0 00-.001.002l-.163.215-.001.002a1.5 1.5 0 00-.001.002l-.05.069-.002.003a1.5 1.5 0 00-.002.003c-.098.138-.182.285-.249.438l-.01.024a1.5 1.5 0 00-.003.008c-.06.143-.105.292-.132.443l-.003.018a1.5 1.5 0 00-.001.01c-.023.138-.035.278-.035.418l.001.048a1.5 1.5 0 000 .003V17.4a1.5 1.5 0 000 .002l-.001.048c0 .14.012.28.035.418a1.5 1.5 0 00.001.01l.003.018c.027.151.072.3.132.443a1.5 1.5 0 00.003.008l.01.024c.067.153.151.3.249.438a1.5 1.5 0 00.002.003l.002.003.05.069a1.5 1.5 0 00.001.002l.001.002.163.215a1.5 1.5 0 00.001.002l.002.002a1.5 1.5 0 001.899.336l.094-.065 4.693-3.435 9.218 8.602a1.5 1.5 0 001.033.392h.001a1.5 1.5 0 00.466-.074l.007-.002a1.5 1.5 0 00.014-.005l.007-.002a1.5 1.5 0 00.893-.651l.004-.008a1.5 1.5 0 00.011-.019l.002-.004.002-.003.003-.006.003-.005.002-.004.002-.003.003-.006.002-.004a1.5 1.5 0 00.132-.31l.003-.011a1.5 1.5 0 00.039-.17l.001-.007a1.5 1.5 0 00.024-.202V1.5a1.5 1.5 0 00-1.5-1.5 1.5 1.5 0 00-.5.063zm.917 3.421v17.032L9.665 12 18.5 3.484z"/>
    </svg>
  ),

  // Replit
  replit: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M11.878 7.761H3.482A1.469 1.469 0 012 6.304V1.457C2 .644 2.67 0 3.482 0h6.913c.827 0 1.483.658 1.483 1.457v6.304zM20.882 16.215h-8.995V7.75h8.995c.87 0 1.588.717 1.588 1.586v5.294c0 .885-.717 1.586-1.588 1.586zM10.395 24H3.482C2.67 24 2 23.343 2 22.546v-4.853c0-.797.67-1.454 1.482-1.454h8.396v6.307c0 .797-.67 1.454-1.483 1.454z"/>
    </svg>
  ),

  // CodeSandbox
  codesandbox: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M2 6l10-5.5L22 6v12l-10 5.5L2 18V6zm2 1.1v9.8l7 3.85v-9.8L4 7.1zm9 13.65l7-3.85V7.1l-7 3.85v9.8zm5.5-14.1L12 10.5 5.5 6.65l6.5-3.58 6.5 3.58z"/>
    </svg>
  ),

  // StackBlitz
  stackblitz: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M10.797 14.182H3.635L16.728 0l-3.525 9.818h7.162L7.272 24l3.525-9.818z"/>
    </svg>
  ),

  // GitHub
  github: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} fillRule="evenodd" width="100%" height="100%">
      <path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"/>
    </svg>
  ),

  // GitLab
  gitlab: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51a.42.42 0 01.82 0l2.44 7.51h8.06l2.44-7.51a.42.42 0 01.82 0l2.44 7.51 1.22 3.78a.84.84 0 01-.3.94"/>
    </svg>
  ),

  // Bitbucket
  bitbucket: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M.778 1.213a.768.768 0 00-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 00.77-.646l3.27-20.03a.768.768 0 00-.768-.891zM14.52 15.53H9.522l-1.35-7.06h7.68l-1.332 7.06z"/>
    </svg>
  ),

  // ZIP upload
  zip: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2v2z"/>
    </svg>
  ),

  // AntiGravity - our own editor
  antigravity: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7L4 15.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
      <circle cx="12" cy="12" r="2" fill="none" stroke={color} strokeWidth="1.5"/>
    </svg>
  ),

  // Cody - Sourcegraph AI
  cody: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  ),

  // Continue - AI code assistant
  continue_ai: (color: string) => (
    <svg viewBox="0 0 24 24" fill={color} width="100%" height="100%">
      <path d="M8 5v14l11-7z"/>
      <rect x="4" y="5" width="2" height="14" rx="1"/>
    </svg>
  ),
};

// =============================================================================
// TYPES
// =============================================================================

export type ImportSource =
  | 'lovable' | 'bolt' | 'v0' | 'create' | 'tempo' | 'gptengineer' | 'databutton' | 'magic_patterns'
  | 'claude' | 'chatgpt' | 'gemini' | 'copilot'
  | 'cursor' | 'windsurf' | 'antigravity' | 'vscode' | 'cody' | 'continue'
  | 'replit' | 'codesandbox' | 'stackblitz'
  | 'github' | 'gitlab' | 'bitbucket'
  | 'zip';

type SourceCategory = 'ai_builder' | 'ai_assistant' | 'ai_editor' | 'dev_platform' | 'repository' | 'file_upload';

interface SourceConfig {
  id: ImportSource;
  name: string;
  icon: keyof typeof ICONS;
  brandColor: string;
  description: string;
  category: SourceCategory;
  contextAvailable: boolean;
}

interface PremiumGlassSelectionProps {
  selectedSource: ImportSource | null;
  onSelectSource: (source: ImportSource) => void;
  onContinue: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  currentStep?: number;
}

// =============================================================================
// SOURCE CONFIGURATION
// =============================================================================

const SOURCES: SourceConfig[] = [
  // AI Builders
  { id: 'lovable', name: 'Lovable', icon: 'lovable', brandColor: '#FF6B6B', description: 'Full-stack AI app builder', category: 'ai_builder', contextAvailable: true },
  { id: 'bolt', name: 'Bolt.new', icon: 'bolt', brandColor: '#FFCC00', description: 'StackBlitz-powered AI', category: 'ai_builder', contextAvailable: true },
  { id: 'v0', name: 'v0.dev', icon: 'v0', brandColor: '#FFFFFF', description: 'Vercel component builder', category: 'ai_builder', contextAvailable: true },
  { id: 'create', name: 'Create.xyz', icon: 'create', brandColor: '#7C3AED', description: 'AI-powered app creator', category: 'ai_builder', contextAvailable: true },
  { id: 'tempo', name: 'Tempo Labs', icon: 'tempo', brandColor: '#00D4FF', description: 'AI development platform', category: 'ai_builder', contextAvailable: true },
  { id: 'gptengineer', name: 'GPT Engineer', icon: 'gptengineer', brandColor: '#10B981', description: 'gptengineer.app', category: 'ai_builder', contextAvailable: false },
  { id: 'databutton', name: 'Databutton', icon: 'databutton', brandColor: '#6366F1', description: 'AI data app builder', category: 'ai_builder', contextAvailable: true },
  { id: 'magic_patterns', name: 'Magic Patterns', icon: 'magic_patterns', brandColor: '#F472B6', description: 'Design-to-code AI', category: 'ai_builder', contextAvailable: true },

  // AI Assistants
  { id: 'claude', name: 'Claude', icon: 'claude', brandColor: '#D4A574', description: 'Anthropic AI', category: 'ai_assistant', contextAvailable: true },
  { id: 'chatgpt', name: 'ChatGPT', icon: 'chatgpt', brandColor: '#10A37F', description: 'OpenAI assistant', category: 'ai_assistant', contextAvailable: true },
  { id: 'gemini', name: 'Gemini', icon: 'gemini', brandColor: '#8E75B2', description: 'Google AI', category: 'ai_assistant', contextAvailable: true },
  { id: 'copilot', name: 'GitHub Copilot', icon: 'copilot', brandColor: '#FFFFFF', description: 'AI pair programmer', category: 'ai_assistant', contextAvailable: false },

  // AI Editors
  { id: 'cursor', name: 'Cursor', icon: 'cursor', brandColor: '#FFFFFF', description: 'AI-first editor', category: 'ai_editor', contextAvailable: true },
  { id: 'windsurf', name: 'Windsurf', icon: 'windsurf', brandColor: '#00D4AA', description: 'Codeium AI IDE', category: 'ai_editor', contextAvailable: true },
  { id: 'antigravity', name: 'AntiGravity', icon: 'antigravity', brandColor: '#F59E0B', description: 'KripTik AI Editor', category: 'ai_editor', contextAvailable: true },
  { id: 'vscode', name: 'VS Code', icon: 'vscode', brandColor: '#007ACC', description: 'With AI extensions', category: 'ai_editor', contextAvailable: false },
  { id: 'cody', name: 'Cody', icon: 'cody', brandColor: '#FF5543', description: 'Sourcegraph AI', category: 'ai_editor', contextAvailable: false },
  { id: 'continue', name: 'Continue', icon: 'continue_ai', brandColor: '#00A67E', description: 'Open-source AI', category: 'ai_editor', contextAvailable: false },

  // Dev Platforms
  { id: 'replit', name: 'Replit', icon: 'replit', brandColor: '#F26207', description: 'AI-powered IDE', category: 'dev_platform', contextAvailable: true },
  { id: 'codesandbox', name: 'CodeSandbox', icon: 'codesandbox', brandColor: '#151515', description: 'Cloud development', category: 'dev_platform', contextAvailable: false },
  { id: 'stackblitz', name: 'StackBlitz', icon: 'stackblitz', brandColor: '#1389FD', description: 'Web IDE', category: 'dev_platform', contextAvailable: false },

  // Repositories
  { id: 'github', name: 'GitHub', icon: 'github', brandColor: '#FFFFFF', description: 'GitHub repository', category: 'repository', contextAvailable: true },
  { id: 'gitlab', name: 'GitLab', icon: 'gitlab', brandColor: '#FC6D26', description: 'GitLab repository', category: 'repository', contextAvailable: true },
  { id: 'bitbucket', name: 'Bitbucket', icon: 'bitbucket', brandColor: '#0052CC', description: 'Bitbucket repository', category: 'repository', contextAvailable: true },

  // File Upload
  { id: 'zip', name: 'Upload ZIP', icon: 'zip', brandColor: '#F59E0B', description: 'Upload project files', category: 'file_upload', contextAvailable: false },
];

const CATEGORY_INFO: Record<SourceCategory, { label: string; color: string }> = {
  ai_builder: { label: 'AI App Builders', color: '#F59E0B' },
  ai_assistant: { label: 'AI Assistants', color: '#10B981' },
  ai_editor: { label: 'AI Code Editors', color: '#3B82F6' },
  dev_platform: { label: 'Dev Platforms', color: '#8B5CF6' },
  repository: { label: 'Repositories', color: '#EC4899' },
  file_upload: { label: 'File Upload', color: '#6B7280' },
};

const STEP_LABELS = ['SOURCE', 'ACCESS', 'IMPORT', 'CONTEXT', 'ANALYSIS', 'UI PREF', 'STRATEGY', 'FIX', 'DONE'];

// =============================================================================
// THREE.JS 3D COMPONENTS
// =============================================================================

// Floating glass tile for background decoration
function FloatingGlassTile({ position, size, color, rotationSpeed = 0.2 }: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  rotationSpeed?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * rotationSpeed) * 0.1;
      meshRef.current.rotation.y = state.clock.elapsedTime * rotationSpeed * 0.5;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.15;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.3}>
      <RoundedBox ref={meshRef} args={size} radius={0.08} position={position}>
        <MeshTransmissionMaterial
          backside
          samples={6}
          resolution={128}
          transmission={0.92}
          roughness={0.03}
          thickness={0.2}
          ior={1.5}
          chromaticAberration={0.03}
          clearcoat={1}
          clearcoatRoughness={0.05}
          attenuationColor={color}
          color={color}
          distortionScale={0}
          temporalDistortion={0}
        />
      </RoundedBox>
    </Float>
  );
}

// Animated 3D Gear for header
function AnimatedGear({ position, speed, size, color }: {
  position: [number, number, number];
  speed: number;
  size: number;
  color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  const gearGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const teeth = 12;
    const outerRadius = size;
    const innerRadius = size * 0.4;
    const toothDepth = size * 0.15;
    const toothWidth = (2 * Math.PI) / teeth / 3;

    shape.moveTo(outerRadius, 0);

    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 1) / teeth) * Math.PI * 2;

      shape.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
      shape.lineTo(Math.cos(angle + toothWidth) * (outerRadius + toothDepth), Math.sin(angle + toothWidth) * (outerRadius + toothDepth));
      shape.lineTo(Math.cos(angle + toothWidth * 2) * outerRadius, Math.sin(angle + toothWidth * 2) * outerRadius);
      shape.lineTo(Math.cos(nextAngle) * outerRadius, Math.sin(nextAngle) * outerRadius);
    }

    const hole = new THREE.Path();
    hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {
      depth: size * 0.2,
      bevelEnabled: true,
      bevelThickness: size * 0.03,
      bevelSize: size * 0.03,
      bevelSegments: 2,
    });
  }, [size]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = state.clock.elapsedTime * speed;
    }
  });

  return (
    <mesh ref={meshRef} geometry={gearGeometry} position={position}>
      <meshStandardMaterial
        color={color}
        metalness={0.9}
        roughness={0.1}
        envMapIntensity={1}
      />
    </mesh>
  );
}

// Glass sphere for progress indicator
function GlassSphere({
  position,
  isActive,
  isComplete,
  index
}: {
  position: [number, number, number];
  isActive: boolean;
  isComplete: boolean;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;

    meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + index * 0.5) * 0.08;

    if (isActive && meshRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
      meshRef.current.scale.setScalar(pulse);
    }

    if (glowRef.current && (isActive || isComplete)) {
      glowRef.current.scale.setScalar(1.5 + Math.sin(state.clock.elapsedTime * 3) * 0.2);
    }
  });

  const color = isActive || isComplete ? '#f59e0b' : '#334155';

  return (
    <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.3}>
      <group position={position}>
        {(isActive || isComplete) && (
          <mesh ref={glowRef}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.15} />
          </mesh>
        )}

        <mesh ref={meshRef}>
          <sphereGeometry args={[0.12, 32, 32]} />
          <MeshTransmissionMaterial
            backside
            samples={8}
            resolution={256}
            transmission={isComplete ? 0.6 : 0.85}
            roughness={0.05}
            thickness={0.3}
            ior={1.5}
            chromaticAberration={0.02}
            clearcoat={1}
            clearcoatRoughness={0.1}
            attenuationColor={color}
            color={color}
            distortionScale={0}
            temporalDistortion={0}
          />
        </mesh>

        {(isActive || isComplete) && (
          <mesh>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.8} />
          </mesh>
        )}
      </group>
    </Float>
  );
}

// Main 3D Scene
function Scene3D({ currentStep }: { currentStep: number }) {
  const { viewport } = useThree();
  const isMobile = viewport.width < 5.5;
  const scale = isMobile ? Math.min(viewport.width / 7, 0.8) : Math.min(viewport.width / 10, 1);

  const sphereSpacing = 0.7 * scale;
  const totalSteps = STEP_LABELS.length;
  const startX = -((totalSteps - 1) * sphereSpacing) / 2;

  // On mobile, shift the 3D elements higher so they appear above the card
  const yOffset = isMobile ? 1.2 : 0;

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#fff8f0" />
      <pointLight position={[0, 0, 4]} intensity={2} color="#f59e0b" distance={12} />
      <pointLight position={[-5, 3, 2]} intensity={0.8} color="#fbbf24" distance={10} />

      <Environment preset="studio">
        <Lightformer position={[0, 5, -5]} scale={[10, 3, 1]} intensity={2} color="#fef3c7" />
        <Lightformer position={[5, 0, 0]} scale={[1, 5, 1]} intensity={1} color="#fed7aa" />
        <Lightformer position={[-5, 0, 0]} scale={[1, 5, 1]} intensity={0.5} color="#fff7ed" />
      </Environment>

      {/* Animated Gears */}
      <group position={[0, 2.5 + yOffset, 0]} scale={scale * (isMobile ? 1.3 : 1)}>
        <AnimatedGear position={[0, 0, 0]} speed={0.3} size={0.5} color="#f59e0b" />
        <AnimatedGear position={[0.65, 0.35, -0.1]} speed={-0.45} size={0.35} color="#ea580c" />
        <AnimatedGear position={[-0.5, 0.4, 0.1]} speed={0.35} size={0.25} color="#fbbf24" />
      </group>

      {/* Progress spheres */}
      <group position={[0, 1.2 + yOffset, 0]} scale={scale * (isMobile ? 1.2 : 1)}>
        {STEP_LABELS.map((_, i) => (
          <GlassSphere
            key={i}
            position={[startX + i * sphereSpacing, 0, 0]}
            isActive={i === currentStep}
            isComplete={i < currentStep}
            index={i}
          />
        ))}

        {STEP_LABELS.slice(0, -1).map((_, i) => (
          <mesh key={`line-${i}`} position={[startX + i * sphereSpacing + sphereSpacing / 2, 0, -0.1]}>
            <boxGeometry args={[sphereSpacing - 0.25, 0.02, 0.02]} />
            <meshStandardMaterial
              color={i < currentStep ? '#f59e0b' : '#1e293b'}
              emissive={i < currentStep ? '#f59e0b' : '#000000'}
              emissiveIntensity={i < currentStep ? 0.3 : 0}
            />
          </mesh>
        ))}
      </group>

      {/* Floating glass decorations */}
      <FloatingGlassTile position={[-4 * scale, 0.5 + yOffset, -3]} size={[0.8, 0.8, 0.15]} color="#f59e0b" rotationSpeed={0.15} />
      <FloatingGlassTile position={[4.5 * scale, 1.5 + yOffset, -2]} size={[0.5, 0.5, 0.1]} color="#ea580c" rotationSpeed={0.2} />
      <FloatingGlassTile position={[-3 * scale, -1 + yOffset, -2.5]} size={[0.6, 0.6, 0.12]} color="#fbbf24" rotationSpeed={0.18} />

      <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
        <Sphere args={[0.2, 24, 24]} position={[3.5 * scale, -0.5 + yOffset, -1.5]}>
          <MeshTransmissionMaterial
            backside
            samples={4}
            resolution={128}
            transmission={0.85}
            roughness={0.15}
            thickness={0.15}
            ior={1.45}
            color="#f97316"
            attenuationColor="#f97316"
            distortionScale={0}
            temporalDistortion={0}
          />
        </Sphere>
      </Float>
    </>
  );
}

// =============================================================================
// PHOTOREALISTIC GLASS BUTTON COMPONENT
// =============================================================================

interface GlassButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}

function PhotorealisticGlassButton({ onClick, disabled, isLoading, children }: GlassButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const reflectionRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });

  // Entrance animation
  useEffect(() => {
    if (!buttonRef.current) return;

    gsap.fromTo(
      buttonRef.current,
      { opacity: 0, scale: 0.9, y: 20 },
      { opacity: 1, scale: 1, y: 0, duration: 0.6, delay: 0.3, ease: 'back.out(1.7)' }
    );
  }, []);

  // Hover animations
  useEffect(() => {
    if (!buttonRef.current || !glowRef.current) return;

    if (isHovered && !disabled) {
      // Button lift and scale
      gsap.to(buttonRef.current, {
        y: -6,
        scale: 1.05,
        rotateX: 8,
        rotateY: 3,
        duration: 0.4,
        ease: 'power2.out',
      });

      // Glow intensify
      gsap.to(glowRef.current, {
        opacity: 1,
        scale: 1.3,
        duration: 0.4,
        ease: 'power2.out',
      });

      // Reflection movement
      if (reflectionRef.current) {
        gsap.to(reflectionRef.current, {
          x: '30%',
          opacity: 0.6,
          duration: 0.6,
          ease: 'power2.out',
        });
      }
    } else {
      gsap.to(buttonRef.current, {
        y: 0,
        scale: 1,
        rotateX: 0,
        rotateY: 0,
        duration: 0.4,
        ease: 'power2.out',
      });

      gsap.to(glowRef.current, {
        opacity: 0.6,
        scale: 1,
        duration: 0.4,
        ease: 'power2.out',
      });

      if (reflectionRef.current) {
        gsap.to(reflectionRef.current, {
          x: '-100%',
          opacity: 0.3,
          duration: 0.6,
          ease: 'power2.out',
        });
      }
    }
  }, [isHovered, disabled]);

  // Mouse tracking for dynamic reflection
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!buttonRef.current || disabled) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePos({ x, y });

    // Dynamic tilt based on mouse position
    gsap.to(buttonRef.current, {
      rotateY: (x - 0.5) * 10,
      rotateX: (0.5 - y) * 10,
      duration: 0.3,
      ease: 'power2.out',
    });
  };

  return (
    <div className="relative" style={{ perspective: '1000px' }}>
      {/* Ambient glow behind button */}
      <div
        ref={glowRef}
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.5) 0%, rgba(245,158,11,0.3) 40%, transparent 70%)',
          filter: 'blur(20px)',
          opacity: 0.6,
          transform: 'scale(1.2) translateY(10px)',
        }}
      />

      {/* The glass button */}
      <button
        ref={buttonRef}
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseMove={handleMouseMove}
        className="relative px-10 py-4 rounded-2xl font-bold text-lg disabled:cursor-not-allowed overflow-hidden"
        style={{
          // Glass-like multi-layer background
          background: `
            linear-gradient(135deg,
              rgba(255,255,255,0.25) 0%,
              rgba(255,255,255,0.1) 20%,
              rgba(251,191,36,0.4) 40%,
              rgba(245,158,11,0.5) 60%,
              rgba(234,88,12,0.4) 80%,
              rgba(255,255,255,0.15) 100%
            )
          `,
          // Visible 3D edges
          boxShadow: `
            0 4px 0 rgba(180,83,9,0.8),
            0 6px 0 rgba(154,52,18,0.5),
            0 8px 0 rgba(120,40,10,0.3),
            0 15px 40px rgba(245,158,11,0.5),
            0 25px 60px rgba(234,88,12,0.3),
            inset 0 2px 0 rgba(255,255,255,0.4),
            inset 0 -3px 0 rgba(180,83,9,0.3),
            inset 2px 0 0 rgba(255,255,255,0.2),
            inset -2px 0 0 rgba(180,83,9,0.2)
          `,
          border: '1px solid rgba(255,255,255,0.3)',
          color: disabled ? 'rgba(0,0,0,0.5)' : '#1c1917',
          fontFamily: '"Clash Display", system-ui',
          transformStyle: 'preserve-3d',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Top glass highlight - simulates thickness */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
          style={{
            background: 'linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.7) 30%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.7) 70%, transparent 90%)',
          }}
        />

        {/* Left edge highlight */}
        <div
          className="absolute top-0 left-0 bottom-0 w-[2px] rounded-l-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
          }}
        />

        {/* Moving reflection/refraction simulation */}
        <div
          ref={reflectionRef}
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
          style={{
            background: `linear-gradient(
              ${110 + mousePos.x * 40}deg,
              transparent 0%,
              rgba(255,255,255,0.4) 45%,
              rgba(255,255,255,0.6) 50%,
              rgba(255,255,255,0.4) 55%,
              transparent 100%
            )`,
            transform: 'translateX(-100%)',
            opacity: 0.3,
          }}
        />

        {/* Inner glow for warmth */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(255,200,100,0.3) 0%, transparent 60%)`,
          }}
        />

        {/* Button text with subtle shadow for depth */}
        <span
          className="relative z-10 flex items-center gap-2"
          style={{
            textShadow: '0 1px 0 rgba(255,255,255,0.3), 0 -1px 0 rgba(0,0,0,0.1)',
          }}
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {children}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </>
          )}
        </span>

        {/* Bottom edge depth */}
        <div
          className="absolute -bottom-1 left-2 right-2 h-2 rounded-b-xl -z-10"
          style={{
            background: 'linear-gradient(180deg, rgba(180,83,9,0.6) 0%, rgba(120,40,10,0.2) 100%)',
          }}
        />
      </button>

      {/* Reflection on surface below */}
      <div
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-6 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.3) 0%, transparent 70%)',
          filter: 'blur(8px)',
          opacity: isHovered ? 0.8 : 0.4,
          transition: 'opacity 0.4s ease',
        }}
      />
    </div>
  );
}

// =============================================================================
// 3D GLASS TILE COMPONENT
// =============================================================================

interface Glass3DTileProps {
  source: SourceConfig;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}

function Glass3DTile({ source, isSelected, onSelect, index }: Glass3DTileProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // GSAP entrance animation
  useEffect(() => {
    if (!tileRef.current) return;

    gsap.fromTo(
      tileRef.current,
      {
        opacity: 0,
        y: 60,
        rotateX: -25,
        rotateY: -10,
        scale: 0.85,
      },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        duration: 0.8,
        delay: index * 0.04,
        ease: 'power3.out',
      }
    );
  }, [index]);

  // Hover animations
  useEffect(() => {
    if (!tileRef.current || !glassRef.current || !iconRef.current) return;

    if (isHovered) {
      gsap.to(tileRef.current, {
        y: -12,
        rotateX: 8,
        rotateY: 5,
        scale: 1.05,
        duration: 0.4,
        ease: 'power2.out',
      });
      gsap.to(glassRef.current, {
        boxShadow: `
          0 4px 0 ${source.brandColor}80,
          0 8px 0 ${source.brandColor}40,
          0 20px 60px rgba(0,0,0,0.5),
          inset 0 1px 0 rgba(255,255,255,0.3),
          inset 0 -2px 0 rgba(0,0,0,0.2)
        `,
        duration: 0.4,
        ease: 'power2.out',
      });
      gsap.to(iconRef.current, {
        scale: 1.15,
        rotateZ: 5,
        duration: 0.3,
        ease: 'back.out(1.7)',
      });
    } else {
      gsap.to(tileRef.current, {
        y: isSelected ? -6 : 0,
        rotateX: isSelected ? 4 : 0,
        rotateY: isSelected ? 2 : 0,
        scale: isSelected ? 1.02 : 1,
        duration: 0.4,
        ease: 'power2.out',
      });
      gsap.to(glassRef.current, {
        boxShadow: isSelected
          ? `
            0 4px 0 ${source.brandColor}60,
            0 8px 0 ${source.brandColor}30,
            0 15px 40px rgba(0,0,0,0.4),
            inset 0 1px 0 rgba(255,255,255,0.2),
            inset 0 -2px 0 rgba(0,0,0,0.15)
          `
          : `
            0 3px 0 rgba(0,0,0,0.3),
            0 6px 0 rgba(0,0,0,0.15),
            0 12px 30px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.1),
            inset 0 -2px 0 rgba(0,0,0,0.1)
          `,
        duration: 0.4,
        ease: 'power2.out',
      });
      gsap.to(iconRef.current, {
        scale: 1,
        rotateZ: 0,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  }, [isHovered, isSelected, source.brandColor]);

  // Selection animation
  useEffect(() => {
    if (!tileRef.current) return;

    if (isSelected) {
      gsap.to(tileRef.current, {
        borderColor: source.brandColor,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  }, [isSelected, source.brandColor]);

  const IconComponent = ICONS[source.icon];

  return (
    <div
      ref={tileRef}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative cursor-pointer"
      style={{
        perspective: '1200px',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Glass tile with visible edges and depth */}
      <div
        ref={glassRef}
        className={cn(
          'relative p-4 rounded-2xl transition-colors duration-200 overflow-hidden',
          isSelected && 'ring-2'
        )}
        style={{
          // Glass-like gradient background
          background: isSelected
            ? `linear-gradient(135deg,
                ${source.brandColor}20 0%,
                rgba(255,255,255,0.08) 25%,
                rgba(15,23,42,0.9) 50%,
                rgba(30,41,59,0.95) 100%)`
            : `linear-gradient(135deg,
                rgba(255,255,255,0.12) 0%,
                rgba(255,255,255,0.05) 25%,
                rgba(30,41,59,0.9) 50%,
                rgba(15,23,42,0.95) 100%)`,
          // 3D box shadow for visible depth and thickness
          boxShadow: `
            0 3px 0 rgba(0,0,0,0.3),
            0 6px 0 rgba(0,0,0,0.15),
            0 12px 30px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.1),
            inset 0 -2px 0 rgba(0,0,0,0.1)
          `,
          border: isSelected ? `2px solid ${source.brandColor}` : '2px solid rgba(255,255,255,0.08)',
          transform: 'translateZ(0)',
          // @ts-expect-error ring color CSS variable
          '--tw-ring-color': source.brandColor,
        }}
      >
        {/* Top glass highlight edge - simulates glass thickness */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
          style={{
            background: `linear-gradient(90deg,
              transparent 0%,
              ${isSelected ? source.brandColor : 'rgba(255,255,255,0.25)'}80 30%,
              ${isSelected ? source.brandColor : 'rgba(255,255,255,0.4)'} 50%,
              ${isSelected ? source.brandColor : 'rgba(255,255,255,0.25)'}80 70%,
              transparent 100%)`,
          }}
        />

        {/* Left edge highlight */}
        <div
          className="absolute top-0 left-0 bottom-0 w-[2px] rounded-l-2xl"
          style={{
            background: `linear-gradient(180deg,
              ${isSelected ? source.brandColor : 'rgba(255,255,255,0.2)'}60 0%,
              ${isSelected ? source.brandColor : 'rgba(255,255,255,0.1)'}30 50%,
              transparent 100%)`,
          }}
        />

        {/* Inner glow for glass refraction effect */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: isSelected
              ? `radial-gradient(ellipse at 30% 20%, ${source.brandColor}15 0%, transparent 50%)`
              : 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.05) 0%, transparent 50%)',
          }}
        />

        <div className="relative flex items-center gap-4">
          {/* Icon container with glass effect */}
          <div
            ref={iconRef}
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: isSelected
                ? `linear-gradient(135deg, ${source.brandColor}30 0%, ${source.brandColor}10 100%)`
                : 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%)',
              boxShadow: `
                0 2px 0 rgba(0,0,0,0.2),
                0 4px 10px rgba(0,0,0,0.2),
                inset 0 1px 0 rgba(255,255,255,0.15)
              `,
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div className="w-7 h-7" style={{ color: source.brandColor }}>
              {IconComponent && IconComponent(source.brandColor)}
            </div>
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                'font-semibold text-sm truncate',
                isSelected ? 'text-white' : 'text-slate-200'
              )}
              style={{ fontFamily: '"Clash Display", system-ui' }}
            >
              {source.name}
            </h4>
            <p
              className="text-xs text-slate-400 truncate mt-0.5"
              style={{ fontFamily: '"Satoshi", system-ui' }}
            >
              {source.description}
            </p>
          </div>

          {/* Context badge */}
          {source.contextAvailable && (
            <span
              className="px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: isSelected ? `${source.brandColor}20` : 'rgba(16,185,129,0.15)',
                color: isSelected ? source.brandColor : '#10b981',
                border: `1px solid ${isSelected ? source.brandColor : '#10b981'}30`,
              }}
            >
              CTX
            </span>
          )}
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div
            className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full"
            style={{
              background: source.brandColor,
              boxShadow: `0 0 12px ${source.brandColor}, 0 0 20px ${source.brandColor}60`,
              animation: 'pulse 2s infinite',
            }}
          />
        )}
      </div>

      {/* 3D bottom edge for visible thickness */}
      <div
        className="absolute -bottom-1.5 left-3 right-3 h-3 rounded-b-xl -z-10"
        style={{
          background: isSelected
            ? `linear-gradient(180deg, ${source.brandColor}40 0%, ${source.brandColor}05 100%)`
            : 'linear-gradient(180deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.3) 100%)',
          transform: 'perspective(500px) rotateX(-5deg)',
        }}
      />

      {/* Right edge depth */}
      <div
        className="absolute -right-1 top-3 bottom-3 w-2 rounded-r-lg -z-10"
        style={{
          background: isSelected
            ? `linear-gradient(90deg, ${source.brandColor}20 0%, transparent 100%)`
            : 'linear-gradient(90deg, rgba(30,41,59,0.5) 0%, transparent 100%)',
        }}
      />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PremiumGlassSelection({
  selectedSource,
  onSelectSource,
  onContinue,
  onCancel,
  isLoading = false,
  currentStep = 0,
}: PremiumGlassSelectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // GSAP entrance animations
  useEffect(() => {
    const tl = gsap.timeline();

    if (headerRef.current) {
      tl.fromTo(
        headerRef.current,
        { opacity: 0, y: -30, rotateX: -15 },
        { opacity: 1, y: 0, rotateX: 0, duration: 0.7, ease: 'power3.out' }
      );
    }

    if (contentRef.current) {
      tl.fromTo(
        contentRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' },
        '-=0.4'
      );
    }
    // Note: Button animation is now handled by PhotorealisticGlassButton component
  }, []);

  // Parallax effect - only trigger when elements exist
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      // Check if parallax elements exist before animating
      const slowEl = document.querySelector('.parallax-slow');
      const fastEl = document.querySelector('.parallax-fast');
      if (!slowEl || !fastEl) return;

      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;

      const xPercent = (clientX / innerWidth - 0.5) * 2;
      const yPercent = (clientY / innerHeight - 0.5) * 2;

      gsap.to(slowEl, {
        x: xPercent * 15,
        y: yPercent * 15,
        duration: 0.6,
        ease: 'power2.out',
      });

      gsap.to(fastEl, {
        x: xPercent * 30,
        y: yPercent * 30,
        duration: 0.6,
        ease: 'power2.out',
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const sourcesByCategory = useMemo(() => {
    const grouped: Record<SourceCategory, SourceConfig[]> = {
      ai_builder: [], ai_assistant: [], ai_editor: [],
      dev_platform: [], repository: [], file_upload: [],
    };
    SOURCES.forEach((s) => grouped[s.category].push(s));
    return grouped;
  }, []);

  const selectedConfig = SOURCES.find((s) => s.id === selectedSource);
  let cardIndex = 0;

  return (
    <div
      ref={containerRef}
      className="min-h-screen max-h-screen relative overflow-x-hidden overflow-y-auto sm:overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #030305 0%, #0a0f1a 40%, #050507 100%)',
      }}
    >
      {/* Full-screen 3D Canvas */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <Scene3D currentStep={currentStep} />
          </Suspense>
        </Canvas>
      </div>

      {/* Parallax grid overlay - slow layer */}
      <div
        className="absolute inset-0 parallax-slow pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(245,158,11,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(245,158,11,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Parallax glow overlay - fast layer */}
      <div
        className="absolute inset-0 parallax-fast pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 25% 25%, rgba(245,158,11,0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 75% 75%, rgba(234,88,12,0.06) 0%, transparent 50%)
          `,
        }}
      />

      {/* Content overlay */}
      <div className="relative z-10 min-h-screen flex flex-col overflow-y-auto">
        {/* Header */}
        <header
          ref={headerRef}
          className="border-b border-white/5 flex-shrink-0"
          style={{
            background: 'linear-gradient(180deg, rgba(10,15,26,0.95), rgba(10,15,26,0.8))',
          }}
        >
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #ea580c)',
                  boxShadow: '0 4px 0 #b45309, 0 8px 20px rgba(245,158,11,0.5), inset 0 2px 0 rgba(255,255,255,0.3)',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="animate-spin-slow">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#1c1917" strokeWidth="2"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#1c1917" strokeWidth="2"/>
                </svg>
              </div>

              <div>
                <h1
                  className="text-xl font-bold text-white"
                  style={{ fontFamily: '"Clash Display", system-ui' }}
                >
                  Fix My App
                </h1>
                <p className="text-xs text-slate-400" style={{ fontFamily: '"Satoshi", system-ui' }}>
                  Import & fix broken AI-built apps
                </p>
              </div>
            </div>

            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 transition-all hover:text-white hover:bg-white/5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              Cancel
            </button>
          </div>
        </header>

        {/* Step labels */}
        <div className="hidden sm:flex justify-center gap-6 mt-24 mb-8 px-4">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={cn(
                'text-[9px] font-semibold uppercase tracking-wider transition-colors',
                i === currentStep ? 'text-amber-500' : i < currentStep ? 'text-amber-900' : 'text-slate-600'
              )}
              style={{ fontFamily: '"Satoshi", system-ui' }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Mobile step indicator - compact dots */}
        <div className="flex sm:hidden justify-center items-center gap-1.5 mt-4 mb-4 px-4">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                'rounded-full transition-all',
                i === currentStep ? 'w-6 h-1.5 bg-amber-500' : i < currentStep ? 'w-1.5 h-1.5 bg-amber-800' : 'w-1.5 h-1.5 bg-slate-700'
              )}
              title={label}
            />
          ))}
        </div>

        {/* Main content */}
        <div ref={contentRef} className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 pb-4 sm:pb-8 w-full flex flex-col min-h-0">
          <div
            className="rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0"
            style={{
              background: 'linear-gradient(180deg, rgba(30,41,59,0.6), rgba(15,23,42,0.85))',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 6px 0 rgba(0,0,0,0.25), 0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            {/* Card header */}
            <div className="p-4 sm:p-6 pb-3 sm:pb-4 flex-shrink-0">
              <h2
                className="text-2xl font-semibold text-white mb-1"
                style={{ fontFamily: '"Clash Display", system-ui' }}
              >
                Where is your app from?
              </h2>
              <p className="text-slate-400 text-sm" style={{ fontFamily: '"Satoshi", system-ui' }}>
                Select the platform where your broken app was built.
              </p>
            </div>

            {/* Source grid with 3D glass tiles */}
            <div
              className="px-4 sm:px-6 pb-4 sm:pb-6 flex-1 min-h-0 overflow-y-auto max-h-[35vh] sm:max-h-[50vh]"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(245,158,11,0.3) transparent',
              }}
            >
              {Object.entries(sourcesByCategory).map(([category, sources]) => {
                if (sources.length === 0) return null;
                const info = CATEGORY_INFO[category as SourceCategory];

                return (
                  <div key={category} className="mb-6 last:mb-0">
                    <div className="flex items-center gap-2 mb-4">
                      <div
                        className="w-1.5 h-5 rounded-full"
                        style={{ background: info.color }}
                      />
                      <h3
                        className="text-sm font-semibold text-slate-300"
                        style={{ fontFamily: '"Cabinet Grotesk", system-ui' }}
                      >
                        {info.label}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sources.map((source) => {
                        const idx = cardIndex++;
                        return (
                          <Glass3DTile
                            key={source.id}
                            source={source}
                            isSelected={selectedSource === source.id}
                            onSelect={() => onSelectSource(source.id)}
                            index={idx}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer with glass button */}
            <div
              className="px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between flex-shrink-0 sticky bottom-0 z-20"
              style={{
                background: 'linear-gradient(180deg, rgba(15,23,42,0.95), rgba(10,15,26,0.98))',
                borderTop: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="text-sm text-slate-500">
                {selectedConfig && (
                  <span>
                    Selected: <span className="text-white font-medium">{selectedConfig.name}</span>
                  </span>
                )}
              </div>

              <PhotorealisticGlassButton
                onClick={onContinue}
                disabled={!selectedSource || isLoading}
                isLoading={isLoading}
              >
                Continue
              </PhotorealisticGlassButton>
            </div>
          </div>
        </div>
      </div>

      {/* Custom CSS */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

export default PremiumGlassSelection;
