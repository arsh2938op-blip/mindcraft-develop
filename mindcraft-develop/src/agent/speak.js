// src/agent/speak.js

import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { TTSConfig as gptTTSConfig } from '../models/gpt.js';
import { TTSConfig as geminiTTSConfig } from '../models/gemini.js';

/*
 * ============================================================
 * MINDCRAFT SPEAK SYSTEM
 * ============================================================
 *
 * Shared voice system.
 *
 * Supported:
 *
 *   system
 *   flame
 *   google
 *   openai
 *
 * Flame:
 *
 *   flame
 *
 * Flame currently uses the local system TTS.
 * This keeps FlameAGI voice completely free and offline.
 *
 * Later Flame can receive its own TTS provider without
 * changing the public speak() API.
 *
 * Examples:
 *
 *   speak('Hello');
 *
 *   speak('Hello from Flame', 'flame');
 *
 *   speak(
 *       'Hello',
 *       'google/model/voice'
 *   );
 *
 * ============================================================
 */

const speakingQueue = [];

let isSpeaking = false;

/*
 * ============================================================
 * PUBLIC SPEAK API
 * ============================================================
 */

/**
 * Speak text.
 *
 * Supported models:
 *
 *   system
 *   flame
 *   google/model/voice
 *   openai/model/voice
 *
 * Flame is intentionally mapped to local system TTS for now.
 */
export function speak(text, speakModel = 'system') {
    if (
        typeof text !== 'string' ||
        text.trim() === ''
    ) {
        return;
    }

    const item = {
        text: text.trim(),
        model: speakModel,
        audioData: null,
        error: null,
        ready: null
    };

    /*
     * Flame uses local system TTS.
     *
     * No API request.
     * No internet.
     * No API key.
     */
    if (
        speakModel === 'flame' ||
        speakModel === 'system'
    ) {
        item.ready = Promise.resolve();
    }

    /*
     * Remote TTS provider.
     */
    else {
        item.ready = fetchRemoteAudio(
            text,
            speakModel
        )
            .then(data => {
                item.audioData = data;
            })
            .catch(error => {
                item.error = error;
            });
    }

    speakingQueue.push(item);

    if (!isSpeaking) {
        processQueue();
    }
}

/*
 * ============================================================
 * REMOTE TTS
 * ============================================================
 */

async function fetchRemoteAudio(text, model) {
    let provider;
    let modelName;
    let voice;
    let url;

    /*
     * String format:
     *
     * google/model/voice
     *
     * openai/model/voice
     */
    if (typeof model === 'string') {
        const parts = model.split('/');

        provider = parts[0];
        modelName = parts[1];
        voice = parts[2];

        url = getProviderUrl(provider);
    }

    /*
     * Object format:
     *
     * {
     *     api: 'google',
     *     model: '...',
     *     voice: '...',
     *     url: '...'
     * }
     */
    else if (
        model &&
        typeof model === 'object' &&
        !Array.isArray(model)
    ) {
        provider = model.api;
        modelName = model.model;
        voice = model.voice;

        url =
            model.url ??
            getProviderUrl(provider);
    }

    else {
        throw new TypeError(
            'Invalid TTS model.'
        );
    }

    /*
     * OpenAI TTS
     */
    if (provider === 'openai') {
        return gptTTSConfig.sendAudioRequest(
            text,
            modelName,
            voice,
            url
        );
    }

    /*
     * Google / Gemini TTS
     */
    if (provider === 'google') {
        return geminiTTSConfig.sendAudioRequest(
            text,
            modelName,
            voice,
            url
        );
    }

    throw new Error(
        `TTS provider "${provider}" is not supported.`
    );
}

/*
 * ============================================================
 * PROVIDER URL
 * ============================================================
 */

function getProviderUrl(provider) {
    if (provider === 'openai') {
        return gptTTSConfig.baseUrl;
    }

    if (provider === 'google') {
        return geminiTTSConfig.baseUrl;
    }

    return null;
}

/*
 * ============================================================
 * SPEAKING QUEUE
 * ============================================================
 */

async function processQueue() {
    if (isSpeaking) {
        return;
    }

    isSpeaking = true;

    while (speakingQueue.length > 0) {
        const item =
            speakingQueue.shift();

        if (!item) {
            continue;
        }

        if (
            typeof item.text !== 'string' ||
            item.text.trim() === ''
        ) {
            continue;
        }

        try {
            /*
             * Wait for remote TTS generation.
             */
            await item.ready;

            if (item.error) {
                throw item.error;
            }

            /*
             * Flame / system TTS.
             */
            if (
                item.model === 'flame' ||
                item.model === 'system'
            ) {
                await playSystemTTS(
                    item.text
                );

                continue;
            }

            /*
             * Remote TTS.
             */
            if (!item.audioData) {
                throw new Error(
                    'No audio data received from TTS provider.'
                );
            }

            await playAudio(
                item.audioData
            );
        }

        catch (error) {
            console.error(
                '[TTS] Error:',
                error?.message || error
            );
        }
    }

    isSpeaking = false;
}

