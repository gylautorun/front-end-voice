import {AudioSound} from './audio-sound';
import {AudioMusic} from './audio-music';
import style from './style.module.scss';

const components = [
  {id: 'audio-sound', component: AudioSound},
  {id: 'audio-music', component: AudioMusic}, 
];
function AudioContext() {
  return (
    <div className={style.audioContext}>
      {components.map(item => {
        const Component = item.component;
        return (
          <div key={item.id} className={style.component}>
            <Component />
          </div>
        );
      })}
    </div>
  )
}

export default AudioContext;
