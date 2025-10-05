export function labelHash(str) {
    let hash = 0, i, chr;
    if (str.length === 0) return '0';
    for (i = 0; i < str.length; i++) {
        chr   = str.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}
