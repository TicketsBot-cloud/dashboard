export function normalizeIcon(icon) {
    if (!icon || icon === "" || icon.startsWith('a_')) {
        return icon;
    }
    return icon.padStart(32, '0');
}

export function isAnimated(icon) {
    if (icon === undefined || icon === "") {
        return false;
    } else {
        return icon.startsWith('a_')
    }
}

export function getIconUrl(id, icon, size = 256) {
    if (!icon || icon === "") {
        return getDefaultIcon(id);
    }

    if (isAnimated(icon)) {
        return `https:\/\/cdn.discordapp.com/icons/${id}/${icon}.gif?size=${size}`;
    } else {
        return `https:\/\/cdn.discordapp.com/icons/${id}/${icon.padStart(32, '0')}.webp?size=${size}`;
    }
}

export function getAvatarUrl(id, avatar, size = 256) {
    if (!avatar || avatar === "") {
        return getDefaultIcon(id);
    }

    if (isAnimated(avatar)) {
        return `https:\/\/cdn.discordapp.com/avatars/${id}/${avatar}.gif?size=${size}`;
    } else {
        return `https:\/\/cdn.discordapp.com/avatars/${id}/${avatar.padStart(32, '0')}.webp?size=${size}`;
    }
}

export function getDefaultIcon(id) {
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> BigInt(22)) % BigInt(6))}.png`
}
