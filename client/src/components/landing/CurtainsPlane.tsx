/**
 * CurtainsPlane — curtains.js DOM-to-WebGL scroll displacement
 *
 * Maps a DOM element's content to a WebGL plane and applies
 * scroll-driven displacement + mouse-reactive distortion shaders.
 * Design_References.md §1 — curtains.js DOM-to-WebGL
 */

import { useRef, useEffect, useState } from 'react'

const VS = /* glsl */ `
  precision mediump float;
  attribute vec3 aVertexPosition;
  attribute vec2 aTextureCoord;
  uniform mat4 uMVMatrix;
  uniform mat4 uPMatrix;
  uniform mat4 uTextureMatrix0;
  varying vec3 vVertexPosition;
  varying vec2 vTextureCoord;

  void main() {
    gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
    vTextureCoord = (uTextureMatrix0 * vec4(aTextureCoord, 0.0, 1.0)).xy;
    vVertexPosition = aVertexPosition;
  }
`

const FS = /* glsl */ `
  precision mediump float;
  varying vec3 vVertexPosition;
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler0;
  uniform float uTime;
  uniform float uScrollDelta;
  uniform vec2 uMouse;
  uniform float uMouseStrength;

  void main() {
    vec2 uv = vTextureCoord;

    // Scroll-driven vertical displacement
    float scrollWarp = uScrollDelta * 0.0015;
    uv.y += sin(uv.x * 8.0 + uTime * 2.0) * scrollWarp;
    uv.x += cos(uv.y * 6.0 + uTime * 1.5) * scrollWarp * 0.6;

    // Mouse-reactive radial distortion
    float dist = length(uv - uMouse);
    float mouseWarp = smoothstep(0.4, 0.0, dist) * uMouseStrength * 0.03;
    vec2 mouseDir = normalize(uv - uMouse + 0.001);
    uv += mouseDir * mouseWarp;

    // Chromatic aberration from displacement intensity
    float abAmount = abs(scrollWarp) * 3.0 + mouseWarp * 2.0;
    float r = texture2D(uSampler0, uv + vec2(abAmount * 0.004, 0.0)).r;
    float g = texture2D(uSampler0, uv).g;
    float b = texture2D(uSampler0, uv - vec2(abAmount * 0.004, 0.0)).b;
    float a = texture2D(uSampler0, uv).a;

    gl_FragColor = vec4(r, g, b, a);
  }
`

interface CurtainsPlaneProps {
  children: React.ReactNode
  className?: string
}

export default function CurtainsPlaneWrapper({ children, className = '' }: CurtainsPlaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const planeRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // Lazy visibility
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05, rootMargin: '200px',
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !containerRef.current || !planeRef.current) return
    // Skip on mobile for performance
    if (window.innerWidth < 768) return

    let destroyed = false
    let curtainsInstance: any = null

    ;(async () => {
      const { Curtains, Plane } = await import('curtainsjs')
      if (destroyed) return

      // Create canvas container
      const canvasContainer = document.createElement('div')
      canvasContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;'
      containerRef.current!.appendChild(canvasContainer)

      const curtains = new Curtains({
        container: canvasContainer,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        autoRender: true,
        autoResize: true,
        premultipliedAlpha: true,
      })
      curtainsInstance = curtains

      // Track scroll velocity
      let scrollDelta = 0
      let lastScroll = window.scrollY
      const mousePos = { x: 0.5, y: 0.5 }
      let mouseStrength = 0

      const onScroll = () => {
        const current = window.scrollY
        scrollDelta = current - lastScroll
        lastScroll = current
      }

      const onMouseMove = (e: MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        mousePos.x = (e.clientX - rect.left) / rect.width
        mousePos.y = 1.0 - (e.clientY - rect.top) / rect.height
        mouseStrength = 1.0
      }

      window.addEventListener('scroll', onScroll, { passive: true })
      containerRef.current!.addEventListener('mousemove', onMouseMove)

      const planeEl = planeRef.current!
      const plane = new Plane(curtains, planeEl, {
        vertexShader: VS,
        fragmentShader: FS,
        widthSegments: 20,
        heightSegments: 20,
        uniforms: {
          time: { name: 'uTime', type: '1f', value: 0 },
          scrollDelta: { name: 'uScrollDelta', type: '1f', value: 0 },
          mouse: { name: 'uMouse', type: '2f', value: [0.5, 0.5] },
          mouseStrength: { name: 'uMouseStrength', type: '1f', value: 0 },
        },
      })

      plane.onRender(() => {
        plane.uniforms.time.value += 0.016
        // Lerp scroll delta toward 0 (decay)
        plane.uniforms.scrollDelta.value += (scrollDelta - plane.uniforms.scrollDelta.value) * 0.1
        scrollDelta *= 0.95
        // Mouse
        plane.uniforms.mouse.value = [mousePos.x, mousePos.y]
        mouseStrength *= 0.97
        plane.uniforms.mouseStrength.value = mouseStrength
      })

      // Hide the original DOM content once WebGL plane is ready
      plane.onReady(() => {
        planeEl.style.opacity = '0'
      })
    })()

    return () => {
      destroyed = true
      if (curtainsInstance) {
        try { curtainsInstance.dispose() } catch { /* noop */ }
      }
    }
  }, [visible])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div ref={planeRef} className="curtains-plane">
        {children}
      </div>
    </div>
  )
}
