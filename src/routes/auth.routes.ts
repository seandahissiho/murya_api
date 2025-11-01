import checkValidationResult, {authenticateToken} from "../utils/common";
import {validateLogin, validateRefresh} from "../middlewares/auth";
import * as authControllers from "../controllers/auth.controllers";


const router = require("express").Router();

router.post('/signup',
    // validateRegister,
    // checkValidationResult,
    authControllers.register
);

router.post('/signin',
    validateLogin,
    checkValidationResult,
    authControllers.login
);

// router.post('/signout',
//     authenticateToken,
//     authControllers.logout
// );
//
router.post('/refresh',
    validateRefresh,
    authControllers.refresh
);

router.get('/me',
    authenticateToken,
    authControllers.retrieve
);

// router.put('/me',
//     // validateUpdateMe,
//     authenticateToken,
//     authControllers.update
// );
//
// router.delete('/me',
//     authenticateToken,
//     authControllers.delete
// );


export default router;
