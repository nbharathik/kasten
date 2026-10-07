// The little of jsdom the tests use, since the package has no types for it.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    readonly window: { readonly document: Document };
  }
}
