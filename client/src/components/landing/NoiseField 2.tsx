import React, { useRef, useEffect } from 'react';
import { createNoise3D } from 'simplex-noise';

interface NoiseFieldProps {
  className?: string;
  opacity?: number;
  speed?: number;
  scale?: number;
  color?: [number, number, number];
}

const NoiseField = React.memo(function NoiseField({
  className = '',
  opacity = 0.08,
  speed = 0.0003,
  scale = 0.008,
  color = [200, 255, 100],
}: NoiseFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const noise3D = createNoise3D();
    let raf = 0;
    const step = 4;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (time: number) => {
      const { width, height } = canvas;
      const img = ctx.createImageData(width, height);
      const d = img.data;

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const v = (noise3D(x * scale, y * scale, time * speed) + 1) * 0.5;
          const r = (color[0] * v) | 0;
          const g = (color[1] * v) | 0;
          const b = (color[2] * v) | 0;

          for (let dy = 0; dy < step && y + dy < height; dy++) {
            for (let dx = 0; dx < step && x + dx < width; dx++) {
              const i = ((y + dy) * width + (x + dx)) * 4;
              d[i] = r;
              d[i + 1] = g;
              d[i + 2] = b;
              d[i + 3] = 255;
            }
          }
        }
      }

      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [speed, scale, color]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }}
    />
  );
});

export default NoiseField;
