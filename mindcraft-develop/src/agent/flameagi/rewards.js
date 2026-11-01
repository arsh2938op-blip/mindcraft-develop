/*
 * ============================================================
 * FlameAGI Reward Engine
 * ============================================================
 *
 * Inspired by MineRL-style intermediate rewards.
 *
 * Responsibilities:
 *   - Observe an action/outcome
 *   - Calculate reward
 *   - Explain where the reward came from
 *
 * NOT responsible for:
 *   - movement
 *   - reflection
 *   - learning
 *   - training
 *   - choosing actions
 *
 * Flow:
 *
 *   Movement / Agent
 *          ↓
 *      RewardEngine
 *          ↓
 *      Experience
 *          ↓
 *      Reflection
 *          ↓
 *       Learning
 *
 * ============================================================
 */

export default class FlameRewards {

    constructor(options = {}) {

        /*
         * ====================================================
         * REWARD VALUES
         * ====================================================
         *
         * These are intentionally moderate.
         *
         * They can be tuned later using actual experience data.
         * ====================================================
         */

        this.rewards = {

            /*
             * Resources
             */

            oak_log: 1,
            cobblestone: 4,
            coal: 6,
            copper_ore: 8,
            iron_ore: 16,
            iron_ingot: 24,
            gold_ore: 20,
            gold_ingot: 30,
            emerald: 40,
            diamond: 100,

            /*
             * Crafting
             */

            crafting_table: 4,
            sticks: 2,
            wooden_pickaxe: 6,
            stone_pickaxe: 12,
            iron_pickaxe: 30,
            diamond_pickaxe: 120,

            /*
             * Smelting
             */

            smelting: 5,

            /*
             * Combat
             */

            mob_hit: 1,
            mob_kill: 10,
            hostile_kill: 15,

            /*
             * Movement
             */

            distance_progress: 1,

            /*
             * Survival
             */

            damage_taken: -1,
            death: -50,
            fall: -5,
            lava_death: -75,

            /*
             * Behaviour
             */

            stuck: -5,
            failed_action: -1,

            /*
             * Goal
             */

            objective_complete: 100

        };


        /*
         * Allow custom reward values.
         */

        this.rewards = {

            ...this.rewards,

            ...(options.rewards ?? {})

        };


        /*
         * ====================================================
         * ONE-TIME MILESTONES
         * ====================================================
         *
         * Prevent Flame from farming the same milestone
         * repeatedly.
         *
         * Example:
         *
         * first diamond → +100
         * second diamond → normal resource reward
         *
         * ====================================================
         */

        this.achieved =
            new Set();


        /*
         * Previous distance for progress rewards.
         */

        this.previousDistance =
            null;

    }


    /*
     * ========================================================
     * RESET
     * ========================================================
     *
     * Reset when starting a new objective/session.
     * ========================================================
     */

    reset() {

        this.achieved.clear();

        this.previousDistance =
            null;

    }


    /*
     * ========================================================
     * MILESTONE
     * ========================================================
     */

    milestone(
        name,
        amount
    ) {

        if (
            this.achieved.has(name)
        ) {

            return 0;

        }

        this.achieved.add(name);

        return amount;

    }


    /*
     * ========================================================
     * RESOURCE REWARD
     * ========================================================
     *
     * previousInventory and currentInventory should be
     * simple item → quantity objects.
     *
     * Example:
     *
     * {
     *     iron_ore: 3,
     *     diamond: 1
     * }
     * ========================================================
     */

    resourceReward(
        previousInventory = {},
        currentInventory = {}
    ) {

        let reward = 0;

        const breakdown = {};


        for (
            const [item, currentAmount]
            of Object.entries(currentInventory)
        ) {

            const previousAmount =
                Number(
                    previousInventory[item] ?? 0
                );

            const gained =
                Number(currentAmount) -
                previousAmount;


            if (gained <= 0) {
                continue;
            }


            const value =
                this.rewards[item] ?? 0;


            if (value <= 0) {
                continue;
            }


            const amountReward =
                gained * value;


            reward += amountReward;

            breakdown[item] =
                amountReward;

        }


        return {
            reward,
            breakdown
        };

    }


    /*
     * ========================================================
     * CRAFTING
     * ========================================================
     */

    craftingReward(
        item,
        amount = 1
    ) {

        if (
            typeof item !== 'string' ||
            amount <= 0
        ) {

            return {
                reward: 0,
                breakdown: {}
            };

        }


        const value =
            this.rewards[item] ?? 0;


        if (value <= 0) {

            return {
                reward: 0,
                breakdown: {}
            };

        }


        const reward =
            value * amount;


        return {

            reward,

            breakdown: {
                [`craft:${item}`]:
                    reward
            }

        };

    }


