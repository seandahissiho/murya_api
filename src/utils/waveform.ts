import {spawn} from 'child_process';
import fs from 'fs';
import path from 'path';

export type WaveformMetadata = {
    durationMs: number;
    samples: number;
    peakType: 'rms';
    peaks: number[];
};

type AudioProbe = {
    durationSec: number;
    sampleRate: number;
};

const DEFAULT_SAMPLE_COUNT = 1200;

function resolveMediaInput(mediaUrl: string): string {
    if (/^https?:\/\//i.test(mediaUrl)) {
        return mediaUrl;
    }

    if (path.isAbsolute(mediaUrl)) {
        if (fs.existsSync(mediaUrl)) {
            return mediaUrl;
        }
        if (mediaUrl.startsWith(path.sep)) {
            return path.join(process.cwd(), mediaUrl.slice(1));
        }
        return path.join(process.cwd(), mediaUrl);
    }

    return path.join(process.cwd(), mediaUrl);
}

async function probeAudio(input: string): Promise<AudioProbe> {
    const args = [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'stream=sample_rate',
        '-show_entries', 'format=duration',
        '-of', 'json',
        input,
    ];

    return await new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', args);
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];

        ffprobe.stdout.on('data', (chunk) => stdout.push(chunk));
        ffprobe.stderr.on('data', (chunk) => stderr.push(chunk));
        ffprobe.on('error', (err) => reject(err));
        ffprobe.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffprobe failed (${code}): ${Buffer.concat(stderr).toString('utf8')}`));
                return;
            }

            try {
                const payload = JSON.parse(Buffer.concat(stdout).toString('utf8'));
                const durationRaw = payload?.format?.duration;
                const sampleRateRaw = payload?.streams?.[0]?.sample_rate;
                const durationSec = Number(durationRaw);
                const sampleRate = Number(sampleRateRaw);
                if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
                    reject(new Error('ffprobe returned invalid duration or sample rate'));
                    return;
                }
                resolve({durationSec, sampleRate});
            } catch (err) {
                reject(err);
            }
        });
    });
}

export async function computeWaveformFromMediaUrl(
    mediaUrl: string,
    samples: number = DEFAULT_SAMPLE_COUNT,
): Promise<WaveformMetadata | null> {
    const input = resolveMediaInput(mediaUrl);
    let probe: AudioProbe;
    try {
        probe = await probeAudio(input);
    } catch (err) {
        // console.error('Audio probe failed:', err);
        return null;
    }

    const totalSamples = Math.max(1, Math.floor(probe.durationSec * probe.sampleRate));
    const windowSize = Math.max(1, Math.floor(totalSamples / samples));
    const rmsValues: number[] = [];
    let windowSumSq = 0;
    let windowCount = 0;
    let leftover: Buffer = Buffer.alloc(0);
    let stopProcessing = false;

    const ffmpegArgs = [
        '-v', 'error',
        '-i', input,
        '-ac', '1',
        '-f', 'f32le',
        '-acodec', 'pcm_f32le',
        '-',
    ];

    const durationMs = Math.round(probe.durationSec * 1000);

    return await new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        ffmpeg.stdout.on('data', (chunk: Buffer) => {
            if (stopProcessing) {
                return;
            }
            const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
            const sampleCount = Math.floor(data.length / 4);
            const end = sampleCount * 4;
            leftover = end < data.length ? data.subarray(end) : Buffer.alloc(0);

            for (let i = 0; i < sampleCount; i += 1) {
                const sample = data.readFloatLE(i * 4);
                windowSumSq += sample * sample;
                windowCount += 1;

                if (windowCount >= windowSize) {
                    rmsValues.push(Math.sqrt(windowSumSq / windowCount));
                    windowSumSq = 0;
                    windowCount = 0;

                    if (rmsValues.length >= samples) {
                        stopProcessing = true;
                        ffmpeg.stdout.destroy();
                        ffmpeg.kill('SIGKILL');
                        break;
                    }
                }
            }
        });

        ffmpeg.on('error', (err) => {
            console.error('Audio decode failed:', err);
        });

        ffmpeg.on('close', () => {
            if (!stopProcessing && windowCount > 0 && rmsValues.length < samples) {
                rmsValues.push(Math.sqrt(windowSumSq / windowCount));
            }

            while (rmsValues.length < samples) {
                rmsValues.push(0);
            }

            const maxRms = rmsValues.reduce((max, value) => (value > max ? value : max), 0);
            const peaks = rmsValues.map((value) => {
                if (maxRms <= 0) {
                    return 0;
                }
                const normalized = value / maxRms;
                return normalized > 1 ? 1 : normalized;
            });

            resolve({
                durationMs,
                samples,
                peakType: 'rms',
                peaks,
            });
        });
    });
}
