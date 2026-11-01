// src/agent/flameagi/world/world.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * ============================================================
 * FlameAGI World Memory
 * ============================================================
 *
 * Permanent memory specifically for Minecraft worlds.
 *
 * This is separate from:
 *
 *   user.json
 *   memories.json
 *   knowledge.json
 *
 * World memory stores information about the actual Minecraft
 * world/server.
 *
 * Examples:
 *
 *   base coordinates
 *   important locations
 *   villages
 *   farms
 *   mines
 *   portals
 *   teammates
 *   dangerous areas
 *   world notes
 *
 * Storage:
 *
 * src/agent/flameagi/world/data/world.json
 * ============================================================
 */

export default class WorldMemory {
    constructor(options = {}) {
        this.dataDir =
            options.dataDir ??
            path.join(__dirname, 'data');

        this.worldFile =
            options.worldFile ??
            path.join(
                this.dataDir,
                'world.json'
            );

        this.initialized = false;
    }

    /*
     * ========================================================
     * INITIALIZATION
     * ========================================================
     */

    async init() {
        if (this.initialized) {
            return this;
        }

        await fs.mkdir(
            this.dataDir,
            {
                recursive: true
            }
        );

        await this.ensureFile(
            this.worldFile,
            {
                world: {},
                locations: [],
                players: [],
                structures: [],
                resources: [],
                dangers: [],
                notes: []
            }
        );

        this.initialized = true;

        return this;
    }

    async ensureFile(
        file,
        defaultData
    ) {
        try {
            await fs.access(file);
        } catch {
            await this.writeJSON(
                file,
                defaultData
            );
        }
    }

    /*
     * ========================================================
     * JSON STORAGE
     * ========================================================
     */

    async readJSON(
        file,
        fallback = {}
    ) {
        await this.init();

        try {
            const raw =
                await fs.readFile(
                    file,
                    'utf8'
                );

            if (!raw.trim()) {
                return fallback;
            }

            return JSON.parse(raw);
        } catch (error) {
            console.error(
                '[FlameAGI WorldMemory] Read error:',
                error.message
            );

            return fallback;
        }
    }

    async writeJSON(
        file,
        data
    ) {
        await fs.mkdir(
            path.dirname(file),
            {
                recursive: true
            }
        );

        const tempFile =
            `${file}.tmp`;

        await fs.writeFile(
            tempFile,
            JSON.stringify(
                data,
                null,
                4
            ),
            'utf8'
        );

        await fs.rename(
            tempFile,
            file
        );
    }

    /*
     * ========================================================
     * WORLD INFORMATION
     * ========================================================
     */

    async getWorld() {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        return data.world ?? {};
    }

    async setWorldInfo(
        key,
        value
    ) {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (!data.world) {
            data.world = {};
        }

        data.world[key] = value;

        await this.writeJSON(
            this.worldFile,
            data
        );

        return data.world;
    }

    /*
     * ========================================================
     * LOCATIONS
     * ========================================================
     *
     * Examples:
     *
     * Base
     * Village
     * Mine
     * Farm
     * Nether portal
     */

    async addLocation(
        name,
        x,
        y,
        z,
        metadata = {}
    ) {
        if (
            !name ||
            typeof name !== 'string'
        ) {
            throw new TypeError(
                'Location name must be a non-empty string.'
            );
        }

        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (!Array.isArray(data.locations)) {
            data.locations = [];
        }

        const location = {
            id: this.generateId(),
            name,
            position: {
                x,
                y,
                z
            },
            createdAt:
                new Date().toISOString(),
            ...metadata
        };

        data.locations.push(
            location
        );

        await this.writeJSON(
            this.worldFile,
            data
        );

        return location;
    }

    async getLocations() {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        return Array.isArray(
            data.locations
        )
            ? data.locations
            : [];
    }

    async findLocation(
        name
    ) {
        const locations =
            await this.getLocations();

        const query =
            String(name)
                .toLowerCase();

        return locations.filter(
            location =>
                String(location.name)
                    .toLowerCase()
                    .includes(query)
        );
    }

    async removeLocation(
        id
    ) {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (
            !Array.isArray(
                data.locations
            )
        ) {
            return false;
        }

        const before =
            data.locations.length;

        data.locations =
            data.locations.filter(
                location =>
                    location.id !== id
            );

        if (
            data.locations.length !==
            before
        ) {
            await this.writeJSON(
                this.worldFile,
                data
            );

            return true;
        }

        return false;
    }

    /*
     * ========================================================
     * PLAYERS
     * ========================================================
     */

    async addPlayer(
        name,
        metadata = {}
    ) {
        if (
            !name ||
            typeof name !== 'string'
        ) {
            throw new TypeError(
                'Player name must be a non-empty string.'
            );
        }

        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (!Array.isArray(data.players)) {
            data.players = [];
        }

        const existing =
            data.players.find(
                player =>
                    player.name === name
            );

        if (existing) {
            Object.assign(
                existing,
                metadata,
                {
                    updatedAt:
                        new Date().toISOString()
                }
            );

            await this.writeJSON(
                this.worldFile,
                data
            );

            return existing;
        }

        const player = {
            id: this.generateId(),
            name,
            createdAt:
                new Date().toISOString(),
            ...metadata
        };

        data.players.push(
            player
        );

        await this.writeJSON(
            this.worldFile,
            data
        );

        return player;
    }

