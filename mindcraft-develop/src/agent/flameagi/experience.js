// src/agent/flameagi/experiences.js

/*
 * ============================================================
 * FlameAGI Experiences
 * ============================================================
 *
 * MineRL-inspired experience / transition system.
 *
 * Core RL transition:
 *
 *     STATE
 *       ↓
 *     ACTION
 *       ↓
 *     REWARD
 *       ↓
 *     NEXT STATE
 *       ↓
 *     DONE
 *
 * Flame flow:
 *
 *     FlameBrain
 *          ↓
 *     Minecraft state
 *          ↓
 *     action
 *          ↓
 *     rewards.js
 *          ↓
 *     reward
 *          ↓
 *     FlameExperience
 *          ↓
 *     Reflection
 *          ↓
 *     Learning
 *
 * This class:
 *
 * - stores experiences
 * - creates RL-style transitions
 * - connects to rewards.js
 * - keeps conversational information
 * - exports training data
 *
 * This class does NOT:
 *
 * - call the LLM
 * - control Mineflayer
 * - make decisions
 * - perform reflection
 * - train the model
 * - modify permanent memory
 *
 * ============================================================
 */

import MinecraftRewardCalculator from './rewards.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPERIENCES_PATH = path.join(__dirname, 'train', 'data', 'experiences.jsonl');


export default class FlameExperience {

    constructor(options = {}) {

        /*
         * ====================================================
         * STORAGE
         * ====================================================
         */

        this.maxEntries =
            options.maxEntries ?? 500;


        if (
            !Number.isInteger(
                this.maxEntries
            ) ||
            this.maxEntries <= 0
        ) {

            throw new TypeError(
                'FlameExperience: maxEntries must be a positive integer.'
            );
        }


        /*
         * ====================================================
         * EXPERIENCE STORAGE
         * ====================================================
         *
         * Stored in RAM for now.
         *
         * Later this can be persisted/exported
         * for the training pipeline.
         * ====================================================
         */

        this._experiences = [];


        /*
         * ====================================================
         * REWARD CALCULATOR
         * ====================================================
         *
         * rewards.js owns reward calculation.
         *
         * experiences.js only asks it:
         *
         *     "What reward belongs to this transition?"
         * ====================================================
         */

        this.rewardCalculator =
            options.rewardCalculator ??
            new MinecraftRewardCalculator(
                options.rewardOptions ?? {}
            );
    }


    /*
     * ========================================================
     * ADD EXPERIENCE
     * ========================================================
     *
     * Accepts both:
     *
     * 1. Normal Flame conversational experience
     *
     * 2. MineRL-style Minecraft transition
     *
     * Example:
     *
     * {
     *     state,
     *     action,
     *     nextState,
     *     context,
     *     request,
     *     response
     * }
     *
     * Reward is calculated automatically when possible.
     * ========================================================
     */

