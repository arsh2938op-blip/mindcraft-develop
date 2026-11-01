import * as Mindcraft from './src/mindcraft/mindcraft.js'
import settings from './settings.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { readFileSync } from 'fs'

function parseArguments() {

    return yargs(

        hideBin(
            process.argv
        )

    )

        .option(
            'profiles',
            {
                type: 'array',
                describe:
                    'List of agent profile paths'
            }
        )

        .option(
            'task_path',
            {
                type: 'string',
                describe:
                    'Path to task file to execute'
            }
        )

        .option(
            'task_id',
            {
                type: 'string',
                describe:
                    'Task ID to execute'
            }
        )

        .help()

        .alias(
            'help',
            'h'
        )

        .parse()
}

const args =
    parseArguments()

if (
    args.profiles
) {

    settings.profiles =
        args.profiles
}

if (
    args.task_path
) {

    const tasks =
        JSON.parse(

            readFileSync(

                args.task_path,

                'utf8'
            )
        )

    if (
        args.task_id
    ) {

        settings.task =
            tasks[
                args.task_id
            ]

        settings.task.task_id =
            args.task_id

    } else {

        throw new Error(

            'task_id is required when task_path is provided'
        )
    }
}

/*
    ENV OVERRIDES

    Runtime settings are already loaded from process.env
    by settings.js.

    Only values that are not part of settings.js,
    or explicit command-line / advanced overrides,
    are handled here.
*/

// Allow SETTINGS_JSON to override settings explicitly.
if (process.env.SETTINGS_JSON) {

    try {

        Object.assign(
            settings,
            JSON.parse(
                process.env.SETTINGS_JSON
            )
        )

    } catch (err) {

        console.error(
            "Failed to parse SETTINGS_JSON:",
            err
        )
    }
}

/*
    START SERVER
*/

console.log(
    "\n=== MINDCRAFT STARTING ==="
)

console.log(
    "Host:",
    settings.host
)

console.log(
    "Port:",
    settings.port
)

console.log(
    "Profiles:",
    settings.profiles.length
)

Mindcraft.init(

    false,

    settings.mindserver_port,

    settings.auto_open_ui
)

/*
    BOT SPAWN DELAY
*/

const spawnDelay =

    parseInt(

        process.env.SPAWN_DELAY ||

        "0"
    )

for (

    let i = 0;

    i < settings.profiles.length;

    i++

) {

    const profilePath =

        settings.profiles[i]

    const profileJson =

        JSON.parse(

            readFileSync(

                profilePath,

                'utf8'
            )
        )

    settings.profile =
        profileJson

    console.log(

        `[SPAWN ${i + 1}/${settings.profiles.length}]`,

        profileJson.name,

        "=>",

        profileJson.model
    )

    Mindcraft.createAgent(
        settings
    )

    if (

        spawnDelay > 0 &&

        i <
        settings.profiles.length - 1

    ) {

        console.log(

            `Waiting ${spawnDelay}s before next bot...`
        )

        await new Promise(

            resolve =>

                setTimeout(

                    resolve,

                    spawnDelay * 1000
                )
        )
    }
}

console.log(
    "\nAll bots launched.\n"
)