// src/agent/flameagi/learning.js

/*
 * ============================================================
 * FlameAGI Learning
 * ============================================================
 *
 * MineRL-inspired learning layer.
 *
 * Core transition:
 *
 *      STATE
 *        ↓
 *      ACTION
 *        ↓
 *      REWARD
 *        ↓
 *      NEXT STATE
 *        ↓
 *      DONE
 *        ↓
 *      LEARNING
 *
 * Flame architecture:
 *
 *      Minecraft
 *          ↓
 *      rewards.js
 *          ↓
 *      experiences.js
 *          ↓
 *      reflection.js
 *          ↓
 *      learning.js
 *          ↓
 *      training dataset
 *          ↓
 *      future trainer / RL system
 *
 * This class does NOT:
 *
 * - call Ollama
 * - control Mineflayer
 * - directly modify model weights
 * - perform gradient descent
 * - replace the RL trainer
 *
 * It converts experiences into structured lessons and
 * learning records.
 * ============================================================
 */

export default class FlameLearning {

    constructor(options = {}) {

        /*
         * ====================================================
         * CONFIDENCE
         * ====================================================
         */

        this.minConfidence =
            options.minConfidence ?? 0.5;


        if (
            typeof this.minConfidence !== 'number' ||
            this.minConfidence < 0 ||
            this.minConfidence > 1
        ) {

            throw new TypeError(
                'FlameLearning: minConfidence must be between 0 and 1.'
            );
        }


        /*
         * ====================================================
         * STORAGE
         * ====================================================
         */

        this.maxEntries =
            options.maxEntries ?? 500;


        if (
            !Number.isInteger(this.maxEntries) ||
            this.maxEntries <= 0
        ) {

            throw new TypeError(
                'FlameLearning: maxEntries must be a positive integer.'
            );
        }


        this._lessons = [];


        /*
         * ====================================================
         * STATISTICS
         * ====================================================
         *
         * These are useful for eventually determining whether
         * Flame is actually improving.
         * ====================================================
         */

        this.stats = {

            transitions: 0,

            successful: 0,

            failed: 0,

            partial: 0,

            unknown: 0,

            totalReward: 0,

            averageReward: 0
        };
    }


    /*
     * ========================================================
     * LEARN
     * ========================================================
     *
     * Receives a complete experience.
     *
     * The experience may contain:
     *
     * state
     * action
     * reward
     * nextState
     * done
     * outcome
     * reflection
     * request
     * response
     *
     * ========================================================
     */

    async learn(result = {}) {

        if (
            !result ||
            typeof result !== 'object' ||
            Array.isArray(result)
        ) {

            throw new TypeError(
                'FlameLearning: result must be an object.'
            );
        }


        /*
         * ====================================================
         * UPDATE STATISTICS
         * ====================================================
         */

        this.updateStats(
            result
        );


        /*
         * ====================================================
         * CREATE LEARNING RECORD
         * ====================================================
         */

        const lesson =
            this.createLesson(
                result
            );


        /*
         * No useful lesson.
         */

        if (!lesson) {

            return null;
        }


        /*
         * ====================================================
         * STORE
         * ====================================================
         */

        this._lessons.push(
            lesson
        );


        /*
         * ====================================================
         * MEMORY LIMIT
         * ====================================================
         */

        if (
            this._lessons.length >
            this.maxEntries
        ) {

            this._lessons.splice(
                0,
                this._lessons.length -
                    this.maxEntries
            );
        }


        /*
         * ====================================================
         * PERMANENT MEMORY
         * ====================================================
         *
         * Only strong lessons should become permanent knowledge.
         * ====================================================
         */

        const memory =
            result.memoryManager ??
            null;


        if (
            memory &&
            typeof memory.rememberTraining ===
                'function' &&
            lesson.confidence >=
                this.minConfidence
        ) {

            try {

                await memory.rememberTraining(

                    lesson.category,

                    lesson.content,

                    'FlameLearning'
                );

            } catch (error) {

                console.error(
                    '[FlameLearning] Training memory error:',
                    error.message
                );
            }
        }


        return lesson;
    }


    /*
     * ========================================================
     * CREATE LESSON
     * ========================================================
     *
     * Creates a structured learning record from an RL-style
     * transition.
     * ========================================================
     */

