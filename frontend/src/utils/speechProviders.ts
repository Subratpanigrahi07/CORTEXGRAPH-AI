export interface SpeechError {
  type: 'network' | 'not-allowed' | 'no-speech' | 'aborted' | 'unknown' | 'offline' | 'unsupported';
  message: string;
}

export interface ISpeechProvider {
  name: string;
  isSupported(): boolean;
  start(): Promise<void>;
  stop(): void;
  abort(): void;
  
  onStart?: () => void;
  onResult?: (text: string) => void;
  onError?: (error: SpeechError) => void;
  onEnd?: () => void;
}

/**
 * Native Web Speech API Provider (Google Speech on Chrome)
 */
export class NativeSpeechProvider implements ISpeechProvider {
  name = 'native';
  private recognition: any = null;

  isSupported(): boolean {
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  onStart?: () => void;
  onResult?: (text: string) => void;
  onError?: (error: SpeechError) => void;
  onEnd?: () => void;

  async start(): Promise<void> {
    if (!this.isSupported()) {
      if (this.onError) {
        this.onError({ type: 'unsupported', message: 'Speech recognition is not supported in this browser.' });
      }
      return;
    }

    // Check offline status first
    if (!navigator.onLine) {
      if (this.onError) {
        this.onError({ type: 'offline', message: 'Voice search is currently unavailable. Please check your network connection.' });
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      if (event.results && event.results[0] && event.results[0][0]) {
        this.onResult?.(event.results[0][0].transcript);
      }
    };

    this.recognition.onerror = (e: any) => {
      let type: SpeechError['type'] = 'unknown';
      let message = `Voice search is currently unavailable. Please type your query or try again later.`;

      if (e.error === 'network') {
        type = 'network';
        message = 'Network error. Voice search is currently unavailable.';
      } else if (e.error === 'not-allowed') {
        type = 'not-allowed';
        message = 'Microphone permission denied. Please allow mic access to use voice search.';
      } else if (e.error === 'no-speech') {
        type = 'no-speech';
        message = 'No speech detected. Please try again.';
      } else if (e.error === 'aborted') {
        type = 'aborted';
        message = 'Speech recognition aborted.';
      }

      this.onError?.({ type, message });
    };

    this.recognition.onend = () => {
      this.onEnd?.();
    };

    try {
      this.recognition.start();
    } catch (err) {
      this.onError?.({ type: 'unknown', message: 'Voice search is currently unavailable. Please type your query or try again later.' });
    }
  }

  stop(): void {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }

  abort(): void {
    if (this.recognition) {
      try { this.recognition.abort(); } catch (e) {}
    }
  }
}

/**
 * Manages speech providers
 */
export class SpeechManager {
  private activeProvider: ISpeechProvider | null = null;
  private primaryProvider: ISpeechProvider;

  constructor(
    public onStart?: () => void,
    public onResult?: (text: string) => void,
    public onError?: (message: string) => void,
    public onEnd?: () => void
  ) {
    this.primaryProvider = new NativeSpeechProvider();
  }

  private setupProviderEvents(provider: ISpeechProvider) {
    provider.onStart = () => {
      this.activeProvider = provider;
      this.onStart?.();
    };

    provider.onResult = (text: string) => {
      this.onResult?.(text);
      this.stop();
    };

    provider.onError = (error: SpeechError) => {
      this.onError?.(error.message);
      this.stop();
    };

    provider.onEnd = () => {
      // Only trigger onEnd if it was the currently active provider
      if (this.activeProvider === provider) {
        this.activeProvider = null;
        this.onEnd?.();
      }
    };
  }

  async start() {
    this.stop(); // Ensure any existing is stopped

    if (this.primaryProvider.isSupported()) {
      this.setupProviderEvents(this.primaryProvider);
      try {
        await this.primaryProvider.start();
      } catch (err) {
        this.onError?.('Voice search is currently unavailable. Please type your query or try again later.');
      }
    } else {
       this.onError?.('Speech recognition is not supported in this browser.');
    }
  }

  stop() {
    if (this.activeProvider) {
      this.activeProvider.stop();
      this.activeProvider = null;
    }
  }

  abort() {
    if (this.activeProvider) {
      this.activeProvider.abort();
      this.activeProvider = null;
    }
  }
}