    /*
     * ========================================================
     * SMELTING
     * ========================================================
     */

    smeltingReward(
        item,
        amount = 1
    ) {

        if (
            typeof item !== 'string' ||
            amount <= 0
        ) {

            return {
                reward: 0,
                breakdown: {}
            };

        }


        const reward =
            this.rewards.smelting *
            amount;


        return {

            reward,

            breakdown: {
                [`smelt:${item}`]:
                    reward
            }

        };

    }


    /*
     * ========================================================
     * MOVEMENT PROGRESS
     * ========================================================
     *
     * Give a reward when Flame gets closer to a target.
     *
     * Previous distance: 20
     * Current distance: 15
     *
     * Progress = 5
     *
     * Reward = +5
     *
     * This is inspired by MineRL's distance-progress idea.
     * ========================================================
     */

    movementProgress(
        previousDistance,
        currentDistance
    ) {

        if (
            !Number.isFinite(previousDistance) ||
            !Number.isFinite(currentDistance)
        ) {

            return {
                reward: 0,
                breakdown: {}
            };

        }


        const progress =
            previousDistance -
            currentDistance;


        this.previousDistance =
            currentDistance;


        /*
         * Getting closer = positive.
         *
         * Moving farther away = small negative.
         */

        const reward =
            progress *
            this.rewards.distance_progress;


        if (reward === 0) {

            return {
                reward: 0,
                breakdown: {}
            };

        }


        return {

            reward,

            breakdown: {

                movement:
                    Number(
                        reward.toFixed(3)
                    )

            }

        };

    }


    /*
     * ========================================================
     * COMBAT
     * ========================================================
     */

    combatReward({

        hit = false,
        killed = false,
        hostile = false

    } = {}) {

        let reward = 0;

        const breakdown = {};


        if (hit) {

            reward +=
                this.rewards.mob_hit;

            breakdown.hit =
                this.rewards.mob_hit;

        }


        if (killed) {

            const value =
                hostile
                    ? this.rewards.hostile_kill
                    : this.rewards.mob_kill;


            reward += value;

            breakdown.kill =
                value;

        }


        return {
            reward,
            breakdown
        };

    }


    /*
     * ========================================================
     * SURVIVAL
     * ========================================================
     */

    survivalReward({

        damage = 0,
        died = false,
        fall = false,
        lava = false

    } = {}) {

        let reward = 0;

        const breakdown = {};


        if (damage > 0) {

            const value =
                damage *
                this.rewards.damage_taken;


            reward += value;

            breakdown.damage =
                value;

        }


        if (fall) {

            reward +=
                this.rewards.fall;

            breakdown.fall =
                this.rewards.fall;

        }


        if (died) {

            const value =
                lava
                    ? this.rewards.lava_death
                    : this.rewards.death;


            reward += value;

            breakdown.death =
                value;

        }


        return {
            reward,
            breakdown
        };

    }


    /*
     * ========================================================
     * ACTION FAILURE
     * ========================================================
     */

    failure(
        reason = 'unknown'
    ) {

        return {

            reward:
                this.rewards.failed_action,

            breakdown: {

                [`failure:${reason}`]:
                    this.rewards.failed_action

            }

        };

    }


    /*
     * ========================================================
     * STUCK
     * ========================================================
     */

    stuck() {

        return {

            reward:
                this.rewards.stuck,

            breakdown: {

                stuck:
                    this.rewards.stuck

            }

        };

    }


    /*
     * ========================================================
     * OBJECTIVE
     * ========================================================
     */

    objectiveComplete(
        objective
    ) {

        const reward =
            this.milestone(

                `objective:${objective}`,

                this.rewards.objective_complete

            );


        return {

            reward,

            breakdown:

                reward > 0

                    ? {
                        objective:
                            reward
                    }

                    : {}

        };

    }

    /*
     * ========================================================
     * SIMPLE CALCULATE
     * ========================================================
     *
     * Compatibility layer for FlameBrain.
     *
     * FlameBrain can call:
     *
     *     rewards.calculate(...)
     *
     * while the full reward engine continues to use:
     *
     *     rewards.evaluate(...)
     *
     * ========================================================
     */

