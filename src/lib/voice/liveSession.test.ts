import { beforeEach, describe, expect, it, vi } from "vitest";
import { startLiveSession } from "./liveSession";

function createFakeAnalyser() {
	return {
		fftSize: 0,
		frequencyBinCount: 128,
		connect: vi.fn(),
		disconnect: vi.fn(),
		getByteFrequencyData: vi.fn(),
	};
}

function createFakeAudioContext() {
	const analysers: ReturnType<typeof createFakeAnalyser>[] = [];
	const context = {
		currentTime: 0,
		destination: {},
		createMediaStreamSource: vi.fn(() => ({
			connect: vi.fn(),
			disconnect: vi.fn(),
		})),
		createAnalyser: vi.fn(() => {
			const analyser = createFakeAnalyser();
			analysers.push(analyser);
			return analyser;
		}),
		createScriptProcessor: vi.fn(() => ({
			connect: vi.fn(),
			disconnect: vi.fn(),
			onaudioprocess: null as ((event: unknown) => void) | null,
		})),
		createBuffer: vi.fn(() => ({
			duration: 0.1,
			copyToChannel: vi.fn(),
		})),
		createBufferSource: vi.fn(() => ({
			buffer: null,
			connect: vi.fn(),
			start: vi.fn(),
		})),
		close: vi.fn(),
	};
	return { context, analysers };
}

function createFakeMediaStream() {
	return {
		getTracks: vi.fn(() => [{ stop: vi.fn() }]),
	} as unknown as MediaStream;
}

describe("startLiveSession", () => {
	let liveCallbacks: {
		onopen?: () => void;
		onerror?: (e: unknown) => void;
		onclose?: (e: unknown) => void;
		onmessage?: (message: unknown) => void;
	};
	let fakeSession: {
		sendRealtimeInput: ReturnType<
			typeof vi.fn<
				(params: { audio: { data: string; mimeType: string } }) => void
			>
		>;
		close: ReturnType<typeof vi.fn<() => void>>;
	};
	let connect: ReturnType<
		typeof vi.fn<
			(params: {
				callbacks: typeof liveCallbacks;
			}) => Promise<typeof fakeSession>
		>
	>;

	beforeEach(() => {
		liveCallbacks = {};
		fakeSession = { sendRealtimeInput: vi.fn(), close: vi.fn() };
		connect = vi.fn((params: { callbacks: typeof liveCallbacks }) => {
			liveCallbacks = params.callbacks;
			return Promise.resolve(fakeSession);
		});
	});

	function baseDeps() {
		const input = createFakeAudioContext();
		const output = createFakeAudioContext();
		const contexts = [input.context, output.context];
		return {
			genAiFactory: vi.fn(() => ({ live: { connect } })),
			getUserMedia: vi.fn().mockResolvedValue(createFakeMediaStream()),
			audioContextFactory: vi.fn(
				() => contexts.shift() as unknown as AudioContext,
			),
			input,
			output,
		};
	}

	it("connects with the given token/model and calls onOpen when the socket opens", async () => {
		const deps = baseDeps();
		const onOpen = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: {
					onOpen,
					onSpeakingChange: vi.fn(),
					onTurnComplete: vi.fn(),
				},
			},
			deps,
		);

		expect(deps.genAiFactory).toHaveBeenCalledWith("tok");
		expect(connect).toHaveBeenCalledWith(
			expect.objectContaining({ model: "m" }),
		);
		liveCallbacks.onopen?.();
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	it("streams mic PCM via sendRealtimeInput on each audio-process tick", async () => {
		const deps = baseDeps();
		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete: vi.fn() },
			},
			deps,
		);

		const processor = deps.input.context.createScriptProcessor.mock.results[0]
			.value as {
			onaudioprocess: (event: unknown) => void;
		};
		processor.onaudioprocess({
			inputBuffer: { getChannelData: () => new Float32Array([0.5, -0.5, 0]) },
		});

		expect(fakeSession.sendRealtimeInput).toHaveBeenCalledWith(
			expect.objectContaining({
				audio: expect.objectContaining({ mimeType: "audio/pcm;rate=16000" }),
			}),
		);
	});

	it("accumulates transcription and calls onTurnComplete once turnComplete arrives", async () => {
		const deps = baseDeps();
		const onTurnComplete = vi.fn();
		const onSpeakingChange = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange, onTurnComplete },
			},
			deps,
		);

		liveCallbacks.onmessage?.({
			serverContent: { inputTranscription: { text: "Hello " } },
		});
		liveCallbacks.onmessage?.({
			serverContent: { inputTranscription: { text: "there" } },
		});
		liveCallbacks.onmessage?.({
			serverContent: { outputTranscription: { text: "Hi!" } },
		});
		liveCallbacks.onmessage?.({
			serverContent: { turnComplete: true },
		});

		expect(onTurnComplete).toHaveBeenCalledWith({
			userText: "Hello there",
			modelText: "Hi!",
		});
	});

	it("calls onSpeakingChange(true) on the first audio chunk of a turn, then (false) at turnComplete", async () => {
		const deps = baseDeps();
		const onSpeakingChange = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange, onTurnComplete: vi.fn() },
			},
			deps,
		);

		liveCallbacks.onmessage?.({
			serverContent: {
				modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] },
			},
		});
		expect(onSpeakingChange).toHaveBeenCalledWith(true);

		liveCallbacks.onmessage?.({ serverContent: { turnComplete: true } });
		expect(onSpeakingChange).toHaveBeenCalledWith(false);
	});

	it("does not call onTurnComplete when a turn has no transcript text at all", async () => {
		const deps = baseDeps();
		const onTurnComplete = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete },
			},
			deps,
		);

		liveCallbacks.onmessage?.({ serverContent: { turnComplete: true } });

		expect(onTurnComplete).not.toHaveBeenCalled();
	});

	it("close() stops mic tracks, disconnects nodes, closes both contexts, and closes the session", async () => {
		const deps = baseDeps();
		const mediaStream = createFakeMediaStream();
		deps.getUserMedia.mockResolvedValue(mediaStream);

		const session = await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete: vi.fn() },
			},
			deps,
		);
		session.close();

		expect(
			(
				mediaStream.getTracks() as unknown as {
					stop: ReturnType<typeof vi.fn<() => void>>;
				}[]
			)[0].stop,
		).toBeDefined();
		expect(deps.input.context.close).toHaveBeenCalledTimes(1);
		expect(deps.output.context.close).toHaveBeenCalledTimes(1);
		expect(fakeSession.close).toHaveBeenCalledTimes(1);
	});

	it("exposes micAnalyser and outputAnalyser on the returned session", async () => {
		const deps = baseDeps();

		const session = await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete: vi.fn() },
			},
			deps,
		);

		expect(session.micAnalyser).toBeDefined();
		expect(session.outputAnalyser).toBeDefined();
	});
});
