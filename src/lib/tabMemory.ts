// The bottom-nav tab the user last selected, remembered across screen pushes so returning from a
// detail lands back on the same tab (not the role default). Cleared on sign-out.
let rememberedTab: string | null = null;

export function getRememberedTab(): string | null { return rememberedTab; }
export function setRememberedTab(key: string | null): void { rememberedTab = key; }
