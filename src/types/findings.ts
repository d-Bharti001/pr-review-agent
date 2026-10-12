import { z } from "zod";

// Category of a finding
export const categorySchema = z.enum(["security", "quality", "tests", "docs"]);

// Severity of a finding
export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"]);

// Most severe first
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

// A file location with line numbers related to a finding
export const locationSchema = z
    .object({
        file: z.string().describe("Path of the file, relative to the repository root"),
        startLine: z
            .number()
            .int()
            .describe("First line, 1-based, in the head version of the file"),
        endLine: z.number().int().describe("Last line, 1-based, in the head version of the file"),
    })
    .refine((l) => l.endLine >= l.startLine, {
        message: "endLine must be >= startLine",
        path: ["endLine"],
    });

// A finding
export const findingSchema = z.object({
    category: categorySchema,
    severity: severitySchema,
    locations: z
        .array(locationSchema)
        .describe(
            "Every place that shows the issue, the most important first. Empty array if the issue has no specific location.",
        ),
    title: z.string().describe("One short sentence"),
    message: z.string().describe("One short sentence explaining the issue"),
    suggestion: z
        .string()
        .describe("One sentence fix or a few short hints. Empty string if there is no suggestion."),
});

// List of findings
// Structured output must be an object at the top level, not a bare array
export const findingsResultSchema = z.object({
    findings: z.array(findingSchema),
});

// A finding as it moves through the pipeline: the LLM output plus who produced it
export const storedFindingSchema = findingSchema.extend({
    model: z.string(),
    provider: z.string(),
});

export type Category = z.infer<typeof categorySchema>;
export type Severity = z.infer<typeof severitySchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Location = z.infer<typeof locationSchema>;
export type StoredFinding = z.infer<typeof storedFindingSchema>;
