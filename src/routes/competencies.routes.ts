import {Router} from "express";
import * as competencyControllers from "../controllers/competencies.controllers";

const router = Router();

router.get('/', competencyControllers.searchCompetencies);
//competencies/families-subfamilies
router.get('/families-subfamilies', competencyControllers.getCompetenciesFamiliesAndSubFamilies);
//competencies/families
router.get('/families', competencyControllers.getCompetenciesFamilies);

export default router;
