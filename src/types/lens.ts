export type LensId = "security" | "quality" | "tests";

export type Lens = {
    id: LensId;
    systemPrompt: string;
};
