// src/agent/flameagi/reflection.js

/*
 * ============================================================
 * FlameAGI Reflection
 * ============================================================
 *
 * Examines experiences after they happen.
 *
 * Reflection answers questions such as:
 *
 * - What happened?
 * - What was requested?
 * - What did Flame do?
 * - Was there an obvious problem?
 * - What could be improved?
 *
 * This class does NOT:
 *
 * - call Ollama
 * - control MindCraft
 * - modify permanent memory
 * - train the model
 *
 * Learning is handled by learning.js.
 * ============================================================
 */

export default class FlameReflection {

    constructor(options = {}) {

        /*
         * Maximum number of reflections kept in memory.
         */

        this.maxEntries =
            options.maxEntries ?? 500;

        if (
            !Number.isInteger(this.maxEntries) ||
            this.maxEntries <= 0
        ) {
            throw new TypeError(
                'FlameReflection: maxEntries must be a positive integer.'
            );
        }

        /*
         * Reflection storage.
         */

        this._reflections = [];
    }


    /*
     * ========================================================
     * REFLECT
     * ========================================================
     *
     * Called by FlameBrain after an experience occurs.
     */

    async reflect(experience = {}) {

        if (
            !experience ||
            typeof experience !== 'object' ||
            Array.isArray(experience)
        ) {
            throw new TypeError(
                'FlameReflection: experience must be an object.'
            );
        }

        const request =
            typeof experience.request === 'string'
                ? experience.request
                : '';

        const response =
            typeof experience.response === 'string'
                ? experience.response
                : '';

        /*
         * Basic automatic analysis.
         *
         * This intentionally does not pretend to be
         * intelligent reasoning yet.
         *
         * The actual model-assisted reflection layer
         * can be added later.
         */

        const reflection = {

            id:
                this.generateId(),

            timestamp:
                new Date().toISOString(),

            experienceId:
                experience.id ?? null,

            request,

            response,

            outcome:
                this.detectOutcome(
                    experience
                ),

            problems:
                this.detectProblems(
                    experience
                ),

            observations:
                this.buildObservations(
                    experience
                ),

            improvement:
                this.suggestImprovement(
                    experience
                )
        };

        this._reflections.push(
            reflection
        );

        /*
         * Prevent unlimited memory usage.
         */

        if (
            this._reflections.length >
            this.maxEntries
        ) {

            this._reflections.splice(
                0,
                this._reflections.length -
                    this.maxEntries
            );
        }

        return reflection;
    }
    /*
     * ========================================================
     * APPLY REFLECTION TO EXPERIENCE
     * ========================================================
     *
     * Copies the useful reflection results back into the
     * original experience so Learning.js can export one
     * complete training experience.
     */

    applyToExperience(
        experience,
        reflection
    ) {

        if (
            !experience ||
            typeof experience !== 'object' ||
            Array.isArray(experience)
        ) {
            throw new TypeError(
                'FlameReflection: experience must be an object.'
            );
        }

        if (
            !reflection ||
            typeof reflection !== 'object' ||
            Array.isArray(reflection)
        ) {
            throw new TypeError(
                'FlameReflection: reflection must be an object.'
            );
        }

        experience.outcome =
            reflection.outcome ??
            experience.outcome ??
            'unknown';

        experience.reflection =
            reflection.improvement ??
            null;

        /*
         * Keep detailed reflection information in metadata.
         */

        experience.metadata = {
            ...(experience.metadata ?? {}),

            reflectionId:
                reflection.id ?? null,

            problems:
                reflection.problems ?? [],

            observations:
                reflection.observations ?? []
        };

        return experience;
    }

    /*
     * ========================================================
     * OUTCOME DETECTION
     * ========================================================
     */

    detectOutcome(experience) {

        const response =
            String(
                experience.response ?? ''
            ).toLowerCase();

        /*
         * Empty response.
         */

        if (!response.trim()) {
            return 'unknown';
        }

        /*
         * Obvious failure indicators.
         */

        const failureWords = [
            'error',
            'failed',
            'failure',
            'cannot',
            "can't",
            'unable',
            'stuck',
            'could not',
            "couldn't",
            'timed out',
            'timeout'
        ];

        if (
            failureWords.some(
                word =>
                    response.includes(word)
            )
        ) {
            return 'failure';
        }

        /*
         * Obvious success indicators.
         */

        const successWords = [
            'done',
            'completed',
            'success',
            'successful',
            'finished',
            'got it',
            'found it'
        ];

        if (
            successWords.some(
                word =>
                    response.includes(word)
            )
        ) {
            return 'success';
        }

        return 'unknown';
    }


    /*
     * ========================================================
     * PROBLEM DETECTION
     * ========================================================
     */

