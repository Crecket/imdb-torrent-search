const SIZE_STEPS = ["B", "KB", "MB", "GB", "TB"];

/** Byte count as a short human string, for tooltips and pack labels. */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    let value = bytes;
    let step = 0;
    while (value >= 1024 && step < SIZE_STEPS.length - 1) {
        value /= 1024;
        step += 1;
    }
    // One decimal only when it adds information: "1 KB", "1.5 MB", "2 GB".
    const rounded = value >= 10 || step === 0 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
    return `${rounded} ${SIZE_STEPS[step]}`;
}
