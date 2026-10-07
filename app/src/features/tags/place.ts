// Where a tag's database opens: `#tag`, kept apart from file paths.

export const tagPlace = (tag: string) => ({ view: "tags" as const, path: `#${tag}` });
