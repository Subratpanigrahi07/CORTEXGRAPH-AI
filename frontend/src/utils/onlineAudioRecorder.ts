/**
 * Online Microphone Audio Recorder for Speech-to-Text
 * Captures microphone audio, sends to backend STT API, and manages recording lifecycle.
 */

import { sendAudioForSTT } from './api';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'transcribing' | 'done' | 'error';

export interface OnlineAudioRecorderCallbacks {
  onStateChange: (state: VoiceState, message?: string) => void;
  onTranscription: (text: string, engine: string) => void;
  onError: (errorMsg: string) => void;
}

export class OnlineAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private callbacks: OnlineAudioRecorderCallbacks;

  constructor(callbacks: OnlineAudioRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  public async startRecording() {
    this.audioChunks = [];
    this.callbacks.onStateChange('listening', 'Listening... Speak into your microphone');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by your browser.');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/wav';

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.stopStream();
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        if (audioBlob.size === 0) {
          this.callbacks.onStateChange('error', 'No audio detected');
          this.callbacks.onError('No audio detected in recording. Please try speaking again.');
          return;
        }

        try {
          this.callbacks.onStateChange('processing', 'Uploading audio to online STT...');
          this.callbacks.onStateChange('transcribing', 'Transcribing speech with online API...');
          
          const result = await sendAudioForSTT(audioBlob, `speech.${mimeType.split('/')[1]}`);
          
          if (!result.text.trim()) {
            throw new Error('Speech could not be recognized. Please try speaking clearly.');
          }

          this.callbacks.onStateChange('done', `Transcribed via ${result.engine}`);
          this.callbacks.onTranscription(result.text, result.engine);
        } catch (err: any) {
          const errMsg = err.response?.data?.detail || err.message || 'Online Speech-to-Text service error.';
          this.callbacks.onStateChange('error', errMsg);
          this.callbacks.onError(errMsg);
        }
      };

      this.mediaRecorder.start(250); // Slice data every 250ms
    } catch (err: any) {
      this.stopStream();
      let msg = 'Failed to access microphone.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Microphone permission denied. Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No microphone device found on your system.';
      } else if (err.message) {
        msg = err.message;
      }
      this.callbacks.onStateChange('error', msg);
      this.callbacks.onError(msg);
    }
  }

  public stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      this.stopStream();
      this.callbacks.onStateChange('idle');
    }
  }

  public cancelRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.stopStream();
    this.callbacks.onStateChange('idle');
  }

  private stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
