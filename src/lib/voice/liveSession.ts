import { GoogleGenAI, Modality } from "@google/genai";
import { base64ToInt16, floatTo16BitPCM, int16ToBase64, int16ToFloat32 } from "./audioUtils";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
// Larger buffers reduce message-send frequency at the cost of latency; 4096
// samples at 16kHz is ~256ms per chunk, a reasonable balance for voice chat.
const CAPTURE_BUFFER_SIZE = 4096;

export interface LiveSessionCallbacks {
	onOpen?: () => void;
	onClose?: (reason?: string) => void;
	onError?: (error: unknown) => void;
	onSpeakingChange: (speaking: boolean) => void;
	onTurnComplete: (turn: { userText: string; modelText: string }) => void;
}

export interface StartLiveSessionOptions {
	token: string;
	model: string;
	callbacks: LiveSessionCallbacks;
}

interface LiveSessionLike {
	sendRealtimeInput(params: { audio: { data: string; mimeType: string } }): void;
	close(): void;
}

export interface LiveSessionDeps {
	genAiFactory?: (apiKey: string) => { live: { connect(params: unknown): Promise<LiveSessionLike> } };
	getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
	audioContextFactory?: (options?: { sampleRate: number }) => AudioContext;
}

export interface LiveSession {
	micAnalyser: AnalyserNode;
	outputAnalyser: AnalyserNode;
	close: () => void;
}

function defaultGenAiFactory(apiKey: string) {
	return new GoogleGenAI({ apiKey });
}

function defaultGetUserMedia(constraints: MediaStreamConstraints) {
	return navigator.mediaDevices.getUserMedia(constraints);
}

function defaultAudioContextFactory(options?: { sampleRate: number }) {
	return new AudioContext(options);
}

interface ServerContentPart {
	inlineData?: { data?: string };
}

interface ServerMessage {
	serverContent?: {
		inputTranscription?: { text?: string };
		outputTranscription?: { text?: string };
		modelTurn?: { parts?: ServerContentPart[] };
		turnComplete?: boolean;
	};
}

export async function startLiveSession(
	options: StartLiveSessionOptions,
	deps: LiveSessionDeps = {},
): Promise<LiveSession> {
	const {
		genAiFactory = defaultGenAiFactory,
		getUserMedia = defaultGetUserMedia,
		audioContextFactory = defaultAudioContextFactory,
	} = deps;

	const micStream = await getUserMedia({ audio: true });

	const inputContext = audioContextFactory({ sampleRate: INPUT_SAMPLE_RATE });
	const outputContext = audioContextFactory({ sampleRate: OUTPUT_SAMPLE_RATE });

	const micSource = inputContext.createMediaStreamSource(micStream);
	const micAnalyser = inputContext.createAnalyser();
	micAnalyser.fftSize = 256;
	micSource.connect(micAnalyser);

	const outputAnalyser = outputContext.createAnalyser();
	outputAnalyser.fftSize = 256;
	outputAnalyser.connect(outputContext.destination);

	let nextPlaybackTime = 0;
	let currentUserText = "";
	let currentModelText = "";
	let turnHasAudio = false;

	function playPcmChunk(base64Data: string) {
		let pcm: Int16Array;
		try {
			pcm = base64ToInt16(base64Data);
		} catch (error) {
			// Malformed/truncated audio chunk (e.g. odd byte length) — skip it
			// rather than tearing down the whole session over one bad frame.
			options.callbacks.onError?.(error);
			return;
		}
		const float32 = int16ToFloat32(pcm);
		const buffer = outputContext.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
		// `int16ToFloat32` returns a plain `Float32Array` (backed by ArrayBufferLike);
		// `copyToChannel` narrows to the ArrayBuffer-backed variant, so assert it here.
		buffer.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);

		const source = outputContext.createBufferSource();
		source.buffer = buffer;
		source.connect(outputAnalyser);

		const startAt = Math.max(nextPlaybackTime, outputContext.currentTime);
		source.start(startAt);
		nextPlaybackTime = startAt + buffer.duration;
	}

	const ai = genAiFactory(options.token);
	const session = await ai.live.connect({
		model: options.model,
		config: { responseModalities: [Modality.AUDIO] },
		callbacks: {
			onopen: () => options.callbacks.onOpen?.(),
			onerror: (e: unknown) => options.callbacks.onError?.(e),
			onclose: (e: { reason?: string }) => options.callbacks.onClose?.(e?.reason),
			onmessage: (message: ServerMessage) => {
				const content = message.serverContent;
				if (!content) return;

				if (content.inputTranscription?.text) {
					currentUserText += content.inputTranscription.text;
				}
				if (content.outputTranscription?.text) {
					currentModelText += content.outputTranscription.text;
				}

				const audioPart = content.modelTurn?.parts?.find((part) => part.inlineData?.data);
				if (audioPart?.inlineData?.data) {
					if (!turnHasAudio) {
						turnHasAudio = true;
						options.callbacks.onSpeakingChange(true);
					}
					playPcmChunk(audioPart.inlineData.data);
				}

				if (content.turnComplete) {
					const userText = currentUserText.trim();
					const modelText = currentModelText.trim();
					currentUserText = "";
					currentModelText = "";
					if (turnHasAudio) {
						turnHasAudio = false;
						options.callbacks.onSpeakingChange(false);
					}
					if (userText || modelText) {
						options.callbacks.onTurnComplete({ userText, modelText });
					}
				}
			},
		},
	});

	const processor = inputContext.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
	micSource.connect(processor);
	processor.connect(inputContext.destination);
	processor.onaudioprocess = (event: AudioProcessingEvent) => {
		const input = event.inputBuffer.getChannelData(0);
		const pcm = floatTo16BitPCM(input);
		session.sendRealtimeInput({
			audio: { data: int16ToBase64(pcm), mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` },
		});
	};

	const close = () => {
		processor.disconnect();
		micSource.disconnect();
		micStream.getTracks().forEach((track) => track.stop());
		inputContext.close();
		outputContext.close();
		session.close();
	};

	return { micAnalyser, outputAnalyser, close };
}
