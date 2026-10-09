import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface AudioRecordingResult {
  uri: string;
  base64Audio: string;
  mimeType: string;
  durationMs: number;
}

class AudioRecordingService {
  private recorder: any = null;
  private durationMs: number = 0;
  private statusSubscription: any = null;
  private isAudioModuleAvailable: boolean | null = null;

  private checkModuleAvailable(): boolean {
    if (this.isAudioModuleAvailable !== null) {
      return this.isAudioModuleAvailable;
    }
    try {
      const { AudioModule } = require('expo-audio');
      this.isAudioModuleAvailable = !!(
        AudioModule &&
        (AudioModule.AudioRecorder || AudioModule.requestRecordingPermissionsAsync)
      );
    } catch (e) {
      console.warn('[AudioRecordingService] expo-audio native module is not available in current environment:', e);
      this.isAudioModuleAvailable = false;
    }
    return this.isAudioModuleAvailable;
  }

  isAvailable(): boolean {
    return this.checkModuleAvailable();
  }

  async requestPermission(): Promise<boolean> {
    if (!this.checkModuleAvailable()) {
      return false;
    }
    try {
      const { requestRecordingPermissionsAsync } = require('expo-audio');
      const response = await requestRecordingPermissionsAsync();
      return !!response?.granted;
    } catch (e) {
      console.warn('[AudioRecordingService] requestPermission error:', e);
      return false;
    }
  }

  async hasPermission(): Promise<boolean> {
    if (!this.checkModuleAvailable()) {
      return false;
    }
    try {
      const { getRecordingPermissionsAsync } = require('expo-audio');
      const response = await getRecordingPermissionsAsync();
      return !!response?.granted;
    } catch (e) {
      return false;
    }
  }

  async startRecording(onProgress?: (durationMs: number) => void): Promise<boolean> {
    if (!this.checkModuleAvailable()) {
      console.warn('[AudioRecordingService] Cannot start recording: expo-audio module unavailable');
      return false;
    }

    try {
      const granted = await this.requestPermission();
      if (!granted) {
        return false;
      }

      // If an existing recording instance was active, cancel and unload it
      if (this.recorder) {
        await this.cancelRecording();
      }

      const { AudioModule, RecordingPresets, setAudioModeAsync } = require('expo-audio');

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      this.durationMs = 0;
      const options = RecordingPresets.HIGH_QUALITY;
      const recorder = new AudioModule.AudioRecorder(options);

      // Listen for recording status updates if supported
      try {
        if (typeof recorder.addListener === 'function') {
          this.statusSubscription = recorder.addListener('recordingStatusUpdate', (status: any) => {
            if (status && typeof status.durationMillis === 'number') {
              this.durationMs = status.durationMillis;
              if (onProgress) {
                onProgress(status.durationMillis);
              }
            }
          });
        }
      } catch (err) {
        console.warn('[AudioRecordingService] Failed to attach status listener:', err);
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      this.recorder = recorder;
      return true;
    } catch (err) {
      console.error('[AudioRecordingService] startRecording failed:', err);
      await this.cleanupAudioMode();
      this.recorder = null;
      return false;
    }
  }

  async stopRecording(): Promise<AudioRecordingResult | null> {
    if (!this.recorder) return null;

    try {
      const rec = this.recorder;
      this.recorder = null;

      if (this.statusSubscription) {
        try {
          this.statusSubscription.remove?.();
        } catch (_) {}
        this.statusSubscription = null;
      }

      // Attempt to capture duration if listener did not populate it
      try {
        const finalStatus = typeof rec.getStatus === 'function' ? rec.getStatus() : null;
        if (finalStatus && typeof finalStatus.durationMillis === 'number' && finalStatus.durationMillis > 0) {
          this.durationMs = finalStatus.durationMillis;
        }
      } catch (_) {}

      await rec.stop();
      await this.cleanupAudioMode();

      const uri = rec.uri;
      if (!uri) return null;

      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Remove temporary audio file
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (_) {}

      const mimeType = Platform.OS === 'android' ? 'audio/mp4' : 'audio/m4a';

      return {
        uri,
        base64Audio,
        mimeType,
        durationMs: this.durationMs,
      };
    } catch (err) {
      console.error('[AudioRecordingService] stopRecording failed:', err);
      await this.cleanupAudioMode();
      this.recorder = null;
      return null;
    }
  }

  async cancelRecording(): Promise<void> {
    if (!this.recorder) return;
    try {
      const rec = this.recorder;
      this.recorder = null;

      if (this.statusSubscription) {
        try {
          this.statusSubscription.remove?.();
        } catch (_) {}
        this.statusSubscription = null;
      }

      await rec.stop();
      const uri = rec.uri;
      if (uri) {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    } catch (err) {
      console.warn('[AudioRecordingService] cancelRecording error:', err);
    } finally {
      await this.cleanupAudioMode();
      this.recorder = null;
    }
  }

  private async cleanupAudioMode(): Promise<void> {
    try {
      if (this.checkModuleAvailable()) {
        const { setAudioModeAsync } = require('expo-audio');
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: false,
        });
      }
    } catch (_) {}
  }
}

export const audioRecordingService = new AudioRecordingService();
