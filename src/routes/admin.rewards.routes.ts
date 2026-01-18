import {Router} from "express";
import {authenticateToken, requireAdmin} from "../utils/common";
import * as adminRewardsControllers from "../controllers/admin.rewards.controllers";

const router = Router();

router.use(authenticateToken, requireAdmin);

router.post("/rewards", adminRewardsControllers.createReward);
router.patch("/rewards/:id", adminRewardsControllers.updateReward);
router.post("/rewards/:id/stock", adminRewardsControllers.adjustRewardStock);
router.post("/addresses", adminRewardsControllers.createAddress);
router.patch("/reward-purchases/:id/mark-ready", adminRewardsControllers.markPurchaseReady);
router.post("/reward-purchases/:id/refund", adminRewardsControllers.refundPurchase);

export default router;
