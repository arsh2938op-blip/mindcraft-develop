// src/agent/flameagi/memory/permanent.js
//
// Shared memory — reads/writes the SAME files the FlameAGI desktop app
// uses, directly on disk (~/.flameagi/). No longer an HTTP call to the
// desktop app — that required the app to be running, which broke
// recall while it's closed. Both sides now touch the same files.

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

const FLAME_DIR = path.join(os.homedir(), '.flameagi');
const MEMORY_PATH = path.join(FLAME_DIR, 'memory.json');
const PLANS_PATH = path.join(FLAME_DIR, 'plans.json');

async function readJson(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        return [];
    }
}

async function writeJson(filePath, data) {
    await fs.mkdir(FLAME_DIR, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export default class FlamePermanentMemory {
    async recall(limit = 15) {
        return (await readJson(MEMORY_PATH)).slice(0, limit);
    }

    async remember(text) {
        if (!text || typeof text !== 'string') return;
        const entries = await readJson(MEMORY_PATH);
        const next = [{ id: randomUUID(), text: text.trim(), createdAt: Date.now() }, ...entries].slice(0, 200);
        await writeJson(MEMORY_PATH, next);
    }

    /** Separate category from general facts — e.g. "next time we'll go
     * to the trial chamber". Recallable from Minecraft OR the desktop app. */
    async recallPlans(limit = 10) {
        return (await readJson(PLANS_PATH)).slice(0, limit);
    }

    async rememberPlan(text, context = 'minecraft') {
        if (!text || typeof text !== 'string') return;
        const plans = await readJson(PLANS_PATH);
        const next = [
            { id: randomUUID(), text: text.trim(), status: 'pending', context, createdAt: Date.now() },
            ...plans
        ].slice(0, 100);
        await writeJson(PLANS_PATH, next);
    }
}