    calculate({
        success = false,
        taskCompleted = false,
        taskFailed = false,
        response = '',
        expected = null,
        conversational = false,
        ...state
    } = {}) {

        /*
         * Normal conversation does not represent a
         * Minecraft task, so don't punish it.
         */
        if (conversational) {

            return {
                reward: 0.1,

                breakdown: {
                    conversation: 0.1
                },

                reason: 'Normal conversation.',

                success: true
            };

        }


        /*
         * Successful task.
         */
        if (success || taskCompleted) {

            const result =
                this.evaluate({

                    ...state,

                    objectiveComplete: true,

                    objective:
                        state.objective ?? 'task'

                });

            /*
             * If evaluate produced no reward because
             * there was no actual Minecraft state change,
             * still give the successful task a small reward.
             */
            if (result.reward === 0) {

                return {

                    reward:
                        this.rewards.objective_complete,

                    breakdown: {
                        objective:
                            this.rewards.objective_complete
                    },

                    reason:
                        'Task completed successfully.',

                    success: true

                };

            }

            return {

                ...result,

                reason:
                    'Task completed successfully.',

                success: true

            };

        }


        /*
         * Failed task.
         */
        if (taskFailed) {

            const result =
                this.evaluate({

                    ...state,

                    failed: true,

                    failureReason:
                        state.failureReason ??
                        'task_failed'

                });

            return {

                ...result,

                reason:
                    'Task failed.',

                success: false

            };

        }


        /*
         * If we have an actual Minecraft state/action,
         * use the full reward engine.
         */
        if (
            Object.keys(state).length > 0
        ) {

            const result =
                this.evaluate(state);

            return {

                ...result,

                reason:
                    result.reward > 0
                        ? 'Positive experience.'
                        : result.reward < 0
                            ? 'Negative experience.'
                            : 'No measurable reward.'

            };

        }


        /*
         * Optional expected-response check.
         */
        if (
            expected &&
            typeof response === 'string' &&
            response
                .toLowerCase()
                .includes(
                    String(expected).toLowerCase()
                )
        ) {

            return {

                reward: 0.5,

                breakdown: {
                    expected_response: 0.5
                },

                reason:
                    'Response matched expected result.',

                success: true

            };

        }


        /*
         * Nothing measurable happened.
         */
        return {

            reward: 0,

            breakdown: {},

            reason:
                'No measurable outcome.',

            success: false

        };

    }
    calculate({
    request = '',
    response = '',
    modelResponse = '',
    context = {},
    ...state
} = {}) {

    /*
     * ========================================================
     * CONVERSATIONAL EXPERIENCE
     * ========================================================
     *
     * Normal chatting is not a Minecraft achievement.
     * Give it a tiny positive reward so learning can record
     * the interaction without pretending a task was completed.
     */

    if (context?.conversational === true) {

        return {
            reward: 0.1,
            breakdown: {
                conversation: 0.1
            },
            reason: 'Normal conversation.',
            outcome: 'conversation',
            success: true
        };
    }


    /*
     * ========================================================
     * EXPECTED RESPONSE
     * ========================================================
     */

    if (
        state.expected &&
        typeof response === 'string' &&
        response
            .toLowerCase()
            .includes(
                String(state.expected).toLowerCase()
            )
    ) {

        return {
            reward: 0.5,
            breakdown: {
                expected_response: 0.5
            },
            reason: 'Response matched expected result.',
            outcome: 'success',
            success: true
        };
    }


    /*
     * ========================================================
     * EXPLICIT TASK COMPLETION
     * ========================================================
     */

    if (state.taskCompleted === true) {

        const result =
            this.evaluate({
                ...state,
                objectiveComplete: true,
                objective:
                    state.objective ??
                    request ??
                    'task'
            });

        /*
         * If evaluate() produced no reward because the
         * objective was already achieved, still return the
         * standard completion reward.
         */

        if (result.reward === 0) {

            return {
                reward:
                    this.rewards.objective_complete,

                breakdown: {
                    objective:
                        this.rewards.objective_complete
                },

                reason:
                    'Task completed successfully.',

                outcome: 'success',

                success: true
            };
        }

        return {
            ...result,

            reason:
                'Task completed successfully.',

            outcome: 'success',

            success: true
        };
    }


    /*
     * ========================================================
     * EXPLICIT TASK FAILURE
     * ========================================================
     */

    if (state.taskFailed === true) {

        const result =
            this.evaluate({

                ...state,

                failed: true,

                failureReason:
                    state.failureReason ??
                    'task_failed'

            });

        return {
            ...result,

            reason:
                'Task failed.',

            outcome: 'failure',

            success: false
        };
    }


    /*
     * ========================================================
     * ENVIRONMENT / MINECRAFT REWARD
     * ========================================================
     *
     * If actual Minecraft state was supplied, use the
     * original MineRL-style evaluate() engine.
     */

    const rewardStateKeys = [

        'previousState',
        'currentState',

        'previousInventory',
        'currentInventory',

        'previousDistance',
        'currentDistance',

        'action',
        'objective',

        'objectiveComplete',

        'crafting',
        'smelting',

        'combat',
        'survival',

        'failed',
        'failureReason',

        'isStuck'

    ];

    const hasRewardState =
        rewardStateKeys.some(
            key =>
                Object.prototype.hasOwnProperty.call(
                    state,
                    key
                )
        );


    if (hasRewardState) {

        const result =
            this.evaluate(state);

        return {
            ...result,

            reason:
                result.reward > 0
                    ? 'Positive experience.'
                    : result.reward < 0
                        ? 'Negative experience.'
                        : 'No measurable reward.',

            outcome:
                result.reward > 0
                    ? 'success'
                    : result.reward < 0
                        ? 'failure'
                        : 'neutral'
        };
    }


    /*
     * ========================================================
     * DEFAULT
     * ========================================================
     */

    return {

        reward: 0,

        breakdown: {},

        reason:
            'No measurable environmental outcome.',

        outcome: 'unknown',

        success: false
    };
}
    /*
     * ========================================================
     * EVALUATE
     * ========================================================
     *
     * Main entry point.
     *
     * This lets Movement or another action system provide
     * everything that happened during one step.
     *
     * ========================================================
     */

