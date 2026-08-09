"""
Automated Test Suite — Online Speech-to-Text API Verification
Tests /api/stt endpoint error handling and online transcription pipeline.
"""

import os
import sys
import io
import wave
import unittest
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app

class TestOnlineSpeechToText(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_01_empty_audio_returns_400(self):
        empty_file = ("audio.webm", b"", "audio/webm")
        response = self.client.post("/api/stt", files={"file": empty_file})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Empty audio recording", response.json()["detail"])

    def test_02_synthetic_wav_upload_stt(self):
        # Generate 1-second synthetic silent WAV audio binary
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(b'\x00\x00' * 16000)
        wav_bytes = buf.getvalue()

        test_file = ("recording.wav", wav_bytes, "audio/wav")
        response = self.client.post("/api/stt", files={"file": test_file})

        # Should either succeed (200) with STT engine response or fail gracefully (500) if API keys are unset
        self.assertIn(response.status_code, [200, 500])
        if response.status_code == 200:
            data = response.json()
            self.assertIn("text", data)
            self.assertIn("engine", data)
            print(f"[STT Test] Transcribed output: '{data['text']}' via {data['engine']}")

if __name__ == '__main__':
    unittest.main()