    async getPlayers() {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        return Array.isArray(
            data.players
        )
            ? data.players
            : [];
    }

    /*
     * ========================================================
     * STRUCTURES
     * ========================================================
     */

    async addStructure(
        name,
        x,
        y,
        z,
        metadata = {}
    ) {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (
            !Array.isArray(
                data.structures
            )
        ) {
            data.structures = [];
        }

        const structure = {
            id: this.generateId(),
            name,
            position: {
                x,
                y,
                z
            },
            createdAt:
                new Date().toISOString(),
            ...metadata
        };

        data.structures.push(
            structure
        );

        await this.writeJSON(
            this.worldFile,
            data
        );

        return structure;
    }

    async getStructures() {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        return Array.isArray(
            data.structures
        )
            ? data.structures
            : [];
    }

    /*
     * ========================================================
     * RESOURCES
     * ========================================================
     */

    async addResource(
        name,
        amount,
        metadata = {}
    ) {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (
            !Array.isArray(
                data.resources
            )
        ) {
            data.resources = [];
        }

        const resource = {
            id: this.generateId(),
            name,
            amount,
            createdAt:
                new Date().toISOString(),
            ...metadata
        };

        data.resources.push(
            resource
        );

        await this.writeJSON(
            this.worldFile,
            data
        );

        return resource;
    }

    async getResources() {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        return Array.isArray(
            data.resources
        )
            ? data.resources
            : [];
    }

    /*
     * ========================================================
     * DANGERS
     * ========================================================
     */

    async addDanger(
        description,
        x,
        y,
        z,
        metadata = {}
    ) {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (
            !Array.isArray(
                data.dangers
            )
        ) {
            data.dangers = [];
        }

        const danger = {
            id: this.generateId(),
            description,
            position: {
                x,
                y,
                z
            },
            createdAt:
                new Date().toISOString(),
            ...metadata
        };

        data.dangers.push(
            danger
        );

        await this.writeJSON(
            this.worldFile,
            data
        );

        return danger;
    }

    async getDangers() {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        return Array.isArray(
            data.dangers
        )
            ? data.dangers
            : [];
    }

    /*
     * ========================================================
     * NOTES
     * ========================================================
     */

    async addNote(
        content,
        metadata = {}
    ) {
        if (
            !content ||
            typeof content !== 'string'
        ) {
            throw new TypeError(
                'World note must be a non-empty string.'
            );
        }

        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        if (!Array.isArray(data.notes)) {
            data.notes = [];
        }

        const note = {
            id: this.generateId(),
            content,
            createdAt:
                new Date().toISOString(),
            ...metadata
        };

        data.notes.push(note);

        await this.writeJSON(
            this.worldFile,
            data
        );

        return note;
    }

    async getNotes() {
        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        return Array.isArray(data.notes)
            ? data.notes
            : [];
    }

    /*
     * ========================================================
     * SEARCH
     * ========================================================
     */

    async search(
        query,
        limit = 10
    ) {
        if (
            !query ||
            typeof query !== 'string'
        ) {
            return [];
        }

        const data =
            await this.readJSON(
                this.worldFile,
                {}
            );

        const results = [];
        const lowerQuery =
            query.toLowerCase();

        const queryWords =
            lowerQuery
                .split(/\s+/)
                .filter(word => word.length > 2);

        const matchesQuery = value => {
            const text =
                String(value)
                    .toLowerCase();

            return (
                text.includes(lowerQuery) ||
                queryWords.some(word => text.includes(word))
            );
        };

        const searchValue = (
            value,
            category = ''
        ) => {
            if (
                results.length >= limit
            ) {
                return;
            }

            if (
                typeof value === 'string'
            ) {
                if (matchesQuery(value)) {
                    results.push({
                        category,
                        content: value
                    });
                }

                return;
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    searchValue(
                        item,
                        category
                    );
                }

                return;
            }

            if (
                value &&
                typeof value === 'object'
            ) {
                for (
                    const [
                        key,
                        child
                    ] of Object.entries(value)
                ) {
                    searchValue(
                        child,
                        category
                            ? `${category}.${key}`
                            : key
                    );
                }
            }
        };

        searchValue(data);

        return results.slice(
            0,
            limit
        );
    }

    /*
     * ========================================================
     * COMPLETE WORLD MEMORY
     * ========================================================
     */

    async exportWorld() {
        return await this.readJSON(
            this.worldFile,
            {}
        );
    }

    async importWorld(data) {
        if (
            !data ||
            typeof data !== 'object' ||
            Array.isArray(data)
        ) {
            throw new TypeError(
                'World import must be an object.'
            );
        }

        await this.writeJSON(
            this.worldFile,
            data
        );

        return true;
    }

    /*
     * ========================================================
     * CLEAR
     * ========================================================
     */

    async clear() {
        await this.writeJSON(
            this.worldFile,
            {
                world: {},
                locations: [],
                players: [],
                structures: [],
                resources: [],
                dangers: [],
                notes: []
            }
        );

        return true;
    }

    /*
     * ========================================================
     * UTILITY
     * ========================================================
     */

    generateId() {
        return (
            Date.now().toString(36) +
            '-' +
            Math.random()
                .toString(36)
                .slice(2, 10)
        );
    }
}