    createLesson(result) {

        const state =
            result.state ??
            null;


        const action =
            result.action ??
            null;


        const nextState =
            result.nextState ??
            null;


        const reward =
            typeof result.reward === 'number'
                ? result.reward
                : 0;


        const done =
            result.done === true;


        const reflection =
            result.reflection ??
            null;


        /*
         * ====================================================
         * OUTCOME
         * ====================================================
         */

        const outcome =
            this.getOutcome(
                result,
                reward
            );


        /*
         * ====================================================
         * ACTION CHECK
         * ====================================================
         *
         * A proper RL lesson needs an action.
         *
         * Conversational experiences can still create lessons
         * through the fallback path below.
         * ====================================================
         */

        const hasAction =
            action !== null &&
            action !== undefined;


        /*
         * ====================================================
         * RL EXPERIENCE
         * ====================================================
         */

        if (
            hasAction
        ) {

            return this.createRLLesson({

                result,

                state,

                action,

                reward,

                nextState,

                done,

                outcome,

                reflection
            });
        }


        /*
         * ====================================================
         * CONVERSATIONAL FALLBACK
         * ====================================================
         *
         * Keeps Flame's existing personality/conversation
         * learning working even when no Minecraft action exists.
         * ====================================================
         */

        return this.createConversationLesson(
            result
        );
    }


    /*
     * ========================================================
     * CREATE RL LESSON
     * ========================================================
     */

    createRLLesson({

        result,

        state,

        action,

        reward,

        nextState,

        done,

        outcome,

        reflection

    }) {

        const category =
            this.detectCategoryFromAction(
                action,
                result.request
            );


        /*
         * ====================================================
         * CONFIDENCE
         * ====================================================
         *
         * Confidence is NOT the RL value.
         *
         * It simply indicates how strongly we should preserve
         * this experience as a reusable lesson.
         * ====================================================
         */

        const confidence =
            this.calculateConfidence({

                reward,

                outcome,

                done,

                reflection
            });


        /*
         * ====================================================
         * LESSON CONTENT
         * ====================================================
         */

        let content;


        if (
            outcome === 'success'
        ) {

            content =
                this.buildSuccessLesson({

                    action,

                    reward,

                    reflection,

                    result
                });

        } else if (
            outcome === 'failure'
        ) {

            content =
                this.buildFailureLesson({

                    action,

                    reward,

                    reflection,

                    result
                });

        } else if (
            outcome === 'partial' ||
            outcome === 'progress'
        ) {

            content =
                this.buildProgressLesson({

                    action,

                    reward,

                    reflection,

                    result
                });

        } else {

            content =
                this.buildNeutralLesson({

                    action,

                    reward,

                    result
                });
        }


        /*
         * ====================================================
         * LEARNING RECORD
         * ====================================================
         */

        return {

            id:
                this.generateId(),

            type:
                'rl_lesson',

            category,

            /*
             * RL transition
             */

            state,

            action,

            reward,

            nextState,

            done,

            outcome,


            /*
             * Human-readable lesson
             */

            content,

            confidence,


            /*
             * Reflection
             */

            reflectionId:
                reflection?.id ??
                null,


            /*
             * Original experience
             */

            experienceId:
                result.id ??
                null,


            /*
             * Metadata
             */

            metadata:
                result.metadata ??
                {},


            createdAt:
                new Date().toISOString()
        };
    }


    /*
     * ========================================================
     * SUCCESS LESSON
     * ========================================================
     */

    buildSuccessLesson({

        action,

        reward,

        reflection,

        result

    }) {

        const actionText =
            this.describeAction(
                action
            );


        const improvement =
            reflection?.improvement
                ? ` Improvement: ${reflection.improvement}`
                : '';


        return (

            `Successful action: ${actionText}. ` +

            `Reward: ${reward}. ` +

            `This transition produced a positive outcome.` +

            improvement +

            (
                result.request
                    ? ` Original request: "${result.request}".`
                    : ''
            )
        );
    }


    /*
     * ========================================================
     * FAILURE LESSON
     * ========================================================
     */

    buildFailureLesson({

        action,

        reward,

        reflection,

        result

    }) {

        const actionText =
            this.describeAction(
                action
            );


        const problems =
            Array.isArray(
                reflection?.problems
            )
                ? reflection.problems.join(' ')
                : 'The action produced a negative outcome.';


        return (

            `Failed action: ${actionText}. ` +

            `Reward: ${reward}. ` +

            `Problems: ${problems} ` +

            `The strategy should be changed before repeating this action.` +

            (
                result.request
                    ? ` Original request: "${result.request}".`
                    : ''
            )
        );
    }


    /*
     * ========================================================
     * PROGRESS LESSON
     * ========================================================
     */

