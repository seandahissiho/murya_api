import {Router} from "express";
import {authenticateToken} from "../utils/common";
import * as moduleControllers from "../controllers/modules.controllers";

const router = Router();

router.get("/modules", moduleControllers.listModules);
router.get("/users/:userId/modules", authenticateToken, moduleControllers.listUserModules);
router.get("/users/:userId/landing-modules", authenticateToken, moduleControllers.listUserLandingModules);
router.post("/users/:userId/landing-modules", authenticateToken, moduleControllers.addUserLandingModule);
router.delete(
    "/users/:userId/landing-modules/:moduleId",
    authenticateToken,
    moduleControllers.removeUserLandingModule,
);
router.put(
    "/users/:userId/landing-modules/order",
    authenticateToken,
    moduleControllers.reorderUserLandingModules,
);
router.get(
    "/users/:userId/landing-modules/audit",
    authenticateToken,
    moduleControllers.listUserLandingModulesAudit,
);

export default router;
