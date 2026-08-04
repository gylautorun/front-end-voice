import {useCallback, useEffect, useRef, useState} from 'react';
import type {AudioSoundSettings, PlaybackStatus} from './types';

/** 当前 Hook 持有的一套可复用音频图。 */
interface AudioGraph {
  /** 页面内唯一的音频上下文。 */
  context: AudioContext;
  /** 当前活动的振荡器；停止后会被清空。 */
  oscillator: OscillatorNode | null;
  /** 振荡器与扬声器之间的音量节点。 */
  gain: GainNode;
}

const FADE_IN_SECONDS = 0.025;
const FADE_OUT_SECONDS = 0.28;
const MIN_EXPONENTIAL_GAIN = 0.0001;

/** 管理振荡器的创建、实时参数更新、平滑停止和资源释放。 */
export function useAudio() {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const graphRef = useRef<AudioGraph | null>(null);
  const statusRef = useRef<PlaybackStatus>('idle');
  const stopTimerRef = useRef<number | null>(null);

  /** 同步 React 状态和事件回调读取的最新状态。 */
  const changeStatus = useCallback((nextStatus: PlaybackStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  /** 首次用户操作时创建 Context，后续播放复用，避免不断累积音频上下文。 */
  const ensureAudioGraph = useCallback(async (): Promise<AudioGraph> => {
    let graph = graphRef.current;
    if (!graph || graph.context.state === 'closed') {
      const context = new AudioContext();
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      graph = {context, gain, oscillator: null};
      graphRef.current = graph;
    }
    if (graph.context.state === 'suspended') {
      await graph.context.resume();
    }
    if (graph.context.state !== 'running') {
      throw new Error(`AudioContext is ${graph.context.state}`);
    }
    return graph;
  }, []);

  /** 创建一个新的 OscillatorNode，并以短淡入启动，避免瞬时电平产生爆音。 */
  const start = useCallback(async (settings: AudioSoundSettings): Promise<void> => {
    if (statusRef.current !== 'idle') return;
    changeStatus('starting');
    try {
      const graph = await ensureAudioGraph();
      const now = graph.context.currentTime;
      const oscillator = graph.context.createOscillator();
      oscillator.type = settings.type;
      oscillator.frequency.setValueAtTime(settings.frequency, now);
      oscillator.connect(graph.gain);

      graph.gain.gain.cancelScheduledValues(now);
      graph.gain.gain.setValueAtTime(0, now);
      graph.gain.gain.linearRampToValueAtTime(settings.gain, now + FADE_IN_SECONDS);
      graph.oscillator = oscillator;
      oscillator.onended = () => {
        oscillator.disconnect();
        if (graph.oscillator === oscillator) graph.oscillator = null;
      };
      oscillator.start(now);
      changeStatus('playing');
    } catch (error) {
      changeStatus('idle');
      throw error;
    }
  }, [changeStatus, ensureAudioGraph]);

  /** 按所选曲线平滑降低音量，再停止本次振荡器。 */
  const stop = useCallback((settings: AudioSoundSettings): void => {
    const graph = graphRef.current;
    const oscillator = graph?.oscillator;
    if (!graph || !oscillator || statusRef.current !== 'playing') return;

    const now = graph.context.currentTime;
    const endTime = now + FADE_OUT_SECONDS;
    const currentGain = Math.max(MIN_EXPONENTIAL_GAIN, graph.gain.gain.value);
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setValueAtTime(currentGain, now);
    if (settings.gainChangeType === 'exponentialRampToValueAtTime') {
      graph.gain.gain.exponentialRampToValueAtTime(MIN_EXPONENTIAL_GAIN, endTime);
    } else {
      graph.gain.gain.linearRampToValueAtTime(0, endTime);
    }
    oscillator.stop(endTime);
    changeStatus('stopping');

    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(() => {
      stopTimerRef.current = null;
      changeStatus('idle');
    }, FADE_OUT_SECONDS * 1000 + 30);
  }, [changeStatus]);

  /** 播放期间平滑更新波形、频率和音量，避免滑杆变化产生点击噪声。 */
  const update = useCallback((settings: AudioSoundSettings): void => {
    const graph = graphRef.current;
    if (!graph?.oscillator || statusRef.current !== 'playing') return;
    const now = graph.context.currentTime;
    graph.oscillator.type = settings.type;
    graph.oscillator.frequency.setTargetAtTime(settings.frequency, now, 0.015);
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setTargetAtTime(settings.gain, now, 0.015);
  }, []);

  /** 组件卸载时停止定时器、振荡器并关闭唯一 AudioContext。 */
  useEffect(() => () => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    const graph = graphRef.current;
    if (!graph) return;
    graph.oscillator?.disconnect();
    graph.gain.disconnect();
    if (graph.context.state !== 'closed') void graph.context.close();
    graphRef.current = null;
  }, []);

  return {
    start,
    status,
    stop,
    update,
  };
}