    detectProblems(experience) {

        const problems = [];

        const request =
            String(
                experience.request ?? ''
            ).toLowerCase();

        const response =
            String(
                experience.response ?? ''
            ).toLowerCase();

        /*
         * Empty model response.
         */

        if (!response.trim()) {

            problems.push(
                'No response was produced.'
            );
        }

        /*
         * Common execution failures.
         */

        const failureIndicators = [
            'error',
            'failed',
            'stuck',
            'unable',
            'cannot',
            "can't",
            'timeout',
            'timed out'
        ];

        for (
            const indicator
            of failureIndicators
        ) {

            if (
                response.includes(
                    indicator
                )
            ) {

                problems.push(
                    `Response contains failure indicator: "${indicator}".`
                );

                break;
            }
        }

        /*
         * Request was ignored.
         */

        if (
            request &&
            response &&
            response.length < 10
        ) {

            problems.push(
                'Response may not have adequately addressed the request.'
            );
        }

        return problems;
    }


    /*
     * ========================================================
     * OBSERVATIONS
     * ========================================================
     */

    buildObservations(experience) {

        const observations = [];

        if (
            experience.context &&
            typeof experience.context ===
                'object'
        ) {

            observations.push(
                'Context was available during the interaction.'
            );
        }

        if (
            experience.memory
        ) {

            observations.push(
                'Memory context was available during the interaction.'
            );
        }

        if (
            experience.permanentMemory
        ) {

            observations.push(
                'Permanent memory was modified during the interaction.'
            );
        }

        if (
            typeof experience.request ===
                'string' &&
            experience.request.trim()
        ) {

            observations.push(
                'A user request was received.'
            );
        }

        if (
            typeof experience.response ===
                'string' &&
            experience.response.trim()
        ) {

            observations.push(
                'A model response was produced.'
            );
        }

        return observations;
    }


    /*
     * ========================================================
     * IMPROVEMENT SUGGESTION
     * ========================================================
     */

    suggestImprovement(experience) {

        const outcome =
            this.detectOutcome(
                experience
            );

        if (
            outcome === 'failure'
        ) {

            return (
                'Review the failed interaction and determine whether a different approach or action would have produced a better result.'
            );
        }

        if (
            outcome === 'success'
        ) {

            return (
                'The successful interaction may contain a useful pattern that can be reused in similar situations.'
            );
        }

        return (
            'More information is needed before determining whether the approach should be changed.'
        );
    }


    /*
     * ========================================================
     * RECENT REFLECTIONS
     * ========================================================
     */

    recent(limit = 10) {

        if (
            !Number.isInteger(limit) ||
            limit <= 0
        ) {
            return [];
        }

        return this._reflections
            .slice(-limit)
            .map(
                reflection => ({
                    ...reflection
                })
            );
    }


    /*
     * ========================================================
     * ALL REFLECTIONS
     * ========================================================
     */

    all() {

        return this._reflections
            .map(
                reflection => ({
                    ...reflection
                })
            );
    }


    /*
     * ========================================================
     * GET REFLECTION
     * ========================================================
     */

    get(id) {

        if (
            typeof id !== 'string' ||
            !id.trim()
        ) {
            return null;
        }

        return (
            this._reflections.find(
                reflection =>
                    reflection.id === id
            ) ?? null
        );
    }


    /*
     * ========================================================
     * SEARCH
     * ========================================================
     */

    search(query, limit = 10) {

        if (
            typeof query !== 'string' ||
            !query.trim()
        ) {
            return [];
        }

        const search =
            query.toLowerCase();

        return this._reflections
            .filter(reflection => {

                const request =
                    String(
                        reflection.request ?? ''
                    ).toLowerCase();

                const improvement =
                    String(
                        reflection.improvement ?? ''
                    ).toLowerCase();

                const problems =
                    reflection.problems
                        .join(' ')
                        .toLowerCase();

                return (
                    request.includes(search) ||
                    improvement.includes(search) ||
                    problems.includes(search)
                );
            })
            .slice(-limit)
            .map(
                reflection => ({
                    ...reflection
                })
            );
    }


    /*
     * ========================================================
     * CLEAR
     * ========================================================
     */

    clear() {

        this._reflections = [];

        return true;
    }


    /*
     * ========================================================
     * COUNT
     * ========================================================
     */

    count() {

        return this._reflections.length;
    }


    /*
     * ========================================================
     * EXPORT
     * ========================================================
     */

    export() {

        return this._reflections
            .map(
                reflection => ({
                    ...reflection
                })
            );
    }


    /*
     * ========================================================
     * IMPORT
     * ========================================================
     */

    import(reflections) {

        if (
            !Array.isArray(reflections)
        ) {
            throw new TypeError(
                'FlameReflection: reflections must be an array.'
            );
        }

        this._reflections =
            reflections
                .filter(
                    reflection =>
                        reflection &&
                        typeof reflection ===
                            'object' &&
                        !Array.isArray(
                            reflection
                        )
                )
                .slice(
                    -this.maxEntries
                )
                .map(
                    reflection => ({
                        ...reflection
                    })
                );

        return this._reflections;
    }


    /*
     * ========================================================
     * ID GENERATOR
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