    buildProgressLesson({

        action,

        reward,

        reflection,

        result

    }) {

        const actionText =
            this.describeAction(
                action
            );


        const improvement =
            reflection?.improvement
                ? ` ${reflection.improvement}`
                : '';


        return (

            `Partial progress from action: ${actionText}. ` +

            `Reward: ${reward}. ` +

            `The action was useful but the task was not fully completed.` +

            improvement +

            (
                result.request
                    ? ` Request: "${result.request}".`
                    : ''
            )
        );
    }


    /*
     * ========================================================
     * NEUTRAL LESSON
     * ========================================================
     */

    buildNeutralLesson({

        action,

        reward,

        result

    }) {

        return (

            `Neutral transition from action: ` +

            `${this.describeAction(action)}. ` +

            `Reward: ${reward}. ` +

            `Insufficient evidence to classify the strategy as ` +

            `successful or unsuccessful.` +

            (
                result.request
                    ? ` Request: "${result.request}".`
                    : ''
            )
        );
    }


    /*
     * ========================================================
     * CONVERSATION LESSON
     * ========================================================
     *
     * Backward-compatible with the old Flame system.
     * ========================================================
     */

    createConversationLesson(
        result
    ) {

        const request =
            String(
                result.request ??
                ''
            ).trim();


        const response =
            String(
                result.response ??
                ''
            ).trim();


        const reflection =
            result.reflection ??
            null;


        if (
            !request &&
            !response
        ) {

            return null;
        }


        const outcome =
            reflection?.outcome ??
            this.detectOutcome(
                result
            );


        if (
            outcome === 'unknown'
        ) {

            return null;
        }


        const category =
            this.detectCategory(
                request
            );


        let content;


        if (
            outcome === 'success'
        ) {

            content =

                `Successful conversational approach for ` +

                `"${request}". ` +

                `Response: ${response}.` +

                (
                    reflection?.improvement
                        ? ` Improvement: ${reflection.improvement}`
                        : ''
                );

        } else {

            const problems =
                Array.isArray(
                    reflection?.problems
                )
                    ? reflection.problems.join(' ')
                    : 'Unknown problem.';


            content =

                `The conversational approach for ` +

                `"${request}" failed. ` +

                `Problems: ${problems} ` +

                `Improve the response strategy before repeating it.`;
        }


        return {

            id:
                this.generateId(),

            type:
                'lesson',

            category,

            content,

            confidence:
                outcome === 'success'
                    ? 0.7
                    : 0.6,

            outcome,

            reflectionId:
                reflection?.id ??
                null,

            experienceId:
                result.id ??
                null,

            createdAt:
                new Date().toISOString()
        };
    }


    /*
     * ========================================================
     * OUTCOME
     * ========================================================
     */

