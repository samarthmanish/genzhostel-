import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as ctrl from "../controllers/authController.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema, changePasswordSchema } from "../validators/authValidators.js";

const router = Router();

// Rate limit credential attempts to slow down brute force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Please wait 15 minutes and try again." } },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many registration attempts. Please try again later." } },
});

router.get("/config", ctrl.publicConfigHandler);
router.post("/login", loginLimiter, validate({ body: loginSchema }), ctrl.loginHandler);
router.post("/logout", ctrl.logoutHandler);
router.get("/me", authenticate, ctrl.meHandler);
router.post("/register", registerLimiter, validate({ body: registerSchema }), ctrl.registerHandler);
router.post("/change-password", authenticate, validate({ body: changePasswordSchema }), ctrl.changePasswordHandler);

export default router;
