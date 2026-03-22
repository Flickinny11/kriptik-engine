/**
 * FluidCanvas — OGL Flowmap fluid distortion background
 *
 * Mouse-reactive fluid simulation with procedural gradient.
 * Design_References.md §1, §9 — WebGL shader libraries, procedural generation
 * Dependencies: ogl
 */

import { useRef, useEffect, useState } from 'react'

const VERTEX = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0, 1);
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tFlow;
  uniform float uTime;
  varying vec2 vUv;

  vec3 palette(float t, float time) {
    vec3 lime  = vec3(0.78, 1.0, 0.39);
    vec3 cyan  = vec3(0.024, 0.714, 0.831);
    vec3 amber = vec3(0.961, 0.620, 0.043);
    vec3 dark  = vec3(0.039);

    float phase = t * 3.0 + time * 0.08;
    vec3 c = dark;
    c += lime  * 0.12 * smoothstep(0.0, 0.5, sin(phase));
    c += cyan  * 0.10 * smoothstep(0.0, 0.5, sin(phase + 2.094));
    c += amber * 0.06 * smoothstep(0.0, 0.5, sin(phase + 4.189));
    return c;
  }

  void main() {
    vec3 flow = texture2D(tFlow, vUv).rgb;

    vec2 uv = vUv;
    uv -= flow.xy * 0.15;

    // Chromatic aberration from flow velocity
    float ab = length(flow.xy) * 0.025;
    float dist = length(uv - 0.5);
    float r = palette(length(uv + vec2(ab, 0.0)) + dist * 0.3, uTime).r;
    float g = palette(length(uv) + dist * 0.3, uTime).g;
    float b = palette(length(uv - vec2(ab, 0.0)) + dist * 0.3, uTime).b;

    // Vignette
    float vig = 1.0 - pow(dist * 1.4, 2.5);

    // Film grain
    float grain = fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453) * 0.015;

    gl_FragColor = vec4((vec3(r, g, b) + grain) * vig, 1.0);
  }
`

export default function FluidCanvas({
  className = '',
  opacity = 0.6,
}: {
  className?: string
  opacity?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const container = containerRef.current
    if (!container) return

    let destroyed = false
    let cleanupFn: (() => void) | null = null

    ;(async () => {
      const OGL = await import('ogl')
      if (destroyed) return

      const renderer = new OGL.Renderer({
        dpr: Math.min(window.devicePixelRatio, 2),
        alpha: true,
      })
      const gl = renderer.gl
      container.appendChild(gl.canvas)
      Object.assign(gl.canvas.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      })
      gl.clearColor(0, 0, 0, 0)

      const flowmap = new OGL.Flowmap(gl, {
        falloff: 0.3,
        dissipation: 0.92,
        alpha: 0.5,
      })

      // Full-screen triangle (more efficient than quad)
      const geometry = new OGL.Geometry(gl, {
        position: { size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) },
        uv: { size: 2, data: new Float32Array([0, 0, 2, 0, 0, 2]) },
      })

      const program = new OGL.Program(gl, {
        vertex: VERTEX,
        fragment: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          tFlow: flowmap.uniform,
        },
      })

      const mesh = new OGL.Mesh(gl, { geometry, program })

      // Mouse/touch tracking
      const mouse = new OGL.Vec2(-1)
      const velocity = new OGL.Vec2()
      const lastMouse = new OGL.Vec2()
      let lastTime = 0
      let mouseMoved = false

      function handleMove(e: MouseEvent | TouchEvent) {
        const rect = gl.canvas.getBoundingClientRect()
        let x: number, y: number
        if ('touches' in e && e.touches.length) {
          x = e.touches[0].clientX
          y = e.touches[0].clientY
        } else if ('clientX' in e) {
          x = (e as MouseEvent).clientX
          y = (e as MouseEvent).clientY
        } else return

        mouse.set((x - rect.left) / rect.width, 1.0 - (y - rect.top) / rect.height)

        if (!lastTime) {
          lastTime = performance.now()
          lastMouse.set(x, y)
          return
        }

        const dt = Math.max(10, performance.now() - lastTime)
        lastTime = performance.now()
        velocity.x = (x - lastMouse.x) / dt
        velocity.y = -(y - lastMouse.y) / dt
        lastMouse.set(x, y)
        mouseMoved = true
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('touchmove', handleMove, { passive: true })

      function resize() {
        renderer.setSize(container!.offsetWidth, container!.offsetHeight)
      }
      resize()
      window.addEventListener('resize', resize)

      let raf = 0
      function update(t: number) {
        if (destroyed) return
        raf = requestAnimationFrame(update)

        if (!mouseMoved) {
          mouse.set(-1)
          velocity.set(0)
        }
        mouseMoved = false

        program.uniforms.uTime.value = t * 0.001

        flowmap.mouse.copy(mouse)
        flowmap.velocity.lerp(velocity, velocity.len() ? 0.15 : 0.1)
        flowmap.update()

        renderer.render({ scene: mesh })
      }
      raf = requestAnimationFrame(update)

      cleanupFn = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('touchmove', handleMove)
        window.removeEventListener('resize', resize)
        if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas)
        try {
          gl.getExtension('WEBGL_lose_context')?.loseContext()
        } catch {
          /* noop */
        }
      }
    })()

    return () => {
      destroyed = true
      cleanupFn?.()
    }
  }, [visible])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }}
    />
  )
}
