import { useState, useCallback } from 'react';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { Toast } from '@capacitor/toast';

export function useVoiceInput() {
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      const { value: hasPermission } = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPermission) {
        const { value: granted } = await VoiceRecorder.requestAudioRecordingPermission();
        if (!granted) {
          await Toast.show({ text: 'Permission denied' });
          return;
        }
      }

      await VoiceRecorder.startRecording();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording', error);
      await Toast.show({ text: 'Failed to start recording' });
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      const result = await VoiceRecorder.stopRecording();
      setIsRecording(false);

      // In a real app, you would send result.value.recordDataBase64 to a STT API
      // For now, we just notify the user.
      await Toast.show({ text: 'Voice input captured (Transcription requires STT API)' });
      return result.value.recordDataBase64;
    } catch (error) {
      console.error('Failed to stop recording', error);
      setIsRecording(false);
    }
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording
  };
}
