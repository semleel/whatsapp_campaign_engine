declare module "express" {
  const exp: any;
  export = exp;
  export type Request = any;
  export type Response = any;
  export type NextFunction = (...args: any[]) => any;
}
