import {useEffect, useRef} from 'react';
import type {WaveformType} from './types';
import style from './style.module.scss';

interface WaveformPreviewProps {
  /** 当前设置的振荡频率。 */
  frequency: number;
  /** 当前设置的可视振幅。 */
  gain: number;
  /** 播放时推进相位，停止时保持静态预览。 */
  playing: boolean;
  /** Canvas 需要绘制的基础波形。 */
  type: WaveformType;
}

const WAVE_COLORS: Record<WaveformType, string> = {
  sine: '#30c798',
  square: '#ef6a74',
  sawtooth: '#f0ac46',
  triangle: '#63a5ee',
};

const WAVE_LABELS: Record<WaveformType, string> = {
  sine: '正弦波',
  square: '方波',
  sawtooth: '锯齿波',
  triangle: '三角波',
};

/** 根据相位返回 -1 到 1 之间的标准波形值。 */
function sampleWave(type: WaveformType, phase: number): number {
  const angle = phase * Math.PI * 2;
  if (type === 'square') return Math.sin(angle) >= 0 ? 1 : -1;
  if (type === 'sawtooth') return 2 * (phase - Math.floor(phase + 0.5));
  if (type === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(angle));
  return Math.sin(angle);
}

/** 用 Canvas 展示当前振荡器的波形、振幅与播放相位。 */
export function WaveformPreview({frequency, gain, playing, type}: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let animationFrameId: number | null = null;
    let phaseOffset = 0;
    let previousTime = performance.now();

    const draw = (timestamp: number) => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const bufferWidth = Math.round(width * pixelRatio);
      const bufferHeight = Math.round(height * pixelRatio);
      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
      }

      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      context.strokeStyle = 'rgba(203, 221, 213, 0.11)';
      context.lineWidth = 1;
      for (let index = 1; index < 4; index += 1) {
        const y = (height / 4) * index;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      if (playing) {
        const elapsedSeconds = Math.min(0.05, (timestamp - previousTime) / 1000);
        phaseOffset = (phaseOffset + elapsedSeconds * 0.65) % 1;
      }
      previousTime = timestamp;
      const visibleCycles = Math.min(5, Math.max(1.5, 1.5 + Math.log10(frequency / 20)));
      const amplitude = Math.max(0, gain) * (height * 0.36);
      const centerY = height / 2;

      context.beginPath();
      for (let x = 0; x <= width; x += 1) {
        const phase = (x / width) * visibleCycles + phaseOffset;
        const y = centerY - sampleWave(type, phase) * amplitude;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = WAVE_COLORS[type];
      context.lineWidth = 2;
      context.stroke();

      if (playing) animationFrameId = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(() => draw(performance.now()));
    observer.observe(canvas);
    draw(previousTime);
    return () => {
      observer.disconnect();
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, [frequency, gain, playing, type]);

  return (
    <div className={style.waveformPreview}>
      <div className={style.previewMeta}>
        <span>{WAVE_LABELS[type]}</span>
        <output>{Math.round(frequency)} Hz</output>
      </div>
      <canvas ref={canvasRef} aria-label={`${WAVE_LABELS[type]}预览`} />
    </div>
  );
}
