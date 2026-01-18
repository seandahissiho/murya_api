import {Router} from "express";
import {authenticateToken} from "../utils/common";
import * as rewardsControllers from "../controllers/rewards.controllers";

const router = Router();

router.get("/reward-purchases", authenticateToken, rewardsControllers.listUserPurchases);
router.get("/reward-purchases/:id", authenticateToken, rewardsControllers.getUserPurchaseDetails);
router.get("/wallet", authenticateToken, rewardsControllers.getWallet);

export default router;
