import fs from 'fs/promises';
import path from 'path';

export default class FlameSkin {

    constructor(options = {}) {

        this.enabled =
            options.enabled ?? true;

        this.model =
            options.model ?? 'classic';

        this.url =
            options.url ?? null;

        /*
         * Permanent Flame skin configuration.
         *
         * .bots/FLAMEAGI_1/skin.json
         */

        this.skinFile =
            options.skinFile ??
            path.resolve(
                '.bots',
                'FLAMEAGI_1',
                'skin.json'
            );

        this.initialized = false;
    }


    /*
     * ========================================================
     * LOAD
     * ========================================================
     *
     * Loads Flame's permanent skin configuration.
     */

    async load() {

        if (this.initialized) {
            return this;
        }

        try {

            const raw =
                await fs.readFile(
                    this.skinFile,
                    'utf8'
                );

            const data =
                JSON.parse(raw);

            if (
                data &&
                typeof data === 'object'
            ) {

                this.enabled =
                    data.enabled ??
                    this.enabled;

                this.model =
                    data.model ??
                    'classic';

                this.url =
                    data.url ??
                    null;
            }

        } catch (error) {

            /*
             * First startup:
             * skin.json does not exist yet.
             */

            if (error.code !== 'ENOENT') {

                console.error(
                    '[FlameSkin] Failed to load skin:',
                    error.message
                );
            }
        }

        this.initialized = true;

        return this;
    }


    /*
     * ========================================================
     * SAVE
     * ========================================================
     */

    async save() {

        await fs.mkdir(
            path.dirname(this.skinFile),
            {
                recursive: true
            }
        );

        const data = {

            enabled:
                this.enabled,

            model:
                this.model,

            url:
                this.url
        };

        const tempFile =
            `${this.skinFile}.tmp`;

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
            this.skinFile
        );

        return true;
    }


    /*
     * ========================================================
     * APPLY
     * ========================================================
     */

    async apply(bot) {

        await this.load();

        if (
            !this.enabled ||
            !bot ||
            !this.url
        ) {
            return false;
        }

        try {

            bot.chat(
                `/skin set URL ${this.model} ${this.url}`
            );

            console.log(
                `[FlameSkin] Applied skin: ${this.url}`
            );

            return true;

        } catch (error) {

            console.error(
                '[FlameSkin] Failed:',
                error
            );

            return false;
        }
    }


    /*
     * ========================================================
     * CLEAR
     * ========================================================
     */

    async clear(bot) {

        if (!bot) {
            return false;
        }

        try {

            bot.chat('/skin clear');

            return true;

        } catch {

            return false;
        }
    }


    /*
     * ========================================================
     * SET
     * ========================================================
     */

    async set(
        url,
        model = 'classic'
    ) {

        if (
            typeof url !== 'string' ||
            !url.trim()
        ) {
            return false;
        }

        this.url =
            url.trim();

        this.model =
            model;

        this.enabled =
            true;

        await this.save();

        return true;
    }


    /*
     * ========================================================
     * GET
     * ========================================================
     */

    get() {

        return {

            enabled:
                this.enabled,

            model:
                this.model,

            url:
                this.url
        };
    }
}