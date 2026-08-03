import {useState} from 'react'
import style from './style.module.scss';
import {PhoneSpeakBox} from './phone-speak-box';
import {PhoneVideoBox} from './phone-video-box';

export default function MediaRecorderApi() {
  return (
    <div className={style.mediaRecorderApi}>
      <div className={style.section}>
        <h3>{'录制语音'}</h3>
        <PhoneSpeakBox />
      </div>

      <div className={style.section}>
        <h3>{'录制视频'}</h3>
        <PhoneVideoBox />
      </div>
    </div>
  );
};