    evaluate({

        previousState = {},
        currentState = {},

        previousInventory = {},
        currentInventory = {},

        previousDistance = null,
        currentDistance = null,

        action = null,

        objective = null,

        objectiveComplete = false,

        crafting = null,
        smelting = null,

        combat = null,
        survival = null,

        failed = false,
        failureReason = null,

        isStuck = false

    } = {}) {

        let totalReward = 0;

        const breakdown = {};


        /*
         * ====================================================
         * RESOURCE
         * ====================================================
         */

        const resources =
            this.resourceReward(

                previousInventory,
                currentInventory

            );


        totalReward +=
            resources.reward;


        Object.assign(
            breakdown,
            resources.breakdown
        );


        /*
         * ====================================================
         * MOVEMENT
         * ====================================================
         */

        const movement =
            this.movementProgress(

                previousDistance,
                currentDistance

            );


        totalReward +=
            movement.reward;


        Object.assign(
            breakdown,
            movement.breakdown
        );


        /*
         * ====================================================
         * CRAFTING
         * ====================================================
         */

        if (crafting) {

            const result =
                this.craftingReward(

                    crafting.item,
                    crafting.amount ?? 1

                );


            totalReward +=
                result.reward;


            Object.assign(
                breakdown,
                result.breakdown
            );

        }


        /*
         * ====================================================
         * SMELTING
         * ====================================================
         */

        if (smelting) {

            const result =
                this.smeltingReward(

                    smelting.item,
                    smelting.amount ?? 1

                );


            totalReward +=
                result.reward;


            Object.assign(
                breakdown,
                result.breakdown
            );

        }


        /*
         * ====================================================
         * COMBAT
         * ====================================================
         */

        if (combat) {

            const result =
                this.combatReward(
                    combat
                );


            totalReward +=
                result.reward;


            Object.assign(
                breakdown,
                result.breakdown
            );

        }


        /*
         * ====================================================
         * SURVIVAL
         * ====================================================
         */

        if (survival) {

            const result =
                this.survivalReward(
                    survival
                );


            totalReward +=
                result.reward;


            Object.assign(
                breakdown,
                result.breakdown
            );

        }


        /*
         * ====================================================
         * FAILURE
         * ====================================================
         */

        if (failed) {

            const result =
                this.failure(
                    failureReason ??
                    action ??
                    'unknown'
                );


            totalReward +=
                result.reward;


            Object.assign(
                breakdown,
                result.breakdown
            );

        }


        /*
         * ====================================================
         * STUCK
         * ====================================================
         */

        if (isStuck) {

            const result =
                this.stuck();


            totalReward +=
                result.reward;


            Object.assign(
                breakdown,
                result.breakdown
            );

        }


        /*
         * ====================================================
         * OBJECTIVE COMPLETE
         * ====================================================
         */

        if (
            objectiveComplete &&
            objective
        ) {

            const result =
                this.objectiveComplete(
                    objective
                );


            totalReward +=
                result.reward;


            Object.assign(
                breakdown,
                result.breakdown
            );

        }


        /*
         * ====================================================
         * FINAL RESULT
         * ====================================================
         */

        return {

            reward:
                Number(
                    totalReward.toFixed(3)
                ),

            breakdown,

            action,

            previousState,

            currentState,

            objective,

            success:
                totalReward > 0

        };

    }

}