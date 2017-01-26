import * as express from "express";
import * as inversify from "inversify";
import { interfaces } from "./interfaces";
import { TYPE, METADATA_KEY } from "./constants";

/**
 * Wrapper for the express server.
 */
export class InversifyExpressServer  {
    protected container: inversify.interfaces.Container;
    protected app: express.Application = express();
    protected configFn: interfaces.ConfigFunction;
    protected errorConfigFn: interfaces.ConfigFunction;

    /**
     * Wrapper for the express server.
     *
     * @param container Container loaded with all controllers and their dependencies.
     */
    constructor(container: inversify.interfaces.Container) {
        this.container = container;
    }

    /**
     * Sets the configuration function to be applied to the application.
     * Note that the config function is not actually executed until a call to InversifyExpresServer.build().
     *
     * This method is chainable.
     *
     * @param fn Function in which app-level middleware can be registered.
     */
    public setConfig(fn: interfaces.ConfigFunction): InversifyExpressServer {
        this.configFn = fn;
        return this;
    }

    /**
     * Sets the error handler configuration function to be applied to the application.
     * Note that the error config function is not actually executed until a call to InversifyExpresServer.build().
     *
     * This method is chainable.
     *
     * @param fn Function in which app-level error handlers can be registered.
     */
    public setErrorConfig(fn: interfaces.ConfigFunction): InversifyExpressServer {
        this.errorConfigFn = fn;
        return this;
    }

    /**
     * Applies all routes and configuration to the server, returning the express application.
     */
    public build(): express.Application {
        // register server-level middleware before anything else
        if (this.configFn) {
            this.configFn.apply(undefined, [this.app]);
        }

        this.registerControllers();

        // register error handlers after controllers
        if (this.errorConfigFn) {
            this.errorConfigFn.apply(undefined, [this.app]);
        }

        return this.app;
    }

    protected registerController(controller: interfaces.Controller, controllerMetadata: interfaces.ControllerMetadata) {
        this.attachMethodHandlers(controller, controllerMetadata);
    }

    protected attachMethodHandlers(controller: interfaces.Controller, controllerMetadata: interfaces.ControllerMetadata) {
        let methodMetadata: interfaces.ControllerMethodMetadata[] = Reflect.getOwnMetadata(
            METADATA_KEY.controllerMethod,
            controller.constructor
        );

        if (controllerMetadata && methodMetadata) {
            let router: express.Router = express.Router();

            methodMetadata.forEach((metadata: interfaces.ControllerMethodMetadata) => {
                let handler: express.RequestHandler = this.methodHandlerFactory(controllerMetadata.target.name, metadata.key);
                router[metadata.method](metadata.path, ...metadata.middleware, handler);
            });

            this.app.use(controllerMetadata.path, ...controllerMetadata.middleware, router);
        }
    }

    protected methodHandlerFactory(controllerName: any, key: string): express.RequestHandler {
        return (req: express.Request, res: express.Response, next: express.NextFunction) => {
            let result: any = this.container.getNamed(TYPE.Controller, controllerName)[key](req, res, next);
            // try to resolve promise
            if (result && result instanceof Promise) {

                result.then((value: any) => {
                    if (value && !res.headersSent) {
                        res.send(value);
                    }
                })
                    .catch((error: any) => {
                        next(error);
                    });

            } else if (result && !res.headersSent) {
                res.send(result);
            }
        };
    }

    private registerControllers() {

        let controllers: interfaces.Controller[] = this.container.getAll<interfaces.Controller>(TYPE.Controller);

        controllers.forEach((controller: interfaces.Controller) => {

            let controllerMetadata: interfaces.ControllerMetadata = Reflect.getOwnMetadata(
                METADATA_KEY.controller,
                controller.constructor
            );

            this.registerController(controller, controllerMetadata);
        });
    }
}
