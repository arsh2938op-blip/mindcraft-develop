// src/utils/apiKeyManager.js

const managers = {};

function init(provider) {
    if (managers[provider]) return;

    const raw = process.env[provider];

    if (!raw) {
        throw new Error(`Missing environment variable: ${provider}`);
    }

    const keys = raw
        .split(",")
        .map(key => key.trim())
        .filter(Boolean);

    if (keys.length === 0) {
        throw new Error(`No API keys found for ${provider}`);
    }

    managers[provider] = {
        keys,
        currentIndex: 0
    };
}

export function getKey(provider) {
    init(provider);
    return managers[provider].keys[
        managers[provider].currentIndex
    ];
}

export function rotateKey(provider) {
    init(provider);

    const manager = managers[provider];

    if (manager.currentIndex >= manager.keys.length - 1) {
        console.error(
            `[${provider}] All API keys exhausted.`
        );
        return false;
    }

    manager.currentIndex++;

    console.log(
        `[${provider}] Switched to key ${
            manager.currentIndex + 1
        }/${manager.keys.length}`
    );

    return true;
}

export function resetKey(provider) {
    init(provider);
    managers[provider].currentIndex = 0;
}

export function getCurrentKey(provider) {
    init(provider);

   const manager = managers[provider];

return {
    current: manager.currentIndex + 1,
    total: manager.keys.length
};
}