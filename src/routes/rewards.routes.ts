import {Router} from "express";
import {authenticateToken} from "../utils/common";
import * as rewardsControllers from "../controllers/rewards.controllers";

const router = Router();

router.get("/", authenticateToken, rewardsControllers.listRewards);
router.get("/:id", authenticateToken, rewardsControllers.getRewardDetails);
router.post("/:id/purchase", authenticateToken, rewardsControllers.purchaseReward);

export default router;
