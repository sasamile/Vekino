/**
 * Ajustes compartidos de micrófono / Opus para sala (LiveKit y P2P).
 *
 * La voz “robot” suele venir de bitrate bajo + reinicios de reproducción.
 * Aquí priorizamos fluidez: ~64 kbps Opus, 48 kHz, FEC/RED, sin DTX.
 */

/** Captura: 48 kHz mono, AEC/AGC. NS suave (sin voiceIsolation, que recorta sílabas). */
export const MIC_CAPTURE = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48_000,
} as const;

/** Techo Opus por emisor (~64 kbps): por encima de “speech” (24k) que suena metálico. */
export const AUDIO_BITRATE = 64_000;
