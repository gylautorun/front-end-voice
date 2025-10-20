import {useState, useRef, useMemo} from 'react'
import musicLink from '../春涧.mp3';
import style from '../style.module.scss';
import {useAudioMusic} from './use-audio-music';

export function AudioMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {audioContext, analyser, start} = useAudioMusic(canvasRef.current);
  const handlePlay = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.crossOrigin='anonymous';
      const audioSource = audioContext.audioInstance.createMediaElementSource(audio);
      audioSource.connect(analyser.instance);
      audioSource.connect(audioContext.gainNode);
      start();
    }
  };
  return (
    <div className={style.audioMusic}>
      <div className={style.analyser}>
        <canvas ref={canvasRef} className={style.canvas}></canvas>
      </div>
      <audio
        ref={audioRef}
        className={style.audio}
        controls={true}
        src={musicLink}
        crossOrigin={'anonymous'}
        onPlay={handlePlay}
      >
      </audio>
    </div>
  )
}

