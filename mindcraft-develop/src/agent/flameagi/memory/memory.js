// src/agent/flameagi/memory/memory.js

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_USER = {
    name: '',
    preferences: [],
    important_facts: [],
    instructions: [],
    notes: []
};

const DEFAULT_KNOWLEDGE = {
    general: [],
    minecraft: {
        pvp: [],
        movement: [],
        combat: [],
        survival: [],
        building: [],
        mining: [],
        crafting: [],
        general: []
    },
    sources: []
};

export default class FlameMemory {
    constructor(options = {}) {
        this.memoryBank = options.memoryBank ?? null;
        this.embeddingModel = options.embeddingModel ?? null;
        this.worldMemory = options.worldMemory ?? null;

        this.memoryFile =
            options.memoryFile ??
            path.resolve('.bots', 'FLAMEAGI_1', 'memory.json');

        this.dataDir =
            options.dataDir ??
            path.join(__dirname, 'data');

        this.userFile =
            options.userFile ??
            path.join(this.dataDir, 'user.json');

        this.memoriesFile =
            options.memoriesFile ??
            path.join(this.dataDir, 'memories.json');

        this.knowledgeFile =
            options.knowledgeFile ??
            path.join(this.dataDir, 'knowledge.json');

        this.maxSessionEntries =
            options.maxSessionEntries ?? 100;

        this.maxPermanentEntries =
            options.maxPermanentEntries ?? 500;

        this.maxKnowledgeEntries =
            options.maxKnowledgeEntries ?? 500;

        this.maxRecallMemories =
            options.maxRecallMemories ?? 5;

        this.maxRecallKnowledge =
            options.maxRecallKnowledge ?? 5;

        this.maxRecallWorld =
            options.maxRecallWorld ?? 5;

        this.embeddingMinTextLength =
            options.embeddingMinTextLength ?? 8;

        for (const [name, value] of [
            ['maxSessionEntries', this.maxSessionEntries],
            ['maxPermanentEntries', this.maxPermanentEntries],
            ['maxKnowledgeEntries', this.maxKnowledgeEntries],
            ['maxRecallMemories', this.maxRecallMemories],
            ['maxRecallKnowledge', this.maxRecallKnowledge],
            ['maxRecallWorld', this.maxRecallWorld]
        ]) {
            if (!Number.isInteger(value) || value <= 0) {
                throw new TypeError(
                    `FlameMemory: ${name} must be a positive integer.`
                );
            }
        }

        this._entries = [];
        this._memory = '';
        this.initialized = false;
        this._locks = new Map();
    }

    async init() {
        if (this.initialized) {
            return this;
        }

        await fs.mkdir(path.dirname(this.memoryFile), { recursive: true });
        await fs.mkdir(this.dataDir, { recursive: true });

        await this.ensureJson(this.userFile, DEFAULT_USER);
        await this.ensureJson(this.memoriesFile, { memories: [] });
        await this.ensureJson(this.knowledgeFile, DEFAULT_KNOWLEDGE);
        await this.load();

        this.initialized = true;
        return this;
    }

