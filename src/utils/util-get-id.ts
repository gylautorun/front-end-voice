let seq = 1;

export function getId(prefix?: string) {
    return (prefix ? prefix + '_' : '')
        + Math.random().toString(36).slice(2)
        + '_'
        + (seq++).toString(36);
}