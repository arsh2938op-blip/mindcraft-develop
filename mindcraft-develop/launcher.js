import fs from "fs";
import path from "path"
import dotenv from "dotenv"

dotenv.config()

const KEYS_FILE = "./keys.json"
const KEYS_EXAMPLE = "./keys.example.json"
const GENERATED_DIR = "./generated"

/*
    AUTO CREATE KEYS
*/

if (
    !fs.existsSync(KEYS_FILE) &&
    fs.existsSync(KEYS_EXAMPLE)
) {

    fs.copyFileSync(
        KEYS_EXAMPLE,
        KEYS_FILE
    )

    console.log(
        "\n[LAUNCHER] Created keys.json from keys.example.json"
    )

    console.log(
        "[LAUNCHER] Fill in your API keys and restart.\n"
    )

    process.exit(0)
}

/*
    GENERATED FOLDER
*/

if (
    !fs.existsSync(
        GENERATED_DIR
    )
) {

    fs.mkdirSync(
        GENERATED_DIR
    )
}

/*
    CONFIG
*/

let models = [];

const input =
    process.env.MODELS?.trim();

const presetName =
    process.env.MODEL_PRESET?.trim();

const config =
    JSON.parse(
        fs.readFileSync(
            "./models.json",
            "utf8"
        )
    );

/*
    MODEL SELECTION

    Priority:
    1. MODELS       -> manual/custom models
    2. MODEL_PRESET -> named preset
    3. default      -> models.json default preset
*/

if (input) {

    console.log(
        "[LAUNCHER] Using manual models."
    );

    models =
        input
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);

}
else {

    const selectedPreset =
        presetName || "default";

    if (
        config.presets[
            selectedPreset
        ]
    ) {

        console.log(
            `[LAUNCHER] Using preset "${selectedPreset}"`
        );

        models =
            config.presets[
                selectedPreset
            ];

    }
    else {

        console.log(
            `[LAUNCHER] Preset "${selectedPreset}" not found.`
        );

        console.log(
            "[LAUNCHER] Falling back to preset: default"
        );

        models =
            config.presets.default || [];
    }
}

const botCount =
    parseInt(
        process.env.BOT_COUNT || "1"
    );

const customNames =
    process.env.BOT_NAMES
        ?.split(",")
        .map(x => x.trim())
        .filter(Boolean)
    || [];

if (!models.length) {

    console.log(
        "[LAUNCHER] No models available."
    );

    process.exit(1);
}

/*
    CLEAN OLD GENERATED FILES
*/

for (
    const file of
    fs.readdirSync(
        GENERATED_DIR
    )
) {

    if (
        file.endsWith(".json")
    ) {

        fs.unlinkSync(

            path.join(
                GENERATED_DIR,
                file
            )
        )
    }
}
/*
    HELPERS
*/

function getProvider(model) {

    const split = model.split("/")

    return (
        split[0] ||
        "BOT"
    ).toUpperCase()
}
/*
    GENERATE PROFILES
*/

const generatedProfiles = []

const providerCount = {}

for (
    let i = 0;
    i < botCount;
    i++
) {

    const model =
        models[
            i % models.length
        ]

    const provider =
        getProvider(
            model
        )

    providerCount[
        provider
    ] =
        (
            providerCount[
                provider
            ] || 0
        ) + 1

    const autoName =

        `${provider}_${providerCount[provider]}`

    const botName =

        customNames[i]
            ? customNames[i]
            : autoName

    const profile = {

        name:
            botName,

        model:
            model,

        embedding:
            "gemini"
    }

    const profilePath =

        path.join(

            GENERATED_DIR,

            `${botName}.json`
        )

    fs.writeFileSync(

        profilePath,

        JSON.stringify(
            profile,
            null,
            4
        )
    )

    generatedProfiles.push(

        `./generated/${botName}.json`
    )

    console.log(

        `[BOT] ${botName}`,

        "=>",

        model
    )
}

/*
    PASS PROFILES
*/

process.env.PROFILES =
    generatedProfiles.join(";")

console.log(
    "\nGenerated Profiles:"
)

console.log(
    generatedProfiles
)

console.log(
    "\nStarting Mindcraft...\n"
)

/*
    START MINDCRAFT
*/

await import(
    "./main.js"
)