import express = require('express')
export import STATUS_CODES = require('./status-codes')


export class Error extends global.Error {

    extra: any
    httpStatus: STATUS_CODES
    message: string

    constructor(message: string)
    constructor(httpStatus: STATUS_CODES, message: string)
    constructor(httpStatus: STATUS_CODES, extra: any, message: string)
    constructor(arg1, arg2?, arg3?) {
        let status, message, extra
        if (arg3) {
            message = arg3
            extra = arg2
            status = arg1
        } else if (arg2) {
            message = arg2
            status = arg1
        } else {
            message = arg1
        }
        super(message)
        this.extra = extra
        this.httpStatus = status
        this.message = message
        return this
    }
}


export const __construct = {
    Error,
    ensureHas(obj: object, keys: string[]) {
        keys.forEach(key => {
            if (obj[key] === undefined) {
                throw new Error(
                    400,
                    { code: 'mwvalidation', missingKey: key },
                    `Missing key - ${key} - in payload`
                );
            }
        })
    },
    send(...args) {
        return __construct.status(200, 'send', ...args)
    },
    render(...args) {
        return __construct.other('render', ...args)
    },
    status(status: STATUS_CODES, call:keyof express.Response, ...args) {
        return {
            __call__: call,
            status,
            args
        }
    },
    redirect(...args) {
        return __construct.other('redirect', ...args)
    },
    other(call:keyof express.Response, ...args) : PromiseMw2.Command {
        return {
            __call__: call,
            args
        }
    },
    next(): PromiseMw2.Command {
        return {
            __call__ : '__next__'
        }
    }
 }


export type HookFnResp = void //{ break : boolean }
export type HookFnT<T extends PromiseMw2.Command> =
    (cmd: T) => (res: express.Response, next: express.NextFunction)
    => Promise<HookFnResp>


const handleExpressCommand
    : HookFnT<PromiseMw2.Command>
    = (cmd) => async (res, next) => {
        let args = cmd.args || []
        let aux = res
        if (cmd.status) aux = res.status(cmd.status)
        aux[cmd.__call__](...args)
    }


export type mwGenerateFnT =
    (req: express.Request, helper: typeof __construct) => Promise<PromiseMw2.Command>


export const middlewareFrom
    : (handler: mwGenerateFnT) => express.RequestHandler
    = (handler) => async (req, res, next) => {
        try {
            let cmd = await handler(req, __construct)
            if (cmd.__call__ !== '__next__') handleExpressCommand(cmd)(res, next)
            else next()
        } catch (err) {
            next(err)
        }
    }


const methods = ['all', 'get', 'post', 'put', 'delete', 'patch', 'options', 'head',
    'checkout', 'copy', 'lock', 'merge', 'mkactivity', 'mkcol', 'move', 'm-search',
    'notify', 'purge', 'report', 'search', 'subscribe', 'trace', 'unlock', 'unsubscribe']

export type methodsT = 'all'| 'get'| 'post'| 'put'| 'delete'| 'patch'| 'options'| 'head'|
    'checkout'| 'copy'| 'lock'| 'merge'| 'mkactivity'| 'mkcol'| 'move'| 'm-search'|
    'notify'| 'purge'| 'report'| 'search'| 'subscribe'| 'trace'| 'unlock'| 'unsubscribe'

export type pmwMatcher = (path: string, ...handlers: mwGenerateFnT[]) => void
export type pmwMatcher2 = (...handlers: mwGenerateFnT[]) => void
export type wrapT =
    {[methods in methodsT]: pmwMatcher; } &
    { use: pmwMatcher | pmwMatcher2 } &
    { route: (param) => { [keys in methodsT]: pmwMatcher2 } }

const __wrapCache : Map<object, wrapT> = new Map()

export function wrap(app: express.Application | express.Router): wrapT {
    let find = __wrapCache.get(app)
    if (find) return find

    let out: wrapT = {} as any
    let routeproto: any = {}
    methods.forEach(method => {
        let matcher = (path, ...handlers) => {
            let expHandlers = handlers.map(middlewareFrom)
            app[method](path, ...expHandlers)
        }

        out[method] = (path, ...handlers) => matcher(path, ...handlers)

        routeproto[method] = (...handlers) => {
            this.expRouter[method]( ...handlers.map(middlewareFrom) )
        }
    })

    out.route = (route: string) => {
        let obj : any = { __proto__: routeproto }
        obj.expRouter = app.route(route)
        return obj
    }

    out.use = (...args) => {
        let path: string | undefined
        let expMiddlewares: express.RequestHandler[]
        if (typeof args[0] === 'string') {
            path = args[0] as string
            expMiddlewares = args.slice(1).map(middlewareFrom)
            app.use(path, ...(args.slice(1)))
        } else {
            expMiddlewares = args.map(middlewareFrom)
            app.use(...expMiddlewares)
        }
    }

    __wrapCache.set(app, out)
    return out
}