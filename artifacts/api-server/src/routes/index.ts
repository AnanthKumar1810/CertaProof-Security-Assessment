import { Router, type IRouter } from "express";
import healthRouter from "./health";
import certaproofRouter from "./certaproof";

const router: IRouter = Router();

router.use(healthRouter);
router.use(certaproofRouter);

export default router;
