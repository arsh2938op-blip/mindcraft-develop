import fs from "fs";

const managers = {};
function init(name) {
    if (managers[name]) return;

    const data = JSON.parse(
        fs.readFileSync("./keys.json", "utf8")
    );

    let raw = data[name];

    if (!raw) {
        throw new Error(`Missing API key: ${name}`);
    }

    let keys;

    if (Array.isArray(raw)) {
        keys = raw;
    } else {
        keys = [raw];
    }

    keys = keys
        .map(k => String(k).trim())
        .filter(Boolean);

    if (keys.length === 0) {
        throw new Error(`No API keys found for ${name}`);
    }

    managers[name] = {
        keys,
        index: 0
    };
}

export function getKey(name) {
    init(name);
    return managers[name].keys[
        managers[name].index
    ];
}

export function rotateKey(name) {
    init(name);

    const manager = managers[name];

    if (manager.keys.length <= 1) {
        console.warn(
            `[${name}] Only one API key configured.`
        );
        return false;
    }

    if (manager.index >= manager.keys.length - 1) {
        console.error(
            `[${name}] All API keys exhausted.`
        );
        return false;
    }

    manager.index++;

    console.log(
        `[${name}] Switched to key ${manager.index + 1}/${manager.keys.length}`
    );

    return true;
}

export function resetKeys(name) {
    init(name);
    managers[name].index = 0;
}

export function currentKey(name) {
    init(name);
    return {
        index: managers[name].index,
        total: managers[name].keys.length
    };
}

export function hasKey(name) {
    try {
        return !!getKey(name);
    } catch {
        return false;
    }
}