    async add(result = {}) {

        if (
            !result ||
            typeof result !== 'object' ||
            Array.isArray(result)
        ) {

            throw new TypeError(
                'FlameExperience: experience must be an object.'
            );
        }


        /*
         * ====================================================
         * STATE
         * ====================================================
         *
         * Current Minecraft/environment state.
         * ====================================================
         */

        const state =
            result.state ??
            null;


        /*
         * ====================================================
         * ACTION
         * ====================================================
         *
         * Action selected by Flame.
         *
         * Example:
         *
         * {
         *     type: 'mine',
         *     target: 'iron_ore'
         * }
         * ====================================================
         */

        const action =
            result.action ??
            null;


        /*
         * ====================================================
         * NEXT STATE
         * ====================================================
         */

        const nextState =
            result.nextState ??
            null;


        /*
         * ====================================================
         * REWARD
         * ====================================================
         *
         * If a reward was explicitly supplied, preserve it.
         *
         * Otherwise ask rewards.js to calculate it.
         * ====================================================
         */

        let reward =
            result.reward;


        let rewardResult =
            result.rewardResult ??
            null;


        if (
            typeof reward !== 'number' &&
            this.rewardCalculator
        ) {

            try {

                rewardResult =
                    await this.calculateReward({

                        ...result,

                        state,
                        action,
                        nextState
                    });


                if (
                    rewardResult &&
                    typeof rewardResult.reward ===
                        'number'
                ) {

                    reward =
                        rewardResult.reward;
                }

            } catch (error) {

                console.error(
                    '[FlameExperience] Reward calculation failed:',
                    error.message
                );

                reward =
                    0;
            }
        }


        /*
         * ====================================================
         * DEFAULT REWARD
         * ====================================================
         */

        if (
            typeof reward !== 'number' ||
            Number.isNaN(reward)
        ) {

            reward = 0;
        }


        /*
         * ====================================================
         * REWARD BREAKDOWN
         * ====================================================
         *
         * Useful for understanding WHY Flame received
         * a particular reward.
         * ====================================================
         */

        const rewardBreakdown =
            result.rewardBreakdown ??
            rewardResult?.metadata ??
            {};


        /*
         * ====================================================
         * OUTCOME
         * ====================================================
         */

        const outcome =
            result.outcome ??
            rewardResult?.outcome ??
            this.inferOutcome(
                result,
                reward
            );


        /*
         * ====================================================
         * DONE
         * ====================================================
         *
         * In RL this indicates the end of an episode/task.
         *
         * Examples:
         *
         * - death
         * - task completed
         * - server disconnect
         * - explicit episode termination
         * ====================================================
         */

        const done =
            typeof result.done === 'boolean'
                ? result.done
                : this.inferDone(
                    result
                );


        /*
         * ====================================================
         * BUILD EXPERIENCE
         * ====================================================
         */

        const experience = {

            /*
             * Identity
             */

            id:
                this.generateId(),

            timestamp:
                new Date().toISOString(),


            /*
             * =================================================
             * RL TRANSITION
             * =================================================
             */

            state,

            action,

            toolResult:
                result.toolResult ??
                null,

            reward,

            rewardBreakdown,

            nextState,

            done,


            /*
             * =================================================
             * RL / TASK INFORMATION
             * =================================================
             */

            outcome,


            /*
             * Reward explanation
             */

            rewardReason:
                rewardResult?.reason ??
                result.rewardReason ??
                '',


            /*
             * =================================================
             * CONVERSATIONAL EXPERIENCE
             * =================================================
             *
             * Kept because Flame is still an LLM-driven agent.
             * =================================================
             */

            request:
                result.request ?? '',

            response:
                result.response ?? '',

            modelResponse:
                result.modelResponse ?? '',


            /*
             * =================================================
             * RUNTIME CONTEXT
             * =================================================
             */

            context:
                result.context ?? {},


            /*
             * =================================================
             * REFLECTION
             * =================================================
             *
             * Reflection is normally added later.
             * =================================================
             */

            reflection:
                result.reflection ?? null,


            /*
             * =================================================
             * MEMORY
             * =================================================
             */

            memory:
                result.memory ?? null,

            permanentMemory:
                result.permanentMemory ?? null,


            /*
             * =================================================
             * ADDITIONAL METADATA
             * =================================================
             */

            metadata:
                result.metadata ?? {}
        };


        /*
         * ====================================================
         * STORE
         * ====================================================
         */

        this._experiences.push(
            experience
        );


        /*
         * ====================================================
         * RAM LIMIT
         * ====================================================
         */

        if (
            this._experiences.length >
            this.maxEntries
        ) {

            this._experiences.splice(
                0,
                this._experiences.length -
                    this.maxEntries
            );
        }

        // Training is offline. Persistence must never delay or break the bot.
        void this._persist(experience);


        return experience;
    }