/*
 * ============================================================
 * SYSTEM / FLAME TTS
 * ============================================================
 *
 * Flame currently uses the operating system's built-in
 * speech engine.
 *
 * This gives us:
 *
 *   Flame -> voice
 *
 * without:
 *
 *   Flame -> API
 *   Flame -> internet
 *   Flame -> API cost
 *
 * Later this function can be upgraded to a dedicated
 * Flame voice provider without changing speak().
 */

function playSystemTTS(text) {
    return new Promise(resolve => {
        const isWindows =
            process.platform === 'win32';

        const isMac =
            process.platform === 'darwin';

        let command;

        /*
         * Windows
         *
         * Uses System.Speech.
         */
        if (isWindows) {
            const safeText =
                text.replace(/'/g, "''");

            command =
                `powershell -NoProfile -Command "` +
                `Add-Type -AssemblyName System.Speech; ` +
                `$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
                `$s.Rate=1; ` +
                `$s.Speak('${safeText}'); ` +
                `$s.Dispose()"`;
        }

        /*
         * macOS
         */
        else if (isMac) {
            const safeText =
                text.replace(/"/g, '\\"');

            command =
                `say "${safeText}"`;
        }

        /*
         * Linux
         */
        else {
            const safeText =
                text.replace(/"/g, '\\"');

            command =
                `espeak "${safeText}"`;
        }

        exec(
            command,
            error => {
                if (error) {
                    console.error(
                        '[TTS] System voice error:',
                        error.message
                    );
                }

                resolve();
            }
        );
    });
}

/*
 * ============================================================
 * REMOTE AUDIO PLAYBACK
 * ============================================================
 *
 * audioData is expected to be base64 encoded audio.
 *
 * ffplay is used for playback.
 */

function playAudio(audioData) {
    return new Promise(async resolve => {
        const isWindows =
            process.platform === 'win32';

        let tempPath = null;

        try {
            /*
             * Windows:
             *
             * Write temporary MP3 file.
             */
            if (isWindows) {
                tempPath = path.join(
                    os.tmpdir(),
                    `mindcraft_tts_${Date.now()}_${Math.random()
                        .toString(36)
                        .slice(2)}.mp3`
                );

                await fs.writeFile(
                    tempPath,
                    Buffer.from(
                        audioData,
                        'base64'
                    )
                );

                const player = spawn(
                    'ffplay',
                    [
                        '-nodisp',
                        '-autoexit',
                        '-loglevel',
                        'quiet',
                        tempPath
                    ],
                    {
                        stdio: 'ignore',
                        windowsHide: true
                    }
                );

                player.on(
                    'error',
                    async error => {
                        console.error(
                            '[TTS] ffplay error:',
                            error.message
                        );

                        await cleanupTempFile(
                            tempPath
                        );

                        resolve();
                    }
                );

                player.on(
                    'exit',
                    async () => {
                        await cleanupTempFile(
                            tempPath
                        );

                        resolve();
                    }
                );

                return;
            }

            /*
             * Linux / macOS:
             *
             * Stream audio directly into ffplay.
             */
            const player = spawn(
                'ffplay',
                [
                    '-nodisp',
                    '-autoexit',
                    '-loglevel',
                    'quiet',
                    'pipe:0'
                ],
                {
                    stdio: [
                        'pipe',
                        'ignore',
                        'ignore'
                    ]
                }
            );

            player.stdin.write(
                Buffer.from(
                    audioData,
                    'base64'
                )
            );

            player.stdin.end();

            player.on(
                'error',
                error => {
                    console.error(
                        '[TTS] ffplay error:',
                        error.message
                    );

                    resolve();
                }
            );

            player.on(
                'exit',
                () => {
                    resolve();
                }
            );
        }

        catch (error) {
            console.error(
                '[TTS] Audio playback error:',
                error.message
            );

            if (tempPath) {
                await cleanupTempFile(
                    tempPath
                );
            }

            resolve();
        }
    });
}

/*
 * ============================================================
 * TEMP FILE CLEANUP
 * ============================================================
 */

async function cleanupTempFile(file) {
    if (!file) {
        return;
    }

    try {
        await fs.unlink(file);
    }

    catch {
        /*
         * File may already have been deleted.
         */
    }
}

/*
 * ============================================================
 * FLAME-SPECIFIC HELPER
 * ============================================================
 *
 * This gives FlameAGI a clean API:
 *
 *     speakFlame('Hello');
 *
 * Internally:
 *
 *     speak(text, 'flame')
 *
 * Other MindCraft AIs can still use:
 *
 *     speak(text)
 *
 * or:
 *
 *     speak(text, 'google/...')
 *
 * Flame does NOT own the entire Speak system.
 */

export function speakFlame(text) {
    return speak(
        text,
        'flame'
    );
}

/*
 * ============================================================
 * OPTIONAL STATUS API
 * ============================================================
 */

/**
 * Returns whether the TTS system is currently speaking.
 */
export function isSpeakBusy() {
    return isSpeaking;
}

/**
 * Returns the number of queued speech items.
 */
export function getSpeakQueueLength() {
    return speakingQueue.length;
}

/**
 * Clear speech that has not started yet.
 */
export function clearSpeakQueue() {
    speakingQueue.length = 0;
}