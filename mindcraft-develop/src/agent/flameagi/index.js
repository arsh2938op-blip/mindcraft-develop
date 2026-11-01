// src/models/flameagi/index.js

import FlameBrain from './brain.js';

/** MindCraft-compatible FlameAGI model provider. */
export class FlameAGI {
    static prefix = 'flameagi';

    constructor(model_name, url, params = {}) {
        this.model_name = model_name ?? 'foundation';
        this.url = url ?? null;
        this.params = params ?? {};
        this.brain = new FlameBrain(this.params);
    }

    async sendRequest(turns, systemMessage) {
        const result = await this.brain.process({
            turns,
            systemMessage: systemMessage ?? '',
            context: { model: this.model_name, url: this.url },
        });
        return result.response;
    }

    async embed() {
        throw new Error('FlameAGI embeddings are not implemented.');
    }
}

export default FlameAGI;