    async _persist(entry) {
        try {
            await fs.mkdir(path.dirname(EXPERIENCES_PATH), { recursive: true });
            await fs.appendFile(EXPERIENCES_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
        } catch (error) {
            console.warn('[FlameAGI] Failed to persist experience:', error.message);
        }
    }


    /*
     * ========================================================
     * CALCULATE REWARD
     * ========================================================
     *
     * This is the bridge to rewards.js.
     *
     * experiences.js does NOT implement Minecraft reward
     * rules itself.
     * ========================================================
     */

    async calculateReward(
        experience
    ) {

        if (
            !this.rewardCalculator ||
            typeof this.rewardCalculator.calculate !==
                'function'
        ) {

            return {
                reward: 0,
                reason:
                    'No reward calculator available.',
                outcome:
                    'unknown',
                metadata: {}
            };
        }


        return await this.rewardCalculator.calculate(
            experience
        );
    }


    /*
     * ========================================================
     * INFER OUTCOME
     * ========================================================
     *
     * Used when rewards.js did not explicitly provide one.
     * ========================================================
     */

    inferOutcome(
        result,
        reward
    ) {

        if (
            result.context?.died === true
        ) {

            return 'failure';
        }


        if (
            result.context?.task_completed ===
                true
        ) {

            return 'success';
        }


        if (
            result.context?.stuck === true
        ) {

            return 'failure';
        }


        if (
            reward > 0
        ) {

            return 'progress';
        }


        if (
            reward < 0
        ) {

            return 'failure';
        }


        return 'unknown';
    }


    /*
     * ========================================================
     * INFER DONE
     * ========================================================
     *
     * Determines whether this transition ended an episode.
     * ========================================================
     */

    inferDone(
        result
    ) {

        const context =
            result.context ?? {};


        if (
            context.died === true
        ) {

            return true;
        }


        if (
            context.task_completed === true
        ) {

            return true;
        }


        if (
            context.episode_done === true
        ) {

            return true;
        }


        if (
            context.disconnected === true
        ) {

            return true;
        }


        return false;
    }


    /*
     * ========================================================
     * RECENT
     * ========================================================
     */

    recent(
        limit = 10
    ) {

        if (
            !Number.isInteger(limit) ||
            limit <= 0
        ) {

            return [];
        }


        return this._experiences
            .slice(-limit)
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * ALL
     * ========================================================
     */

    all() {

        return this._experiences
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * GET
     * ========================================================
     */

    get(
        id
    ) {

        if (
            typeof id !== 'string' ||
            !id.trim()
        ) {

            return null;
        }


        return (
            this._experiences.find(
                experience =>
                    experience.id === id
            ) ??
            null
        );
    }


    /*
     * ========================================================
     * SEARCH
     * ========================================================
     *
     * Searches conversational and RL information.
     * ========================================================
     */

    search(
        query,
        limit = 10
    ) {

        if (
            typeof query !== 'string' ||
            !query.trim()
        ) {

            return [];
        }


        const search =
            query.toLowerCase();


        return this._experiences
            .filter(
                experience => {

                    const request =
                        String(
                            experience.request ??
                            ''
                        ).toLowerCase();


                    const response =
                        String(
                            experience.response ??
                            ''
                        ).toLowerCase();


                    const reflection =
                        String(
                            experience.reflection ??
                            ''
                        ).toLowerCase();


                    const outcome =
                        String(
                            experience.outcome ??
                            ''
                        ).toLowerCase();


                    const action =
                        JSON.stringify(
                            experience.action ??
                            {}
                        ).toLowerCase();


                    const rewardReason =
                        String(
                            experience.rewardReason ??
                            ''
                        ).toLowerCase();


                    return (

                        request.includes(
                            search
                        ) ||

                        response.includes(
                            search
                        ) ||

                        reflection.includes(
                            search
                        ) ||

                        outcome.includes(
                            search
                        ) ||

                        action.includes(
                            search
                        ) ||

                        rewardReason.includes(
                            search
                        )
                    );
                }
            )
            .slice(-limit)
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * GET EXPERIENCES BY OUTCOME
     * ========================================================
     */

    byOutcome(
        outcome,
        limit = 50
    ) {

        if (
            typeof outcome !== 'string'
        ) {

            return [];
        }


        return this._experiences
            .filter(
                experience =>
                    experience.outcome ===
                    outcome
            )
            .slice(-limit)
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * GET EXPERIENCES BY REWARD
     * ========================================================
     */

    rewarded(
        minimumReward = 0,
        limit = 50
    ) {

        if (
            typeof minimumReward !==
                'number'
        ) {

            minimumReward = 0;
        }


        return this._experiences
            .filter(
                experience =>
                    experience.reward >=
                    minimumReward
            )
            .slice(-limit)
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * GET FAILED EXPERIENCES
     * ========================================================
     */

    failures(
        limit = 50
    ) {

        return this.byOutcome(
            'failure',
            limit
        );
    }


    /*
     * ========================================================
     * REMOVE
     * ========================================================
     */

    remove(
        id
    ) {

        const index =
            this._experiences.findIndex(
                experience =>
                    experience.id ===
                    id
            );


        if (
            index === -1
        ) {

            return false;
        }


        this._experiences.splice(
            index,
            1
        );


        return true;
    }


    /*
     * ========================================================
     * CLEAR
     * ========================================================
     */

    clear() {

        this._experiences = [];

        return true;
    }


    /*
     * ========================================================
     * COUNT
     * ========================================================
     */

    count() {

        return this._experiences.length;
    }


    /*
     * ========================================================
     * TOTAL REWARD
     * ========================================================
     *
     * Useful for seeing Flame's cumulative reward.
     * ========================================================
     */

    totalReward() {

        return this._experiences.reduce(
            (
                total,
                experience
            ) =>
                total +
                (
                    typeof experience.reward ===
                        'number'
                        ? experience.reward
                        : 0
                ),
            0
        );
    }


    /*
     * ========================================================
     * AVERAGE REWARD
     * ========================================================
     */

    averageReward() {

        if (
            this._experiences.length ===
                0
        ) {

            return 0;
        }


        return (
            this.totalReward() /
            this._experiences.length
        );
    }


    /*
     * ========================================================
     * EXPORT
     * ========================================================
     *
     * Complete experience objects.
     * ========================================================
     */

    export() {

        return this._experiences
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * IMPORT
     * ========================================================
     */

    import(
        experiences
    ) {

        if (
            !Array.isArray(
                experiences
            )
        ) {

            throw new TypeError(
                'FlameExperience: experiences must be an array.'
            );
        }


        this._experiences =
            experiences

                .filter(
                    experience =>
                        experience &&
                        typeof experience ===
                            'object' &&
                        !Array.isArray(
                            experience
                        )
                )

                .slice(
                    -this.maxEntries
                )

                .map(
                    experience => ({
                        ...experience
                    })
                );


        return this._experiences;
    }


    /*
     * ========================================================
     * EXPORT RL TRAINING DATA
     * ========================================================
     *
     * MineRL-inspired transition format:
     *
     *     state
     *     action
     *     reward
     *     next_state
     *     done
     *
     * This is the clean dataset representation for a future
     * RL/training system.
     * ========================================================
     */

    exportRL() {

        return this._experiences.map(
            experience => ({

                id:
                    experience.id,

                timestamp:
                    experience.timestamp,

                state:
                    experience.state,

                action:
                    experience.action,

                reward:
                    experience.reward,

                reward_breakdown:
                    experience.rewardBreakdown,

                next_state:
                    experience.nextState,

                done:
                    experience.done,

                outcome:
                    experience.outcome,

                metadata:
                    experience.metadata
            })
        );
    }


    /*
     * ========================================================
     * EXPORT TRAINING EXPERIENCES
     * ========================================================
     *
     * Combined Flame + RL training representation.
     *
     * Useful later for:
     *
     *     datasets.js
     *     trainer.js
     *     fine-tuning
     *     RL experiments
     * ========================================================
     */

    exportTraining() {

        return this._experiences.map(
            experience => ({

                /*
                 * RL transition
                 */

                state:
                    experience.state,

                action:
                    experience.action,

                reward:
                    experience.reward,

                rewardBreakdown:
                    experience.rewardBreakdown,

                nextState:
                    experience.nextState,

                done:
                    experience.done,


                /*
                 * Flame conversational learning
                 */

                request:
                    experience.request ??
                    '',

                response:
                    experience.response ??
                    experience.modelResponse ??
                    '',

                outcome:
                    experience.outcome ??
                    'unknown',

                reflection:
                    experience.reflection ??
                    null,


                /*
                 * Runtime information
                 */

                context:
                    experience.context ??
                    {},

                metadata:
                    experience.metadata ??
                    {},

                timestamp:
                    experience.timestamp,

                id:
                    experience.id
            })
        );
    }


    /*
     * ========================================================
     * EXPORT SUCCESSFUL EXPERIENCES
     * ========================================================
     */

    exportSuccessful() {

        return this._experiences
            .filter(
                experience =>
                    experience.outcome ===
                    'success'
            )
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * EXPORT FAILED EXPERIENCES
     * ========================================================
     */

    exportFailed() {

        return this._experiences
            .filter(
                experience =>
                    experience.outcome ===
                    'failure'
            )
            .map(
                experience => ({
                    ...experience
                })
            );
    }


    /*
     * ========================================================
     * ID GENERATOR
     * ========================================================
     */

    generateId() {

        return (

            Date.now()
                .toString(36)

            +

            '-'

            +

            Math.random()
                .toString(36)
                .slice(
                    2,
                    10
                )
        );
    }
}