    getOutcome(
        result,
        reward
    ) {

        if (
            typeof result.outcome ===
                'string' &&
            result.outcome !==
                'unknown'
        ) {

            return result.outcome.toLowerCase();
        }


        if (
            result.reflection?.outcome
        ) {

            return String(
                result.reflection.outcome
            ).toLowerCase();
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
     * CONFIDENCE
     * ========================================================
     *
     * Again:
     *
     * confidence != reward
     *
     * Confidence determines whether the lesson is strong
     * enough to preserve as permanent knowledge.
     * ========================================================
     */

    calculateConfidence({

        reward,

        outcome,

        done,

        reflection

    }) {

        let confidence =
            0.5;


        /*
         * Strong positive result.
         */

        if (
            outcome === 'success'
        ) {

            confidence += 0.2;
        }


        /*
         * Strong negative result.
         */

        if (
            outcome === 'failure'
        ) {

            confidence += 0.1;
        }


        /*
         * Larger reward magnitude gives stronger evidence.
         */

        const rewardStrength =
            Math.min(
                Math.abs(reward) / 10,
                1
            );


        confidence +=
            rewardStrength * 0.2;


        /*
         * Reflection gives additional evidence.
         */

        if (
            reflection
        ) {

            confidence += 0.1;
        }


        /*
         * Clamp.
         */

        return Math.max(
            0,
            Math.min(
                1,
                confidence
            )
        );
    }


    /*
     * ========================================================
     * ACTION DESCRIPTION
     * ========================================================
     */

    describeAction(
        action
    ) {

        if (
            action === null ||
            action === undefined
        ) {

            return 'unknown action';
        }


        if (
            typeof action ===
                'string'
        ) {

            return action;
        }


        if (
            typeof action ===
                'object'
        ) {

            if (
                action.type &&
                action.target
            ) {

                return (
                    `${action.type} ${action.target}`
                );
            }


            if (
                action.type
            ) {

                return String(
                    action.type
                );
            }


            try {

                return JSON.stringify(
                    action
                );

            } catch {

                return 'complex action';
            }
        }


        return String(
            action
        );
    }


    /*
     * ========================================================
     * CATEGORY FROM ACTION
     * ========================================================
     */

    detectCategoryFromAction(
        action,
        request = ''
    ) {

        const actionText =
            this.describeAction(
                action
            );


        const combined =
            `${actionText} ${request}`;


        return this.detectCategory(
            combined
        );
    }


    /*
     * ========================================================
     * CATEGORY
     * ========================================================
     */

    detectCategory(
        request
    ) {

        if (
            /pvp|fight|attack|sword|combat|warden|mob/i
                .test(request)
        ) {

            return 'minecraft.pvp';
        }


        if (
            /mine|mining|ore|diamond|iron|coal|copper|emerald/i
                .test(request)
        ) {

            return 'minecraft.mining';
        }


        if (
            /build|building|tower|bridge/i
                .test(request)
        ) {

            return 'minecraft.building';
        }


        if (
            /craft|crafting|recipe|furnace|smelt/i
                .test(request)
        ) {

            return 'minecraft.crafting';
        }


        if (
            /movement|move|strafe|walk|run|jump|pathfind/i
                .test(request)
        ) {

            return 'minecraft.movement';
        }


        if (
            /inventory|item|armor|shield|totem/i
                .test(request)
        ) {

            return 'minecraft.inventory';
        }


        if (
            /minecraft|mine|craft|block|item|mob|server/i
                .test(request)
        ) {

            return 'minecraft.general';
        }


        return 'general';
    }


    /*
     * ========================================================
     * OLD OUTCOME DETECTION
     * ========================================================
     *
     * Used only for conversational fallback.
     * RL experiences should preferably receive an explicit
     * outcome from rewards.js.
     * ========================================================
     */

    detectOutcome(
        result
    ) {

        const response =
            String(
                result.response ??
                ''
            ).toLowerCase();


        if (
            !response.trim()
        ) {

            return 'unknown';
        }


        const failureWords = [

            'error',
            'failed',
            'failure',
            'unable',
            'cannot',
            "can't",
            'stuck',
            'timeout',
            'timed out',
            'died',
            'death'

        ];


        if (
            failureWords.some(
                word =>
                    response.includes(
                        word
                    )
            )
        ) {

            return 'failure';
        }


        const successWords = [

            'done',
            'completed',
            'success',
            'successful',
            'finished',
            'found it',
            'got it'

        ];


        if (
            successWords.some(
                word =>
                    response.includes(
                        word
                    )
            )
        ) {

            return 'success';
        }


        return 'unknown';
    }


    /*
     * ========================================================
     * UPDATE STATISTICS
     * ========================================================
     */

    updateStats(
        result
    ) {

        const reward =
            typeof result.reward ===
                'number'
                ? result.reward
                : 0;


        const outcome =
            this.getOutcome(
                result,
                reward
            );


        this.stats.transitions++;


        this.stats.totalReward +=
            reward;


        this.stats.averageReward =
            this.stats.totalReward /
            this.stats.transitions;


        if (
            outcome === 'success'
        ) {

            this.stats.successful++;

        } else if (
            outcome === 'failure'
        ) {

            this.stats.failed++;

        } else if (
            outcome === 'partial' ||
            outcome === 'progress'
        ) {

            this.stats.partial++;

        } else {

            this.stats.unknown++;
        }
    }


    /*
     * ========================================================
     * STATISTICS
     * ========================================================
     */

    getStats() {

        return {

            ...this.stats
        };
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


        return this._lessons
            .slice(-limit)
            .map(
                lesson => ({
                    ...lesson
                })
            );
    }


    /*
     * ========================================================
     * ALL
     * ========================================================
     */

    all() {

        return this._lessons
            .map(
                lesson => ({
                    ...lesson
                })
            );
    }


    /*
     * ========================================================
     * SEARCH
     * ========================================================
     */

    search(
        query,
        limit = 10
    ) {

        if (
            typeof query !==
                'string' ||
            !query.trim()
        ) {

            return [];
        }


        const search =
            query.toLowerCase();


        return this._lessons

            .filter(
                lesson => {

                    const content =
                        String(
                            lesson.content ??
                            ''
                        ).toLowerCase();


                    const category =
                        String(
                            lesson.category ??
                            ''
                        ).toLowerCase();


                    const action =
                        JSON.stringify(
                            lesson.action ??
                            {}
                        ).toLowerCase();


                    return (

                        content.includes(
                            search
                        ) ||

                        category.includes(
                            search
                        ) ||

                        action.includes(
                            search
                        )
                    );
                }
            )

            .slice(-limit)

            .map(
                lesson => ({
                    ...lesson
                })
            );
    }


    /*
     * ========================================================
     * SUCCESSFUL LESSONS
     * ========================================================
     */

    successful(
        limit = 50
    ) {

        return this._lessons

            .filter(
                lesson =>
                    lesson.outcome ===
                    'success'
            )

            .slice(-limit)

            .map(
                lesson => ({
                    ...lesson
                })
            );
    }


    /*
     * ========================================================
     * FAILED LESSONS
     * ========================================================
     */

    failures(
        limit = 50
    ) {

        return this._lessons

            .filter(
                lesson =>
                    lesson.outcome ===
                    'failure'
            )

            .slice(-limit)

            .map(
                lesson => ({
                    ...lesson
                })
            );
    }


    /*
     * ========================================================
     * HIGH REWARD LESSONS
     * ========================================================
     */

    highReward(
        minimumReward = 1,
        limit = 50
    ) {

        return this._lessons

            .filter(
                lesson =>
                    typeof lesson.reward ===
                        'number' &&
                    lesson.reward >=
                        minimumReward
            )

            .slice(-limit)

            .map(
                lesson => ({
                    ...lesson
                })
            );
    }


    /*
     * ========================================================
     * CLEAR
     * ========================================================
     */

    clear() {

        this._lessons = [];

        return true;
    }


    /*
     * ========================================================
     * COUNT
     * ========================================================
     */

    count() {

        return this._lessons.length;
    }


    /*
     * ========================================================
     * EXPORT
     * ========================================================
     */

    export() {

        return this._lessons
            .map(
                lesson => ({
                    ...lesson
                })
            );
    }


    /*
     * ========================================================
     * EXPORT RL TRAINING DATA
     * ========================================================
     *
     * This is the clean transition dataset.
     *
     * It intentionally contains no generated prose.
     *
     * Future RL/training systems can consume:
     *
     *     state
     *     action
     *     reward
     *     nextState
     *     done
     * ========================================================
     */

    exportRL() {

        return this._lessons

            .filter(
                lesson =>
                    lesson.type ===
                    'rl_lesson'
            )

            .map(
                lesson => ({

                    state:
                        lesson.state,

                    action:
                        lesson.action,

                    reward:
                        lesson.reward,

                    nextState:
                        lesson.nextState,

                    done:
                        lesson.done,

                    outcome:
                        lesson.outcome
                })
            );
    }


    /*
     * ========================================================
     * EXPORT TRAINING DATA
     * ========================================================
     *
     * Combined Flame learning format.
     *
     * Useful for future:
     *
     * - fine-tuning
     * - preference training
     * - RL experiments
     * - policy training
     * ========================================================
     */

    exportTraining() {

        return this._lessons
            .map(
                lesson => ({
                    id:
                        lesson.id,

                    type:
                        lesson.type,

                    category:
                        lesson.category,

                    state:
                        lesson.state ??
                        null,

                    action:
                        lesson.action ??
                        null,

                    reward:
                        lesson.reward ??
                        0,

                    nextState:
                        lesson.nextState ??
                        null,

                    done:
                        lesson.done ??
                        false,

                    outcome:
                        lesson.outcome ??
                        'unknown',

                    confidence:
                        lesson.confidence ??
                        0,

                    content:
                        lesson.content ??
                        '',

                    reflectionId:
                        lesson.reflectionId ??
                        null,

                    experienceId:
                        lesson.experienceId ??
                        null,

                    metadata:
                        lesson.metadata ??
                        {},

                    createdAt:
                        lesson.createdAt
                })
            );
    }


    /*
     * ========================================================
     * IMPORT
     * ========================================================
     */

    import(
        lessons
    ) {

        if (
            !Array.isArray(
                lessons
            )
        ) {

            throw new TypeError(
                'FlameLearning: lessons must be an array.'
            );
        }


        this._lessons =
            lessons

                .filter(
                    lesson =>
                        lesson &&
                        typeof lesson ===
                            'object' &&
                        !Array.isArray(
                            lesson
                        )
                )

                .slice(
                    -this.maxEntries
                )

                .map(
                    lesson => ({
                        ...lesson
                    })
                );


        return this._lessons;
    }


    /*
     * ========================================================
     * GENERATE ID
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