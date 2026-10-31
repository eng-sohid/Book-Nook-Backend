import { createRemoteJWKSet, jwtVerify } from "jose";

let JWKS;

const authMiddleware = async (req, res, next) => {
  try {
    const authBaseURL = process.env.AUTH_BASE_URL || "http://localhost:3000";

    if (!JWKS) {
      JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", authBaseURL));
    }

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Unauthorized. JWT token is required.",
      });
    }

    const token = authHeader.slice(7);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authBaseURL,
    });

    if (!payload.sub || !payload.email) {
      return res.status(401).json({
        message: "Invalid token payload.",
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };

    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token.",
    });
  }
};

export default authMiddleware;
