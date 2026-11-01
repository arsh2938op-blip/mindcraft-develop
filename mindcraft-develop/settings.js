/*
    ENV HELPERS

    All runtime-configurable options below are read from process.env
    first, falling back to the exact same defaults this file used to
    hardcode. This lets everything be changed from run.bat (via `set`)
    without ever touching this file.
*/

function envBool(name, fallback) {
    return process.env[name]
        ? process.env[name] === "true"
        : fallback
}

function envInt(name, fallback) {
    return parseInt(
        process.env[name] ||
        String(fallback)
    )
}

function envString(name, fallback) {
    return process.env[name] || fallback
}

// Splits a delimited env var (default delimiter ";") into a trimmed,
// non-empty array. Falls back to `fallback` when the env var is unset
// or empty, so e.g. ONLY_CHAT_WITH= (blank) still means "no restriction".
function envList(name, fallback, delimiter = ";") {
    return process.env[name]
        ? process.env[name]
            .split(delimiter)
            .map(x => x.trim())
            .filter(Boolean)
        : fallback
}

const settings = {
    "minecraft_version":
        envString("MC_VERSION", "auto"), // or specific version like "1.21.6"

    "host":
        envString("SERVER_IP", "127.0.0.1"),

    "port":
        envInt("SERVER_PORT", 55916),

    "auth":
        envString("AUTH", "offline"), // or "microsoft"

    // the mindserver manages all agents and hosts the UI

    "mindserver_port":
        envInt("MINDSERVER_PORT", 8080),

    "auto_open_ui":
        envBool("AUTO_OPEN_UI", true),

    "base_profile":
        envString("BASE_PROFILE", "assistant"), // survival, assistant, creative, or god_mode

    "profiles": envList(
        "PROFILES",
        [
            "./andy.json",
            // "./profiles/gpt.json",
            // "./profiles/claude.json",
            // "./profiles/gemini.json",
            // "./profiles/llama.json",
            // "./profiles/qwen.json",
            // "./profiles/grok.json",
            // "./profiles/mistral.json",
            // "./profiles/deepseek.json",
            // "./profiles/mercury.json",
            // "./profiles/andy-4.json",

            // using more than 1 profile requires you to /msg each bot individually
            // individual profiles override values from the base profile
        ]
    ),

    "load_memory":
        envBool("LOAD_MEMORY", false),

    "init_message":
        envString("INIT_MESSAGE", "Respond with hello world and your name"),

    "only_chat_with":
        envList("ONLY_CHAT_WITH", []),

    "speak":
        envBool("SPEAK", false),

    // allows all bots to speak through text-to-speech.

    "chat_ingame":
        envBool("CHAT_INGAME", true),

    "language":
        envString("LANGUAGE", "en"),

    "render_bot_view":
        envBool("VIEWER", false),

    "allow_insecure_coding":
        envBool("ALLOW_INSECURE_CODING", false),

    "allow_vision":
        envBool("ALLOW_VISION", false),

    "blocked_actions": envList(
        "BLOCKED_ACTIONS",
        [
            "!checkBlueprint",
            "!checkBlueprintLevel",
            "!getBlueprint",
            "!getBlueprintLevel"
        ]
    ),

    "code_timeout_mins":
        envInt("CODE_TIMEOUT_MINS", -1),

    "relevant_docs_count":
        envInt("RELEVANT_DOCS_COUNT", 5),

    "max_messages":
        envInt("MAX_MESSAGES", 15),

    "num_examples":
        envInt("NUM_EXAMPLES", 2),

    "max_commands":
        envInt("MAX_COMMANDS", -1),

    "show_command_syntax":
        envString("SHOW_COMMAND_SYNTAX", "full"),

    "narrate_behavior":
        envBool("NARRATE_BEHAVIOR", true),

    "chat_bot_messages":
        envBool("CHAT_BOT_MESSAGES", true),

    "spawn_timeout":
        envInt("SPAWN_TIMEOUT", 30),

    "block_place_delay":
        envInt("BLOCK_PLACE_DELAY", 0),

    "log_all_prompts":
        envBool("LOG_ALL_PROMPTS", false)
}

export default settings