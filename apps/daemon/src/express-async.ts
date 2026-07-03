import type { Application, NextFunction, Request, RequestHandler, Response } from 'express';

type ExpressHandler = (...args: any[]) => unknown;

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value) && typeof (value as { then?: unknown }).then === 'function';
}

export function wrapExpressAsyncHandler<T extends ExpressHandler>(handler: T): T {
  if (handler.length >= 4) {
    return handler;
  }

  return function wrappedExpressAsyncHandler(
    this: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
  ): unknown {
    try {
      const result = handler.call(this, req, res, next);
      if (isPromiseLike(result)) {
        return result.catch(next);
      }
      return result;
    } catch (error) {
      return next(error);
    }
  } as T;
}

function wrapExpressRouteArg(arg: unknown): unknown {
  if (Array.isArray(arg)) {
    return arg.map(wrapExpressRouteArg);
  }
  if (typeof arg === 'function') {
    return wrapExpressAsyncHandler(arg as RequestHandler);
  }
  return arg;
}

export function installExpressAsyncErrorForwarding(app: Application): void {
  const methods = ['all', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'use'] as const;
  for (const method of methods) {
    const original = (app[method] as unknown as ExpressHandler).bind(app);
    (app[method] as unknown as ExpressHandler) = ((...args: unknown[]) => {
      return original(...args.map(wrapExpressRouteArg));
    }) as ExpressHandler;
  }
}