    async ensureJson(file, fallback) {
        try {
            const raw = await fs.readFile(file, 'utf8');
            if (!raw.trim()) {
                await this.writeJson(file, fallback);
                return;
            }
            JSON.parse(raw);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.writeJson(file, fallback);
                return;
            }

            await this.backupCorruptFile(file, error);
            await this.writeJson(file, fallback);
        }
    }

    async backupCorruptFile(file, error) {
        try {
            const backup =
                `${file}.corrupt-${Date.now()}`;

            await fs.copyFile(file, backup);
            console.error(
                `[FlameMemory] Corrupt JSON backed up: ${backup} (${error.message})`
            );
        } catch (backupError) {
            console.error(
                '[FlameMemory] Failed to back up corrupt JSON:',
                backupError.message
            );
        }
    }

    async load() {
        try {
            const data =
                await this.readJson(this.memoryFile, {
                    memory: '',
                    turns: []
                });

            this._memory =
                typeof data.memory === 'string'
                    ? data.memory
                    : '';

            this._entries =
                Array.isArray(data.turns)
                    ? data.turns
                        .filter(entry => entry && typeof entry === 'object')
                        .slice(-this.maxSessionEntries)
                        .map(entry => ({ ...entry }))
                    : [];

            if (
                !Array.isArray(data.turns) ||
                data.turns.length !== this._entries.length
            ) {
                await this.save();
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                await this.backupCorruptFile(this.memoryFile, error);
            }

            this._entries = [];
            this._memory = '';
            await this.save();
        }
    }

    async save() {
        await this.writeJson(this.memoryFile, {
            memory: this._memory,
            turns: this._entries.slice(-this.maxSessionEntries),
            self_prompting_state: 0,
            self_prompt: null,
            taskStart: Date.now(),
            last_sender: null
        });
    }

    async recall(query = '') {
        await this.init();

        const [memories, knowledge, world] =
            await Promise.all([
                this.search(query, this.maxRecallMemories),
                this.searchKnowledge(query, this.maxRecallKnowledge),
                this.searchWorld(query, this.maxRecallWorld)
            ]);

        return {
            user: await this.getUser(),
            memories,
            knowledge,
            world,
            session: this.recent(10),
            memory: this._memory
        };
    }

    async store(entry = {}) {
        await this.init();

        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new TypeError('FlameMemory: store entry must be an object.');
        }

        return this.withLock('session', async () => {
            const stored = {
                ...entry,
                timestamp: new Date().toISOString()
            };

            this._entries.push(stored);
            this._entries = this._entries.slice(-this.maxSessionEntries);

            await this.save();
            return { ...stored };
        });
    }

    async getMemory() {
        await this.init();
        return this._memory;
    }

    async setMemory(memory) {
        await this.init();

        if (typeof memory !== 'string') {
            throw new TypeError('FlameMemory: memory must be a string.');
        }

        return this.withLock('session', async () => {
            this._memory = memory.slice(0, 4000);
            await this.save();
            return this._memory;
        });
    }

    recent(limit = 10) {
        if (!Number.isInteger(limit) || limit <= 0) {
            return [];
        }

        return this._entries
            .slice(-limit)
            .map(entry => ({ ...entry }));
    }

    async clearSession() {
        await this.init();

        return this.withLock('session', async () => {
            this._entries = [];
            await this.save();
            return true;
        });
    }

    async remember(content, metadata = {}) {
        await this.init();

        if (typeof content !== 'string' || !content.trim()) {
            return null;
        }

        return this.withLock('memories', async () => {
            const data =
                await this.readJson(this.memoriesFile, { memories: [] });

            const memories =
                Array.isArray(data.memories)
                    ? data.memories
                        .filter(item => item && typeof item === 'object')
                    : [];

            const normalized =
                this.normalizeText(content);

            const duplicate =
                memories.find(memory =>
                    this.isDuplicateMemory(normalized, memory)
                );

            if (duplicate) {
                duplicate.updatedAt = new Date().toISOString();
                duplicate.confidence = Math.min(
                    1,
                    Number(duplicate.confidence ?? 0.6) + 0.05
                );
                duplicate.importance = Math.min(
                    1,
                    Number(duplicate.importance ?? 0.5) + 0.05
                );
                duplicate.reinforced =
                    Number(duplicate.reinforced ?? 0) + 1;
                duplicate.metadata = {
                    ...(duplicate.metadata ?? {}),
                    ...metadata
                };

                await this.writeJson(this.memoriesFile, {
                    memories: this.trimByUpdatedAt(memories, this.maxPermanentEntries)
                });

                return { ...duplicate };
            }

            const memory = {
                id: randomUUID(),
                type: metadata.type ?? this.detectMemoryType(content, metadata),
                content: content.trim(),
                normalized,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                importance: this.clamp01(metadata.importance ?? 0.6),
                confidence: this.clamp01(metadata.confidence ?? 0.7),
                source: metadata.source ?? 'FlameMemory',
                metadata: { ...metadata },
                embedding: await this.safeEmbed(content)
            };

            memories.push(memory);

            await this.writeJson(this.memoriesFile, {
                memories: this.trimByUpdatedAt(memories, this.maxPermanentEntries)
            });

            return { ...memory };
        });
    }

    async forget(id) {
        await this.init();

        return this.withLock('memories', async () => {
            const data =
                await this.readJson(this.memoriesFile, { memories: [] });

            const memories =
                Array.isArray(data.memories)
                    ? data.memories
                    : [];

            const next =
                memories.filter(memory => memory.id !== id);

            await this.writeJson(this.memoriesFile, { memories: next });
            return next.length !== memories.length;
        });
    }

    async getMemories() {
        await this.init();

        const data =
            await this.readJson(this.memoriesFile, { memories: [] });

        return Array.isArray(data.memories)
            ? data.memories.map(memory => ({ ...memory }))
            : [];
    }

    async search(query, limit = 10) {
        await this.init();

        if (!Number.isInteger(limit) || limit <= 0) {
            return [];
        }

        const memories =
            await this.getMemories();

        if (!memories.length) {
            return [];
        }

        const queryEmbedding =
            await this.safeEmbed(query);

        return this.rankRecords(memories, query, queryEmbedding)
            .filter(item => item.score > 0 || !query)
            .slice(0, limit)
            .map(({ record, score }) => ({
                ...record,
                relevance: Number(score.toFixed(4))
            }));
    }

    async getUser() {
        await this.init();
        return await this.readJson(this.userFile, DEFAULT_USER);
    }

    async setUserInfo(key, value) {
        await this.init();

        if (!key || typeof key !== 'string') {
            throw new TypeError('FlameMemory: user key must be a string.');
        }

        return this.withLock('user', async () => {
            const user =
                await this.readJson(this.userFile, DEFAULT_USER);

            user[key] = value;
            await this.writeJson(this.userFile, user);
            return { ...user };
        });
    }

    async addUserFact(fact) {
        return await this.addUniqueUserEntry('important_facts', fact);
    }

    async addUserPreference(preference) {
        return await this.addUniqueUserEntry('preferences', preference);
    }

    async addUserInstruction(instruction) {
        return await this.addUniqueUserEntry('instructions', instruction);
    }

    async addUserNote(note) {
        return await this.addUniqueUserEntry('notes', note);
    }

    async addUniqueUserEntry(key, value) {
        await this.init();

        if (typeof value !== 'string' || !value.trim()) {
            return null;
        }

        return this.withLock('user', async () => {
            const user =
                await this.readJson(this.userFile, DEFAULT_USER);

            if (!Array.isArray(user[key])) {
                user[key] = [];
            }

            const normalized =
                this.normalizeText(value);

            const existing =
                user[key].find(item =>
                    this.normalizeText(
                        typeof item === 'string' ? item : item?.content ?? ''
                    ) === normalized
                );

            if (existing) {
                return existing;
            }

            const entry = {
                id: randomUUID(),
                content: value.trim(),
                createdAt: new Date().toISOString()
            };

            user[key].push(entry);
            await this.writeJson(this.userFile, user);
            return { ...entry };
        });
    }

    async getKnowledge() {
        await this.init();
        return await this.readJson(this.knowledgeFile, DEFAULT_KNOWLEDGE);
    }

    async addKnowledge(category, content, source = 'train.py') {
        await this.init();

        if (typeof content !== 'string' || !content.trim()) {
            return null;
        }

        return this.withLock('knowledge', async () => {
            const knowledge =
                await this.readJson(this.knowledgeFile, DEFAULT_KNOWLEDGE);

            const list =
                this.getKnowledgeList(knowledge, category, true);

            const normalized =
                this.normalizeText(content);

            const duplicate =
                list.find(item =>
                    this.isDuplicateMemory(normalized, item)
                );

            if (duplicate) {
                duplicate.updatedAt = new Date().toISOString();
                duplicate.confidence = Math.min(
                    1,
                    Number(duplicate.confidence ?? 0.6) + 0.05
                );
                duplicate.importance = Math.min(
                    1,
                    Number(duplicate.importance ?? 0.5) + 0.05
                );
                duplicate.reinforced =
                    Number(duplicate.reinforced ?? 0) + 1;

                await this.writeJson(this.knowledgeFile, knowledge);
                return { ...duplicate };
            }

            const entry = {
                id: randomUUID(),
                category: category || 'general',
                content: content.trim(),
                normalized,
                source,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                importance: 0.65,
                confidence: 0.7,
                embedding: await this.safeEmbed(content)
            };

            list.push(entry);
            this.trimKnowledge(knowledge);

            await this.writeJson(this.knowledgeFile, knowledge);
            return { ...entry };
        });
    }

    async importKnowledge(entries, source = 'train.py') {
        await this.init();

        if (!Array.isArray(entries)) {
            throw new TypeError('FlameMemory: knowledge entries must be an array.');
        }

        const results = [];

        for (const entry of entries) {
            if (typeof entry === 'string') {
                results.push(await this.addKnowledge('general', entry, source));
                continue;
            }

            if (entry && typeof entry === 'object') {
                results.push(
                    await this.addKnowledge(
                        entry.category ?? 'general',
                        entry.content ?? entry.text ?? '',
                        entry.source ?? source
                    )
                );
            }
        }

        return results.filter(Boolean);
    }

    async searchKnowledge(query, limit = 10) {
        await this.init();

        if (!Number.isInteger(limit) || limit <= 0) {
            return [];
        }

        const knowledge =
            await this.getKnowledge();

        const records =
            this.flattenKnowledge(knowledge);

        if (!records.length) {
            return [];
        }

        const queryEmbedding =
            await this.safeEmbed(query);

        return this.rankRecords(records, query, queryEmbedding)
            .filter(item => item.score > 0 || !query)
            .slice(0, limit)
            .map(({ record, score }) => ({
                ...record,
                relevance: Number(score.toFixed(4))
            }));
    }

    async rememberTraining(category, content, source = 'train.py') {
        return await this.addKnowledge(category, content, source);
    }

    async rememberTrainingBatch(entries, source = 'train.py') {
        return await this.importKnowledge(entries, source);
    }

    async recallTraining(query, limit = 10) {
        return await this.searchKnowledge(query, limit);
    }

    async getTrainingKnowledge() {
        return await this.getKnowledge();
    }

    async searchAll(query, limit = 15) {
        await this.init();

        const perBucket =
            Math.max(1, Math.ceil(limit / 3));

        const [memories, knowledge, world] =
            await Promise.all([
                this.search(query, perBucket),
                this.searchKnowledge(query, perBucket),
                this.searchWorld(query, perBucket)
            ]);

        return [...memories, ...knowledge, ...world]
            .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
            .slice(0, limit);
    }

    async searchWorld(query, limit = 10) {
        await this.init();

        if (
            !this.worldMemory ||
            typeof this.worldMemory.search !== 'function' ||
            !query ||
            typeof query !== 'string'
        ) {
            return [];
        }

        try {
            const results =
                await this.worldMemory.search(query, limit);

            return Array.isArray(results)
                ? results.slice(0, limit)
                : [];
        } catch (error) {
            console.error('[FlameMemory] World recall error:', error.message);
            return [];
        }
    }

    async buildContext(query = '') {
        return await this.recall(query);
    }

    async exportMemory() {
        await this.init();

        return {
            session: {
                memory: this._memory,
                turns: this.recent(this.maxSessionEntries)
            },
            permanent: {
                user: await this.getUser(),
                memories: await this.getMemories(),
                knowledge: await this.getKnowledge()
            },
            world:
                this.worldMemory &&
                typeof this.worldMemory.exportWorld === 'function'
                    ? await this.worldMemory.exportWorld()
                    : null
        };
    }

    async importMemory(data) {
        await this.init();

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new TypeError('FlameMemory: import data must be an object.');
        }

        if (data.session && typeof data.session === 'object') {
            if (typeof data.session.memory === 'string') {
                this._memory = data.session.memory.slice(0, 4000);
            }

            if (Array.isArray(data.session.turns)) {
                this._entries =
                    data.session.turns
                        .filter(entry => entry && typeof entry === 'object')
                        .slice(-this.maxSessionEntries);
            }

            await this.save();
        }

        if (data.permanent?.user) {
            await this.writeJson(this.userFile, data.permanent.user);
        }

        if (Array.isArray(data.permanent?.memories)) {
            await this.writeJson(this.memoriesFile, {
                memories:
                    data.permanent.memories
                        .filter(item => item && typeof item === 'object')
                        .slice(-this.maxPermanentEntries)
            });
        }

        if (data.permanent?.knowledge) {
            await this.writeJson(this.knowledgeFile, data.permanent.knowledge);
        }

        if (
            data.world &&
            this.worldMemory &&
            typeof this.worldMemory.importWorld === 'function'
        ) {
            await this.worldMemory.importWorld(data.world);
        }

        return true;
    }

    async clearMemories() {
        await this.init();

        return this.withLock('memories', async () => {
            await this.writeJson(this.memoriesFile, { memories: [] });
            return true;
        });
    }

    async clearKnowledge() {
        await this.init();

        return this.withLock('knowledge', async () => {
            await this.writeJson(this.knowledgeFile, DEFAULT_KNOWLEDGE);
            return true;
        });
    }

    getMemoryFile() {
        return this.memoryFile;
    }

    setEmbeddingModel(model) {
        this.embeddingModel = model;
        return this;
    }

    setWorldMemory(worldMemory) {
        this.worldMemory = worldMemory;
        return this;
    }

    async readJson(file, fallback) {
        try {
            const raw = await fs.readFile(file, 'utf8');
            if (!raw.trim()) {
                return this.clone(fallback);
            }

            return JSON.parse(raw);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }

            await this.writeJson(file, fallback);
            return this.clone(fallback);
        }
    }

    async writeJson(file, data) {
        await fs.mkdir(path.dirname(file), { recursive: true });

        const tempFile =
            `${file}.tmp-${process.pid}-${Date.now()}`;

        await fs.writeFile(
            tempFile,
            JSON.stringify(data, null, 4),
            'utf8'
        );

        await fs.rename(tempFile, file);
    }

    async withLock(key, task) {
        const previous =
            this._locks.get(key) ??
            Promise.resolve();

        const next =
            previous
                .catch(() => {})
                .then(task);

        this._locks.set(key, next);

        try {
            return await next;
        } finally {
            if (this._locks.get(key) === next) {
                this._locks.delete(key);
            }
        }
    }

    async safeEmbed(text) {
        if (
            !this.embeddingModel ||
            typeof this.embeddingModel.embed !== 'function' ||
            typeof text !== 'string' ||
            text.trim().length < this.embeddingMinTextLength
        ) {
            return null;
        }

        try {
            const embedding =
                await this.embeddingModel.embed(text);

            return Array.isArray(embedding)
                ? embedding
                : null;
        } catch (error) {
            console.warn(
                '[FlameMemory] Embedding unavailable; using lexical recall:',
                error.message
            );
            return null;
        }
    }

    rankRecords(records, query, queryEmbedding) {
        const normalizedQuery =
            this.normalizeText(query);

        return records
            .filter(record => record && typeof record === 'object')
            .map(record => {
                const content =
                    this.recordText(record);

                const lexical =
                    normalizedQuery
                        ? this.wordOverlap(normalizedQuery, this.normalizeText(content))
                        : 0.15;

                const semantic =
                    queryEmbedding && Array.isArray(record.embedding)
                        ? this.cosineSimilarity(queryEmbedding, record.embedding)
                        : 0;

                const importance =
                    this.clamp01(record.importance ?? 0.5);

                const confidence =
                    this.clamp01(record.confidence ?? 0.5);

                const recency =
                    this.recencyScore(record.updatedAt ?? record.createdAt);

                const score =
                    semantic * 0.45 +
                    lexical * 0.3 +
                    importance * 0.12 +
                    confidence * 0.08 +
                    recency * 0.05;

                return { record, score };
            })
            .sort((a, b) => b.score - a.score);
    }

    recordText(record) {
        return String(
            record.content ??
            record.text ??
            record.name ??
            record.description ??
            ''
        );
    }

    normalizeText(text) {
        return String(text ?? '')
            .toLowerCase()
            .replace(/[^\w\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    isDuplicateMemory(normalized, memory) {
        const existing =
            memory.normalized ??
            this.normalizeText(this.recordText(memory));

        if (!normalized || !existing) {
            return false;
        }

        return (
            existing === normalized ||
            this.wordOverlap(normalized, existing) >= 0.92
        );
    }

    wordOverlap(a, b) {
        const left =
            new Set(String(a).split(/\s+/).filter(Boolean));

        const right =
            new Set(String(b).split(/\s+/).filter(Boolean));

        if (!left.size || !right.size) {
            return 0;
        }

        let matches = 0;

        for (const word of left) {
            if (right.has(word)) {
                matches++;
            }
        }

        return matches / Math.max(left.size, right.size);
    }

    cosineSimilarity(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return 0;
        }

        let dot = 0;
        let left = 0;
        let right = 0;

        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            left += a[i] * a[i];
            right += b[i] * b[i];
        }

        if (!left || !right) {
            return 0;
        }

        return dot / (Math.sqrt(left) * Math.sqrt(right));
    }

    recencyScore(date) {
        const time =
            Date.parse(date);

        if (!Number.isFinite(time)) {
            return 0;
        }

        const ageDays =
            (Date.now() - time) / 86400000;

        return Math.max(0, 1 - ageDays / 90);
    }

    detectMemoryType(content, metadata = {}) {
        if (metadata.type) {
            return metadata.type;
        }

        if (/prefer|like|favorite|favourite/i.test(content)) {
            return 'preference';
        }

        if (/base|coordinates?|village|portal|mine|farm|stronghold/i.test(content)) {
            return 'world_hint';
        }

        return 'fact';
    }

    getKnowledgeList(knowledge, category = 'general', create = false) {
        const parts =
            String(category || 'general')
                .split('.')
                .filter(Boolean);

        if (!parts.length) {
            parts.push('general');
        }

        let current = knowledge;

        for (const part of parts) {
            if (Array.isArray(current[part])) {
                return current[part];
            }

            if (!current[part] || typeof current[part] !== 'object') {
                if (!create) {
                    return [];
                }

                current[part] = [];
                return current[part];
            }

            current = current[part];
        }

        if (Array.isArray(current)) {
            return current;
        }

        if (!Array.isArray(current.general)) {
            if (!create) {
                return [];
            }

            current.general = [];
        }

        return current.general;
    }

    flattenKnowledge(knowledge) {
        const records = [];

        const visit = (value, category) => {
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (item && typeof item === 'object') {
                        records.push({
                            category,
                            ...item
                        });
                    }
                }
                return;
            }

            if (value && typeof value === 'object') {
                for (const [key, child] of Object.entries(value)) {
                    visit(child, category ? `${category}.${key}` : key);
                }
            }
        };

        visit(knowledge, '');
        return records;
    }

    trimKnowledge(knowledge) {
        const trim = value => {
            if (Array.isArray(value)) {
                value.sort((a, b) =>
                    Date.parse(b.updatedAt ?? b.createdAt ?? 0) -
                    Date.parse(a.updatedAt ?? a.createdAt ?? 0)
                );
                value.splice(this.maxKnowledgeEntries);
                return;
            }

            if (value && typeof value === 'object') {
                for (const child of Object.values(value)) {
                    trim(child);
                }
            }
        };

        trim(knowledge);
    }

    trimByUpdatedAt(records, limit) {
        return records
            .sort((a, b) =>
                Date.parse(a.updatedAt ?? a.createdAt ?? 0) -
                Date.parse(b.updatedAt ?? b.createdAt ?? 0)
            )
            .slice(-limit);
    }

    clamp01(value) {
        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return 0;
        }

        return Math.max(0, Math.min(1, number));
    }

    clone(value) {
        return JSON.parse(JSON.stringify(value));
    }
}
